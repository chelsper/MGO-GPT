import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

async function getUser(session) {
  const email = session.user.email;
  const existing =
    await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) return existing[0];
  return null;
}

// GET prospect summary stats for dashboard
export async function GET(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUser(session);
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

    // Calculate current fiscal year (July 1 - June 30)
    // FY26 = July 1 2025 - June 30 2026
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentYear = now.getFullYear();
    const fyYear = currentMonth >= 6 ? currentYear + 1 : currentYear;
    const currentFY = "FY" + fyYear.toString().slice(-2);

    // Closed gifts this FY
    const closedResult = await sql`
      SELECT COALESCE(SUM(closed_amount), 0) as closed_total
      FROM prospects
      WHERE user_id = ${user.id}
        AND status = 'Closed – Gift Secured'
        AND expected_close_fy = ${currentFY}
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
