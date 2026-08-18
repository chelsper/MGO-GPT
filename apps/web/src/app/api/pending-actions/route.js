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
    const requestedStatus = url.searchParams.get("status");
    const status = requestedStatus === "all" ? null : requestedStatus || "Open";
    const category = url.searchParams.get("category");
    const prospectId = url.searchParams.get("prospectId");
    const constituentId = url.searchParams.get("constituentId");

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
        AND (${category || null}::TEXT IS NULL OR pa.category = ${category || null})
        AND (${prospectId || null}::BIGINT IS NULL OR pa.prospect_id = ${prospectId || null})
        AND (${constituentId || null}::BIGINT IS NULL OR pa.constituent_id = ${constituentId || null})
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

    const { workspaceUser: user, sessionUser } = await getWorkspaceUser(session, request);
    const body = await request.json();

    const prospectId = Number(body?.prospectId);
    const constituentId = body?.constituentId;
    const hasProspectId = Number.isInteger(prospectId) && prospectId > 0;
    const hasConstituentId = Boolean(String(constituentId || "").trim());

    if (!String(body?.title || "").trim() || (!hasProspectId && !hasConstituentId)) {
      return Response.json(
        { error: "A constituent or prospect and title are required" },
        { status: 400 },
      );
    }

    if (hasProspectId) {
      const prospectRows = await sql`
        SELECT id
        FROM prospects
        WHERE id = ${prospectId}
          AND user_id = ${user.id}
        LIMIT 1
      `;
      if (!prospectRows[0]) {
        return Response.json({ error: "Prospect not found" }, { status: 404 });
      }
    }

    const result = await syncPrimaryPendingAction({
      ownerUserId: user.id,
      prospectId: hasProspectId ? prospectId : null,
      constituentId: hasConstituentId ? constituentId : null,
      prospectOpportunityId: body.prospectOpportunityId || null,
      title: body.title,
      details: body.details || null,
      dueDate: body.dueDate || null,
      category: body.category || "General",
      completedAt: body.status === "Done" ? new Date().toISOString() : null,
      needsDiscussion: Boolean(body.needsDiscussion),
      discussionNote: body.discussionNote || null,
    });

    if (result?.prospect_id && result.is_primary) {
      await sql`
        UPDATE prospects
        SET
          next_action_text = ${result.status === "Open" ? result.title : null},
          next_action_due_date = ${result.status === "Open" ? result.due_date : null},
          next_action_completed_at = ${result.status === "Done" ? result.completed_at || new Date().toISOString() : null},
          updated_at = NOW()
        WHERE id = ${result.prospect_id}
          AND user_id = ${user.id}
      `;
    }

    const discussionItemId = await syncPendingActionDiscussion({
      ownerUserId: user.id,
      createdByUserId: sessionUser?.id || user.id,
      pendingActionId: result?.id,
      prospectId: result?.prospect_id || (hasProspectId ? prospectId : null),
      constituentId: result?.constituent_id || (hasConstituentId ? constituentId : null),
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
