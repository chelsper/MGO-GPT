import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

// GET prospect summary stats for dashboard
export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({
        activeCount: 0,
        totalAskPipeline: 0,
        closedThisFY: 0,
      });
    }

    // Count active prospects
    const activeResult = await sql`
      SELECT
        COUNT(*) as active_count,
        COALESCE(SUM(ask_amount), 0) as total_pipeline
      FROM prospects
      WHERE user_id = ${user.id} AND status = 'Active'
    `;

    // Calculate current fiscal year window (July 1 - June 30)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const fiscalStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
    const fiscalEndYear = fiscalStartYear + 1;
    const currentFY = `FY${String(fiscalEndYear).slice(-2)}`;
    const fiscalYearStart = `${fiscalStartYear}-07-01`;
    const fiscalYearEnd = `${fiscalEndYear}-06-30`;

    // Funded revenue this FY should come from funded opportunities, not prospect rollups.
    // Imported NXT data can lag on local status normalization, so use funded fields first
    // and fall back to the estimated amount only when the row is explicitly secured.
    const closedResult = await sql`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(po.closed_amount, 0) > 0 THEN COALESCE(po.closed_amount, 0)
              WHEN po.opportunity_status = 'Closed – Gift Secured' THEN COALESCE(po.estimated_amount, 0)
              ELSE 0
            END
          ),
          0
        ) AS closed_total
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE p.user_id = ${user.id}
        AND po.close_date IS NOT NULL
        AND po.close_date >= ${fiscalYearStart}
        AND po.close_date <= ${fiscalYearEnd}
        AND (
          COALESCE(po.closed_amount, 0) > 0
          OR po.opportunity_status = 'Closed – Gift Secured'
        )
    `;

    return Response.json({
      activeCount: parseInt(activeResult[0].active_count) || 0,
      totalAskPipeline: parseFloat(activeResult[0].total_pipeline) || 0,
      closedThisFY: parseFloat(closedResult[0].closed_total) || 0,
      currentFY,
    });
  } catch (error) {
    console.error("Error fetching prospect summary:", error);
    return Response.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
