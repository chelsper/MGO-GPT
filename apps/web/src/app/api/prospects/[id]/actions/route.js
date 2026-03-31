import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  buildBlackbaudActionPayload,
  createBlackbaudAction,
  getBlackbaudAction,
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

function getBlackbaudActionConstituentId(payload) {
  return (
    payload?.constituent_id ||
    payload?.constituent?.id ||
    payload?.constituent?.constituent_id ||
    payload?.value?.constituent_id ||
    payload?.value?.constituent?.id ||
    payload?.value?.constituent?.constituent_id ||
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

    let blackbaudAction = null;
    const linkedBlackbaudConstituentId =
      prospect.linked_blackbaud_constituent_id ||
      prospect.blackbaud_constituent_id ||
      null;

    if (linkedBlackbaudConstituentId) {
      const origin = new URL(request.url).origin;
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
          authorName: user.name,
          opportunityId: linkedOpportunity?.blackbaud_opportunity_id || undefined,
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
        try {
          const verifiedAction = await getBlackbaudAction({
            userId: user.id,
            authUserId: sessionUser?.id || user.id,
            origin,
            actionId: createdActionId,
          });
          const verifiedConstituentId = getBlackbaudActionConstituentId(verifiedAction);
          if (
            verifiedConstituentId &&
            String(verifiedConstituentId) !== String(linkedBlackbaudConstituentId)
          ) {
            blackbaudAction = {
              ...blackbaudAction,
              error: `NXT created the action on constituent ${verifiedConstituentId}, expected ${linkedBlackbaudConstituentId}`,
            };
          } else {
            blackbaudAction = {
              ...blackbaudAction,
              verifiedActionId: String(createdActionId),
              verifiedConstituentId:
                verifiedConstituentId != null
                  ? String(verifiedConstituentId)
                  : null,
            };
          }
        } catch (verificationError) {
          blackbaudAction = {
            ...blackbaudAction,
            error:
              verificationError instanceof Error
                ? `NXT action create could not be verified: ${verificationError.message}`
                : "NXT action create could not be verified",
          };
        }
      }

      if (blackbaudAction?.error) {
        return Response.json(
          {
            error: `Could not create NXT action: ${blackbaudAction.error}`,
          },
          { status: 502 },
        );
      }

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
        action_type,
        blackbaud_action_id,
        blackbaud_sync_variant,
        blackbaud_sync_warning
      )
      VALUES (
        ${prospectId},
        ${actionDate},
        ${updateNotes},
        ${normalizeActionLabel(summary) || "Action logged"},
        ${normalizeActionLabel(actionCategory)},
        ${normalizeActionLabel(interactionType)},
        ${getBlackbaudActionId(blackbaudAction) ? String(getBlackbaudActionId(blackbaudAction)) : null},
        ${blackbaudAction?.syncVariant || null},
        ${blackbaudAction?.syncWarning || null}
      )
      RETURNING *
    `;
    const savedUpdate = updateRows[0] || null;

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
