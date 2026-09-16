import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { canEditWorkspace } from "@/utils/workspaceRoles";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    await ensureAppSchema();
    const context = await getWorkspaceUser(session, request);
    const { workspaceUser, sessionUser, isActing, invalidActingUserId } = context;
    if (!workspaceUser?.id || invalidActingUserId) {
      return Response.json({ error: "This workspace is unavailable. Return to your dashboard and select a workspace." }, { status: 403, headers });
    }
    const status = new URL(request.url).searchParams.get("status") || "Open";
    if (!["Open", "Done"].includes(status)) {
      return Response.json({ error: "Invalid next-step status" }, { status: 400, headers });
    }

    // One saved-data query includes portfolio-only and stewardship work, even
    // when a linked prospect is closed. No NXT enrichment is needed here.
    const items = await sql`
      SELECT pa.id, pa.title, pa.details, pa.due_date, pa.status, pa.category,
        pa.is_primary, pa.completed_at, pa.updated_at::text AS updated_at,
        p.id AS prospect_id, p.prospect_name,
        c.id AS constituent_id, c.name AS constituent_name,
        c.blackbaud_constituent_id,
        po.title AS opportunity_title,
        di.id AS discussion_item_id, di.status AS discussion_status
      FROM pending_actions pa
      LEFT JOIN prospects p ON p.id = pa.prospect_id AND p.user_id = pa.owner_user_id
      LEFT JOIN constituents c ON c.id = pa.constituent_id AND c.user_id = pa.owner_user_id
      LEFT JOIN prospect_opportunities po ON po.id = pa.prospect_opportunity_id AND po.prospect_id = p.id
      LEFT JOIN discussion_items di ON di.id = pa.discussion_item_id AND (
        di.owner_user_id = ${workspaceUser.id} OR di.assigned_user_id = ${workspaceUser.id}
        OR EXISTS (SELECT 1 FROM discussion_item_participants dip
          WHERE dip.discussion_item_id = di.id AND dip.user_id = ${workspaceUser.id})
      )
      WHERE pa.owner_user_id = ${workspaceUser.id} AND pa.status = ${status}
      ORDER BY pa.due_date ASC NULLS LAST, pa.id ASC
    `;
    return Response.json({
      items,
      asOf: getStandingsPeriods().asOf,
      workspace: { id: workspaceUser.id, name: workspaceUser.name, isActing: Boolean(isActing), canEdit: canEditWorkspace(context) },
      viewerId: sessionUser.id,
    }, { headers });
  } catch (error) {
    console.error("Error reading saved next steps:", error);
    return Response.json({ error: "Next steps could not be loaded. Please try again." }, { status: 500, headers });
  }
}
