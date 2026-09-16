import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import workspaceWritePermissionError from "@/app/api/utils/workspaceWritePermission";
import sql from "@/app/api/utils/sql";
import { syncPendingActionDiscussion } from "@/app/api/utils/pendingActions";
import { clearUserDashboardDataCaches } from "@/app/api/utils/userDataCache";

export async function PUT(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await getWorkspaceUser(session, request);
    const permissionError = workspaceWritePermissionError(context);
    if (permissionError) return permissionError;
    const { workspaceUser: user, sessionUser } = context;
    const body = await request.json();
    const pendingActionId = params.id;
    if (body.expectedWorkspaceId !== undefined && String(body.expectedWorkspaceId) !== String(user.id)) {
      return Response.json({ error: "The selected workspace changed. Reload the list before saving." }, { status: 409 });
    }
    if (body.expectedUpdatedAt !== undefined && (typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt || Number.isNaN(new Date(body.expectedUpdatedAt).getTime()))) {
      return Response.json({ error: "Reload this next step before saving." }, { status: 400 });
    }

    const existing = await sql`
      SELECT *
      FROM pending_actions
      WHERE id = ${pendingActionId}
        AND owner_user_id = ${user.id}
      LIMIT 1
    `;

    if (!existing.length) {
      return Response.json({ error: "Pending action not found" }, { status: 404 });
    }

    const rows = await sql`
      UPDATE pending_actions
      SET
        title = COALESCE(${body.title ?? null}, title),
        details = CASE WHEN ${Object.hasOwn(body, "details")} THEN ${body.details ?? null} ELSE details END,
        due_date = CASE WHEN ${Object.hasOwn(body, "dueDate")} THEN ${body.dueDate || null}::date ELSE due_date END,
        category = COALESCE(${body.category ?? null}, category),
        status = COALESCE(${body.status ?? null}, status),
        is_primary = COALESCE(${body.isPrimary ?? null}, is_primary),
        needs_discussion = COALESCE(${body.needsDiscussion ?? null}, needs_discussion),
        discussion_note = CASE WHEN ${Object.hasOwn(body, "discussionNote")} THEN ${body.discussionNote ?? null} ELSE discussion_note END,
        prospect_opportunity_id = COALESCE(${body.prospectOpportunityId ?? null}, prospect_opportunity_id),
        completed_at = CASE
          WHEN ${body.status ?? null} = 'Done' THEN COALESCE(completed_at, NOW())
          WHEN ${body.status ?? null} = 'Open' THEN NULL
          ELSE completed_at
        END,
        updated_at = NOW()
      WHERE id = ${pendingActionId}
        AND owner_user_id = ${user.id}
        AND (${body.expectedUpdatedAt ?? null}::timestamptz IS NULL OR updated_at = ${body.expectedUpdatedAt ?? null}::timestamptz)
      RETURNING *
    `;

    const updated = rows[0] || null;
    if (!updated) return Response.json({ error: "This next step changed while you were editing. Your draft has not been saved. Reload the list to review the current version." }, { status: 409 });

    if (updated?.prospect_id && updated.is_primary) {
      await sql`
        UPDATE prospects
        SET
          next_action_text = ${updated.status === "Open" ? updated.title : null},
          next_action_due_date = ${updated.status === "Open" ? updated.due_date : null},
          next_action_completed_at = ${updated.status === "Done" ? updated.completed_at || new Date().toISOString() : null},
          updated_at = NOW()
        WHERE id = ${updated.prospect_id}
          AND user_id = ${user.id}
      `;
    }

    const discussionItemId = await syncPendingActionDiscussion({
      ownerUserId: user.id,
      createdByUserId: sessionUser?.id || user.id,
      pendingActionId: updated?.id,
      prospectId: updated?.prospect_id || null,
      constituentId: updated?.constituent_id || null,
      title: updated?.title,
      dueDate: updated?.due_date || null,
      needsDiscussion: Boolean(updated?.needs_discussion),
      discussionNote: updated?.discussion_note || null,
      existingDiscussionItemId: updated?.discussion_item_id || existing[0]?.discussion_item_id || null,
      reopenExisting: Boolean(updated?.needs_discussion) && !existing[0]?.needs_discussion,
    });

    await clearUserDashboardDataCaches(user.id);

    return Response.json({
      ...updated,
      discussion_item_id: discussionItemId,
    });
  } catch (error) {
    console.error("Error updating pending action:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update pending action" },
      { status: 500 },
    );
  }
}
