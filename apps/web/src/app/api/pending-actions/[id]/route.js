import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { syncPendingActionDiscussion } from "@/app/api/utils/pendingActions";

export async function PUT(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser } = await getWorkspaceUser(session, request);
    const body = await request.json();
    const pendingActionId = params.id;

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
        details = COALESCE(${body.details ?? null}, details),
        due_date = COALESCE(${body.dueDate ?? null}, due_date),
        status = COALESCE(${body.status ?? null}, status),
        is_primary = COALESCE(${body.isPrimary ?? null}, is_primary),
        needs_discussion = COALESCE(${body.needsDiscussion ?? null}, needs_discussion),
        discussion_note = COALESCE(${body.discussionNote ?? null}, discussion_note),
        prospect_opportunity_id = COALESCE(${body.prospectOpportunityId ?? null}, prospect_opportunity_id),
        completed_at = CASE
          WHEN ${body.status ?? null} = 'Done' THEN COALESCE(completed_at, NOW())
          WHEN ${body.status ?? null} = 'Open' THEN NULL
          ELSE completed_at
        END,
        updated_at = NOW()
      WHERE id = ${pendingActionId}
        AND owner_user_id = ${user.id}
      RETURNING *
    `;

    const updated = rows[0] || null;

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
    });

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
