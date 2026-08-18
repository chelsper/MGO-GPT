import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getClosedFiscalYearSummary } from "@/app/api/utils/closedFyGiftTotals";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getNxtActionSummaryByWorkspaceUser } from "@/app/api/utils/nxtActionTotals";
import {
  getCachedReportSnapshot,
  getReportCacheHeaders,
  saveReportSnapshot,
  shouldBypassReportCache,
} from "@/app/api/utils/reportCache";
import sql from "@/app/api/utils/sql";
import {
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

export const dynamic = "force-dynamic";
const TREND_WINDOW_DAYS = 7;
export const EXECUTIVE_TEAM_STANDINGS_CACHE_KEY = "report:executive-team-standings";

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

function asText(value) {
  return String(value || "").trim();
}

async function getCurrentUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, worker),
  );
  return results;
}

export async function buildExecutiveTeamStandingsPayload({ authUser, origin }) {
  const fiscalYear = getFiscalYearWindow();
  const rows = await sql`
    WITH active_mgos AS (
      SELECT
        id,
        name,
        email,
        blackbaud_constituent_id,
        blackbaud_lookup_id,
        blackbaud_fundraiser_alias_ids
      FROM users
      WHERE active = TRUE
        AND POSITION(',mgo,' IN ',' || REPLACE(LOWER(COALESCE(role, '')), ' ', '') || ',') > 0
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
        ), 0) AS open_pipeline
      FROM prospects p
      LEFT JOIN prospect_opportunities po ON po.prospect_id = p.id
      GROUP BY p.user_id
    )
    SELECT
      m.id AS user_id,
      m.name,
      m.email,
      m.blackbaud_constituent_id,
      m.blackbaud_lookup_id,
      m.blackbaud_fundraiser_alias_ids,
      COALESCE(pm.active_prospects, 0)::INTEGER AS active_prospects,
      COALESCE(pm.prospects_with_next_steps, 0)::INTEGER AS prospects_with_next_steps,
      COALESCE(pm.overdue_next_steps, 0)::INTEGER AS overdue_next_steps,
      COALESCE(om.open_pipeline, 0) AS open_pipeline
    FROM active_mgos m
    LEFT JOIN prospect_metrics pm ON pm.user_id = m.id
    LEFT JOIN opportunity_metrics om ON om.user_id = m.id
    ORDER BY LOWER(COALESCE(NULLIF(BTRIM(m.name), ''), m.email)), m.id
  `;

  const userIds = rows
    .map((row) => Number(row.user_id))
    .filter((value) => Number.isFinite(value));

  const activeProspectRows = userIds.length
    ? await sql`
        SELECT
          p.user_id,
          p.id AS prospect_id,
          p.prospect_name,
          p.blackbaud_constituent_id,
          p.next_action_text,
          p.next_action_due_date,
          p.next_action_completed_at,
          p.updated_at
        FROM prospects p
        WHERE p.user_id = ANY(${userIds})
          AND LOWER(COALESCE(p.status, '')) = 'active'
        ORDER BY
          p.user_id,
          LOWER(COALESCE(NULLIF(BTRIM(p.prospect_name), ''), 'zzzz')),
          p.id
      `
    : [];

  const openOpportunityRows = userIds.length
    ? await sql`
        SELECT
          p.user_id,
          po.id AS opportunity_id,
          po.prospect_id,
          p.prospect_name,
          p.blackbaud_constituent_id,
          po.title,
          po.current_stage,
          po.estimated_amount,
          po.expected_date,
          po.close_date
        FROM prospects p
        INNER JOIN prospect_opportunities po ON po.prospect_id = p.id
        WHERE p.user_id = ANY(${userIds})
          AND LOWER(COALESCE(po.opportunity_status, '')) = 'active'
        ORDER BY
          p.user_id,
          COALESCE(po.estimated_amount, 0) DESC,
          LOWER(COALESCE(NULLIF(BTRIM(po.title), ''), 'zzzz')),
          po.id
      `
    : [];

  const recentTrendRows = userIds.length
    ? await sql`
        WITH recent_prospect_touches AS (
          SELECT
            p.user_id,
            COUNT(*)::INTEGER AS prospects_touched
          FROM prospects p
          WHERE p.user_id = ANY(${userIds})
            AND p.updated_at >= NOW() - INTERVAL '7 days'
          GROUP BY p.user_id
        ),
        recent_update_logs AS (
          SELECT
            p.user_id,
            COUNT(pu.id)::INTEGER AS updates_logged
          FROM prospect_updates pu
          INNER JOIN prospects p ON p.id = pu.prospect_id
          WHERE p.user_id = ANY(${userIds})
            AND pu.created_at >= NOW() - INTERVAL '7 days'
          GROUP BY p.user_id
        ),
        recent_opportunity_changes AS (
          SELECT
            p.user_id,
            COUNT(po.id)::INTEGER AS opportunity_changes
          FROM prospect_opportunities po
          INNER JOIN prospects p ON p.id = po.prospect_id
          WHERE p.user_id = ANY(${userIds})
            AND po.updated_at >= NOW() - INTERVAL '7 days'
          GROUP BY p.user_id
        ),
        recently_closed AS (
          SELECT
            p.user_id,
            COALESCE(
              SUM(COALESCE(po.closed_amount, po.estimated_amount, 0)),
              0
            ) AS recently_closed_value
          FROM prospect_opportunities po
          INNER JOIN prospects p ON p.id = po.prospect_id
          WHERE p.user_id = ANY(${userIds})
            AND po.close_date >= CURRENT_DATE - INTERVAL '6 days'
            AND po.close_date <= CURRENT_DATE
            AND LOWER(COALESCE(po.opportunity_status, '')) <> 'active'
          GROUP BY p.user_id
        )
        SELECT
          u.id AS user_id,
          COALESCE(rpt.prospects_touched, 0)::INTEGER AS prospects_touched,
          COALESCE(rul.updates_logged, 0)::INTEGER AS updates_logged,
          COALESCE(roc.opportunity_changes, 0)::INTEGER AS opportunity_changes,
          COALESCE(rc.recently_closed_value, 0) AS recently_closed_value
        FROM users u
        LEFT JOIN recent_prospect_touches rpt ON rpt.user_id = u.id
        LEFT JOIN recent_update_logs rul ON rul.user_id = u.id
        LEFT JOIN recent_opportunity_changes roc ON roc.user_id = u.id
        LEFT JOIN recently_closed rc ON rc.user_id = u.id
        WHERE u.id = ANY(${userIds})
      `
    : [];

  const closedTotals = origin
    ? await mapWithConcurrency(rows, 2, async (row) => {
        try {
          const summary = await getClosedFiscalYearSummary({
            workspaceUser: {
              id: Number(row.user_id),
              name: row.name,
              email: row.email,
              blackbaud_constituent_id: row.blackbaud_constituent_id,
              blackbaud_lookup_id: row.blackbaud_lookup_id,
              blackbaud_fundraiser_alias_ids: row.blackbaud_fundraiser_alias_ids,
            },
            authUserId: authUser.id,
            origin,
          });
          return [Number(row.user_id), asNumber(summary.closedThisFY)];
        } catch {
          return [Number(row.user_id), 0];
        }
      })
    : [];

  const closedTotalsByUser = new Map(closedTotals);
  const nxtActionSummaryByUser = origin
    ? await getNxtActionSummaryByWorkspaceUser({
        workspaceUsers: rows.map((row) => ({
          id: Number(row.user_id),
          name: row.name,
          email: row.email,
          blackbaud_constituent_id: row.blackbaud_constituent_id,
          blackbaud_lookup_id: row.blackbaud_lookup_id,
          blackbaud_fundraiser_alias_ids: row.blackbaud_fundraiser_alias_ids,
        })),
        authUserId: authUser.id,
        origin,
        fiscalYearStart: fiscalYear.startsOn,
        fiscalYearEnd: fiscalYear.endsOn,
      }).catch(() => new Map())
    : new Map();
  const activeProspectsByUser = new Map();
  for (const row of activeProspectRows) {
    const userId = Number(row.user_id);
    const current = activeProspectsByUser.get(userId) || [];
    const hasOpenNextStep = asText(row.next_action_text) && !row.next_action_completed_at;
    current.push({
      prospectId: Number(row.prospect_id),
      prospectName: row.prospect_name || "Unnamed prospect",
      blackbaudConstituentId: asText(row.blackbaud_constituent_id),
      nextActionText: asText(row.next_action_text),
      nextActionDueDate: row.next_action_due_date || null,
      hasOpenNextStep: Boolean(hasOpenNextStep),
      isOverdue:
        Boolean(hasOpenNextStep) &&
        row.next_action_due_date &&
        row.next_action_due_date < new Date().toISOString().slice(0, 10),
      updatedAt: row.updated_at || null,
    });
    activeProspectsByUser.set(userId, current);
  }

  const openOpportunitiesByUser = new Map();
  for (const row of openOpportunityRows) {
    const userId = Number(row.user_id);
    const current = openOpportunitiesByUser.get(userId) || [];
    current.push({
      opportunityId: Number(row.opportunity_id),
      prospectId: Number(row.prospect_id),
      prospectName: row.prospect_name || "Unnamed prospect",
      blackbaudConstituentId: asText(row.blackbaud_constituent_id),
      title: row.title || "Untitled opportunity",
      currentStage: row.current_stage || "Active",
      estimatedAmount: asNumber(row.estimated_amount),
      expectedDate: row.expected_date || null,
      closeDate: row.close_date || null,
    });
    openOpportunitiesByUser.set(userId, current);
  }

  const recentTrendByUser = new Map();
  for (const row of recentTrendRows) {
    recentTrendByUser.set(Number(row.user_id), {
      prospectsTouched: asNumber(row.prospects_touched),
      updatesLogged: asNumber(row.updates_logged),
      opportunityChanges: asNumber(row.opportunity_changes),
      recentlyClosedValue: asNumber(row.recently_closed_value),
    });
  }

  const standings = rows.map((row) => ({
    userId: Number(row.user_id),
    name: row.name || row.email || "Unnamed MGO",
    email: row.email || "",
    activeProspects: asNumber(row.active_prospects),
    openPipeline: asNumber(row.open_pipeline),
    fundedThisFiscalYear: asNumber(closedTotalsByUser.get(Number(row.user_id))),
    nxtActionsThisFiscalYear: asNumber(
      nxtActionSummaryByUser.get(Number(row.user_id))?.actionsThisFY,
    ),
    prospectsWithNextSteps: asNumber(row.prospects_with_next_steps),
    overdueNextSteps: asNumber(row.overdue_next_steps),
    trend: {
      windowDays: TREND_WINDOW_DAYS,
      prospectsTouched: asNumber(recentTrendByUser.get(Number(row.user_id))?.prospectsTouched),
      updatesLogged: asNumber(recentTrendByUser.get(Number(row.user_id))?.updatesLogged),
      opportunityChanges: asNumber(
        recentTrendByUser.get(Number(row.user_id))?.opportunityChanges,
      ),
      recentlyClosedValue: asNumber(
        recentTrendByUser.get(Number(row.user_id))?.recentlyClosedValue,
      ),
    },
    drilldown: {
      activeProspects: activeProspectsByUser.get(Number(row.user_id)) || [],
      openOpportunities: openOpportunitiesByUser.get(Number(row.user_id)) || [],
      nxtActions:
        nxtActionSummaryByUser.get(Number(row.user_id))?.actions || [],
    },
  }));

  return {
    fiscalYear,
    trendWindowDays: TREND_WINDOW_DAYS,
    source:
      "Raiser's Edge NXT gift and action fundraiser attribution, plus JUMGOGPT pipeline and next-step records",
    generatedAt: new Date().toISOString(),
    standings,
  };
}

export async function GET(request) {
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

    const forceRefresh = shouldBypassReportCache(request);
    if (!forceRefresh) {
      const cachedPayload = await getCachedReportSnapshot(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY);
      if (cachedPayload) {
        return Response.json(cachedPayload, {
          headers: getReportCacheHeaders("hit"),
        });
      }
    }

    const origin = request?.url ? new URL(request.url).origin : null;
    const payload = await buildExecutiveTeamStandingsPayload({
      authUser: user,
      origin,
    });
    await saveReportSnapshot(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY, payload);

    return Response.json(payload, {
      headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
    });
  } catch (error) {
    console.error("Failed to load executive team standings:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load Executive Team Standings.",
      },
      { status: 500 },
    );
  }
}
