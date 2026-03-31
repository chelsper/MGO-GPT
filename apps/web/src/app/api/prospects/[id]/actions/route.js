import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  buildBlackbaudActionPayload,
  buildBlackbaudActionUpdatePayload,
  createBlackbaudAction,
  findBlackbaudConstituentByLookupId,
  updateBlackbaudAction,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { syncPrimaryPendingAction } from "@/app/api/utils/pendingActions";

function formatActionUpdateNotes({
  notes,
  nextStep,
}) {
  const parts = [
    notes?.trim() || null,
    nextStep?.trim() ? `Next step: ${nextStep.trim()}` : null,
  ].filter(Boolean);

  return parts.join("\n\n");
}

function normalizeActionLabel(value) {
  const text = String(value || "").trim();
  return text || null;
}

function getBlackbaudActionId(payload) {
  return (
    payload?.id ||
    payload?.action_id ||
    payload?.constituent_action_id ||
    payload?.value?.id ||
    payload?.value?.action_id ||
    payload?.value?.constituent_action_id ||
    null
  );
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const prospectId = params.id;
    const body = await request.json();
    const {
      actionDate,
      actionCategory,
      interactionType,
      summary,
      notes,
      nextStep,
      nextActionDueDate,
      linkedOpportunityId,
    } = body || {};

    if (!actionDate) {
      return Response.json({ error: "Action date is required" }, { status: 400 });
    }

    if (!summary?.trim() && !notes?.trim()) {
      return Response.json(
        { error: "Add a short action summary or notes." },
        { status: 400 },
      );
    }

    const prospectRows = await sql`
      SELECT
        p.*,
        c.blackbaud_constituent_id AS linked_blackbaud_constituent_id
      FROM prospects p
      LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE p.id = ${prospectId} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const prospect = prospectRows[0] || null;
    if (!prospect) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    let linkedOpportunity = null;
    if (linkedOpportunityId) {
      const opportunityRows = await sql`
        SELECT po.*
        FROM prospect_opportunities po
        INNER JOIN prospects p ON p.id = po.prospect_id
        WHERE po.id = ${linkedOpportunityId} AND p.user_id = ${user.id}
        LIMIT 1
      `;
      linkedOpportunity = opportunityRows[0] || null;
    }

    const updateNotes = formatActionUpdateNotes({
      notes,
      nextStep,
    });

    const updateRows = await sql`
      INSERT INTO prospect_updates (
        prospect_id,
        update_date,
        update_notes,
        update_title,
        action_category,
        action_type
      )
      VALUES (
        ${prospectId},
        ${actionDate},
        ${updateNotes},
        ${normalizeActionLabel(summary) || "Action logged"},
        ${normalizeActionLabel(actionCategory)},
        ${normalizeActionLabel(interactionType)}
      )
      RETURNING *
    `;
    let savedUpdate = updateRows[0] || null;

    const nextActionText = nextStep?.trim() || null;
    await sql`
      UPDATE prospects
      SET
        next_action_text = ${nextActionText},
        next_action_due_date = ${nextActionText ? nextActionDueDate || null : null},
        next_action_completed_at = ${nextActionText ? null : prospect.next_action_completed_at},
        updated_at = NOW()
      WHERE id = ${prospectId}
    `;

    await syncPrimaryPendingAction({
      ownerUserId: user.id,
      prospectId: Number(prospectId),
      constituentId: prospect.constituent_id || null,
      prospectOpportunityId: linkedOpportunity?.id || null,
      title: nextActionText,
      dueDate: nextActionText ? nextActionDueDate || null : null,
      completedAt: nextActionText ? null : prospect.next_action_completed_at,
    });

    let blackbaudAction = null;
    const linkedBlackbaudConstituentId =
      prospect.linked_blackbaud_constituent_id ||
      prospect.blackbaud_constituent_id ||
      null;

    if (linkedBlackbaudConstituentId) {
      const origin = new URL(request.url).origin;
      let actionFundraiserBlackbaudId =
        user.blackbaud_constituent_id || null;

      if (user.blackbaud_lookup_id) {
        const resolvedFundraiser = await findBlackbaudConstituentByLookupId({
          userId: user.id,
          authUserId: sessionUser?.id || user.id,
          origin,
          lookupId: user.blackbaud_lookup_id,
        }).catch(() => null);

        actionFundraiserBlackbaudId =
          resolvedFundraiser?.blackbaudConstituentId ||
          actionFundraiserBlackbaudId;
      }

      blackbaudAction = await createBlackbaudAction({
        userId: user.id,
        authUserId: sessionUser?.id || user.id,
        origin,
        payload: buildBlackbaudActionPayload({
          blackbaudConstituentId: linkedBlackbaudConstituentId,
          actionDate,
          actionCategory,
          summary: summary || `${prospect.prospect_name} action`,
          actionNotes: notes,
          nextStep,
          interactionType,
          authorName: user.name,
          opportunityId: linkedOpportunity?.blackbaud_opportunity_id || undefined,
          fundraiserBlackbaudId: actionFundraiserBlackbaudId,
        }),
      }).catch((error) => ({
        error: error instanceof Error ? error.message : "Failed to sync action to Blackbaud",
      }));

      const createdActionId = getBlackbaudActionId(blackbaudAction);

      if (!blackbaudAction?.error && !createdActionId) {
        blackbaudAction = {
          ...blackbaudAction,
          error: "Blackbaud action sync returned no action id",
        };
      }

      if (!blackbaudAction?.error && createdActionId) {
        const updatePayload = buildBlackbaudActionUpdatePayload({
          actionDate,
          actionCategory,
          interactionType,
          fundraiserBlackbaudId: actionFundraiserBlackbaudId,
        });

        try {
          const patchedAction = await updateBlackbaudAction({
            userId: user.id,
            authUserId: sessionUser?.id || user.id,
            origin,
            actionId: createdActionId,
            payload: updatePayload,
          });

          blackbaudAction = {
            ...blackbaudAction,
            ...patchedAction,
            syncPatched: true,
          };
        } catch (patchError) {
          blackbaudAction = {
            ...blackbaudAction,
            syncPatched: false,
            syncWarning:
              patchError instanceof Error
                ? patchError.message
                : "Created in NXT, but follow-up action update failed",
          };
        }
      }
    }

    if (savedUpdate) {
      const syncedActionId = getBlackbaudActionId(blackbaudAction);
      const updatedRows = await sql`
        UPDATE prospect_updates
        SET
          blackbaud_action_id = ${syncedActionId ? String(syncedActionId) : null},
          blackbaud_sync_variant = ${blackbaudAction?.syncVariant || null},
          blackbaud_sync_warning = ${blackbaudAction?.error || blackbaudAction?.syncWarning || null}
        WHERE id = ${savedUpdate.id}
        RETURNING *
      `;
      savedUpdate = updatedRows[0] || savedUpdate;
    }

    return Response.json(
      {
        update: savedUpdate,
        blackbaudAction,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating prospect action:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create prospect action",
      },
      { status: 500 },
    );
  }
}
