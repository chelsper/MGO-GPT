import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

export const dynamic = "force-dynamic";

export function getFiscalYearWindow(now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 6 ? currentYear : currentYear - 1;
  const endYear = startYear + 1;

  return {
    label: `FY${String(endYear).slice(-2)}`,
    startsOn: `${startYear}-07-01`,
    endsOn: `${endYear}-06-30`,
  };
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getCurrentUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getReportAccessForUser(EXECUTIVE_TEAM_STANDINGS_REPORT_KEY, user);
    if (!access.canView) {
      return Response.json(
        { error: "You do not have access to Executive Team Standings." },
        { status: 403 },
      );
    }

    const fiscalYear = getFiscalYearWindow();
    const rows = await sql`
      WITH active_mgos AS (
        SELECT id, name, email
        FROM users
        WHERE active = TRUE
          AND LOWER(role) = 'mgo'
      ),
      prospect_metrics AS (
        SELECT
          p.user_id,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(p.status, '')) = 'active'
          )::INTEGER AS active_prospects,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(p.status, '')) = 'active'
              AND NULLIF(BTRIM(p.next_action_text), '') IS NOT NULL
              AND p.next_action_completed_at IS NULL
          )::INTEGER AS prospects_with_next_steps,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(p.status, '')) = 'active'
              AND NULLIF(BTRIM(p.next_action_text), '') IS NOT NULL
              AND p.next_action_completed_at IS NULL
              AND p.next_action_due_date < CURRENT_DATE
          )::INTEGER AS overdue_next_steps
        FROM prospects p
        GROUP BY p.user_id
      ),
      opportunity_metrics AS (
        SELECT
          p.user_id,
          COALESCE(SUM(COALESCE(po.estimated_amount, 0)) FILTER (
            WHERE LOWER(COALESCE(po.opportunity_status, '')) = 'active'
          ), 0) AS open_pipeline,
          COALESCE(SUM(COALESCE(NULLIF(po.closed_amount, 0), po.estimated_amount, 0)) FILTER (
            WHERE LOWER(COALESCE(po.opportunity_status, '')) IN (
              'closed - gift secured',
              'closed – gift secured',
              'funded'
            )
              AND COALESCE(po.close_date, DATE(po.updated_at)) >= CAST(${fiscalYear.startsOn} AS DATE)
              AND COALESCE(po.close_date, DATE(po.updated_at)) <= CAST(${fiscalYear.endsOn} AS DATE)
          ), 0) AS funded_this_fiscal_year
        FROM prospects p
        LEFT JOIN prospect_opportunities po ON po.prospect_id = p.id
        GROUP BY p.user_id
      )
      SELECT
        m.id AS user_id,
        m.name,
        m.email,
        COALESCE(pm.active_prospects, 0)::INTEGER AS active_prospects,
        COALESCE(pm.prospects_with_next_steps, 0)::INTEGER AS prospects_with_next_steps,
        COALESCE(pm.overdue_next_steps, 0)::INTEGER AS overdue_next_steps,
        COALESCE(om.open_pipeline, 0) AS open_pipeline,
        COALESCE(om.funded_this_fiscal_year, 0) AS funded_this_fiscal_year
      FROM active_mgos m
      LEFT JOIN prospect_metrics pm ON pm.user_id = m.id
      LEFT JOIN opportunity_metrics om ON om.user_id = m.id
      ORDER BY LOWER(COALESCE(NULLIF(BTRIM(m.name), ''), m.email)), m.id
    `;

    const standings = rows.map((row) => ({
      userId: Number(row.user_id),
      name: row.name || row.email || "Unnamed MGO",
      email: row.email || "",
      activeProspects: asNumber(row.active_prospects),
      openPipeline: asNumber(row.open_pipeline),
      fundedThisFiscalYear: asNumber(row.funded_this_fiscal_year),
      prospectsWithNextSteps: asNumber(row.prospects_with_next_steps),
      overdueNextSteps: asNumber(row.overdue_next_steps),
    }));

    return Response.json(
      {
        fiscalYear,
        source: "JUMGOGPT portfolio, opportunity, and next-step records",
        generatedAt: new Date().toISOString(),
        standings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load executive team standings:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load Executive Team Standings." },
      { status: 500 },
    );
  }
}
