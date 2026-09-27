import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getReportAccessForUser } from "@/app/api/utils/reportAccess";
import sql from "@/app/api/utils/sql";
import { buildPipelineReport, PIPELINE_REPORT_KEY } from "@/utils/pipelineReport";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export const PIPELINE_ROW_LIMIT = 20000;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    await ensureAppSchema();
    const user = await getOrCreateUser(session, "admin");
    if (!user || user.active === false) return Response.json({ error: "Inactive account" }, { status: 403, headers });
    const access = await getReportAccessForUser(PIPELINE_REPORT_KEY, user);
    if (!access.canView) return Response.json({ error: "You do not have access to the overall opportunity pipeline." }, { status: 403, headers });

    // Saved app rows only. No NXT reads, report refresh, notes, or contact data.
    // Do not filter by active staff/prospect: that would silently lose history.
    const rows = await sql`
      SELECT po.id, po.title, po.current_stage, po.opportunity_status,
        po.estimated_amount, po.closed_amount, po.expected_date, po.close_date,
        po.blackbaud_opportunity_id, po.shared_opportunity_key, po.joint_mgo_user_ids,
        po.updated_at, po.nxt_checked_at,
        p.user_id, p.status AS prospect_status, p.prospect_name,
        COALESCE(NULLIF(BTRIM(p.blackbaud_constituent_id), ''), c.blackbaud_constituent_id) AS blackbaud_constituent_id,
        c.name AS constituent_name
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      LEFT JOIN constituents c ON c.id = COALESCE(po.constituent_id, p.constituent_id)
      ORDER BY po.id
      LIMIT ${PIPELINE_ROW_LIMIT + 1}
    `;
    if (rows.length > PIPELINE_ROW_LIMIT) return Response.json({ error: "This pipeline exceeds the supported report size. Ask an administrator to enable a larger paged report; no partial totals are shown." }, { status: 422, headers });
    const users = rows.length ? await sql`SELECT id, name FROM users ORDER BY id` : [];
    return Response.json({ ...buildPipelineReport(rows, users), title: access.title || "Opportunity Pipeline" }, { headers });
  } catch {
    console.error("Opportunity pipeline read failed");
    return Response.json({ error: "The saved pipeline could not be loaded. Please try again." }, { status: 500, headers });
  }
}
