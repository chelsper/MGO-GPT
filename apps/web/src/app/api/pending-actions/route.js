import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  syncPendingActionDiscussion,
  syncPrimaryPendingAction,
} from "@/app/api/utils/pendingActions";

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser } = await getWorkspaceUser(session, request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "Open";
    const prospectId = url.searchParams.get("prospectId");

    const rows = await sql`
      SELECT
        pa.*,
        p.prospect_name,
        po.title AS opportunity_title
      FROM pending_actions pa
      LEFT JOIN prospects p ON p.id = pa.prospect_id
      LEFT JOIN prospect_opportunities po ON po.id = pa.prospect_opportunity_id
      WHERE pa.owner_user_id = ${user.id}
        AND (${status}::TEXT IS NULL OR pa.status = ${status})
        AND (${prospectId || null}::BIGINT IS NULL OR pa.prospect_id = ${prospectId || null})
      ORDER BY
        CASE WHEN pa.status = 'Open' THEN 0 ELSE 1 END,
        CASE WHEN pa.is_primary THEN 0 ELSE 1 END,
        pa.due_date ASC NULLS LAST,
        pa.updated_at DESC
    `;

    return Response.json(rows);
  } catch (error) {
    console.error("Error fetching pending actions:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pending actions" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    const body = await request.json();

    if (!body?.prospectId || !String(body?.title || "").trim()) {
      return Response.json(
        { error: "prospectId and title are required" },
        { status: 400 },
      );
    }

    const result = await syncPrimaryPendingAction({
      ownerUserId: user.id,
      prospectId: Number(body.prospectId),
      constituentId: body.constituentId || null,
      prospectOpportunityId: body.prospectOpportunityId || null,
      title: body.title,
      details: body.details || null,
      dueDate: body.dueDate || null,
      completedAt: body.status === "Done" ? new Date().toISOString() : null,
      needsDiscussion: Boolean(body.needsDiscussion),
      discussionNote: body.discussionNote || null,
    });

    const discussionItemId = await syncPendingActionDiscussion({
      ownerUserId: user.id,
      createdByUserId: sessionUser?.id || user.id,
      pendingActionId: result?.id,
      prospectId: result?.prospect_id || Number(body.prospectId),
      constituentId: result?.constituent_id || body.constituentId || null,
      title: result?.title || body.title,
      dueDate: result?.due_date || body.dueDate || null,
      needsDiscussion: Boolean(result?.needs_discussion),
      discussionNote: result?.discussion_note || body.discussionNote || null,
      existingDiscussionItemId: result?.discussion_item_id || null,
    });

    return Response.json(
      {
        ...result,
        discussion_item_id: discussionItemId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating pending action:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create pending action" },
      { status: 500 },
    );
  }
}
