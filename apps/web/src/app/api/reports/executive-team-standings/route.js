import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  getPeriodGivingByWorkspaceUser,
  getLifetimeGivingTotalsForWorkspaceUsers,
} from "@/app/api/utils/closedFyGiftTotals";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getNxtActionSummaryByWorkspaceUser } from "@/app/api/utils/nxtActionTotals";
import {
  getCachedReportSnapshot,
  getReportCacheHeaders,
  saveReportSnapshot,
  shouldBypassReportCache,
} from "@/app/api/utils/reportCache";
import {
  getReportRefreshUser,
  isAuthorizedReportRefreshRequest,
} from "@/app/api/utils/reportRefresh";
import sql from "@/app/api/utils/sql";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import {
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const TREND_WINDOW_DAYS = 7;
export const EXECUTIVE_TEAM_STANDINGS_CACHE_KEY =
  "report:executive-team-standings:v4-lifetime-gift-feed";

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

function asOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value) {
  return String(value || "").trim();
}

async function loadRefreshMetric(source, loader, failures) {
  try {
    return await loader();
  } catch (error) {
    const httpStatus = Number(error?.httpStatus);
    const failure = {
      source,
      reason: error?.code === "NXT_INCOMPLETE_RESULTS" ? "incomplete_results" : "unavailable",
      httpStatus: Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599 ? httpStatus : null,
    };
    // Never log provider bodies, donor data, credentials, or signed URLs here.
    console.warn("Team Standings metric refresh failed", failure);
    failures.push(failure);
    return new Map();
  }
}

function refreshWarning(payload, previousSnapshot) {
  const labels = {
    lifetime_credit: "Lifetime solicitor credit",
    giving_comparison: "FY-to-date giving totals",
    actions: "Action totals",
  };
  const sources = (payload.refreshUnavailableSources || []).map((source) => labels[source]).filter(Boolean);
  const description = sources.length ? sources.join(" and ") : "Some NXT metrics";
  return `${description} could not be refreshed for every active MGO. ${previousSnapshot
    ? "The previous Team Standings snapshot is still displayed."
    : "Missing values are unavailable, not zero, and are excluded from ranking. Other saved metrics are current."}`;
}

async function getCurrentUser(request) {
  await ensureAppSchema();
  if (isAuthorizedReportRefreshRequest(request)) {
    return getReportRefreshUser();
  }
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

export async function buildExecutiveTeamStandingsPayload({ authUser, origin }) {
  const comparison = getStandingsPeriods();
  const fiscalYear = comparison.fiscalYear;
  const periods = { current: comparison.current, prior: comparison.prior, week: comparison.week };
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

  const workspaceUsers = rows.map((row) => ({
    id: Number(row.user_id),
    name: row.name,
    email: row.email,
    blackbaud_constituent_id: row.blackbaud_constituent_id,
    blackbaud_lookup_id: row.blackbaud_lookup_id,
    blackbaud_fundraiser_alias_ids: row.blackbaud_fundraiser_alias_ids,
  }));
  const refreshFailures = [];
  const lifetimeGivingByUser = origin
    ? await loadRefreshMetric("lifetime_credit", () => getLifetimeGivingTotalsForWorkspaceUsers({
        workspaceUsers,
        authUserId: authUser.id,
        origin,
      }), refreshFailures)
    : new Map();
  const lifetimeCreditUnavailableUserIds = workspaceUsers
    .filter((workspaceUser) => !Number.isFinite(lifetimeGivingByUser.get(workspaceUser.id)))
    .map((workspaceUser) => workspaceUser.id);
  const givingTotalsByUser = origin
    ? await loadRefreshMetric("giving_comparison", () => getPeriodGivingByWorkspaceUser({ workspaceUsers, authUserId: authUser.id, origin, periods }), refreshFailures)
    : new Map();
  const nxtActionSummaryByUser = origin
    ? await loadRefreshMetric("actions", () => getNxtActionSummaryByWorkspaceUser({
        workspaceUsers,
        authUserId: authUser.id,
        origin,
        fiscalYearStart: comparison.prior.startsOn,
        fiscalYearEnd: comparison.current.endsOn,
        fiscalYears: comparison.actionFiscalYears,
        periods,
        requireComplete: true,
      }), refreshFailures)
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
    fundedThisFiscalYear: asOptionalNumber(
      givingTotalsByUser.get(Number(row.user_id))?.current,
    ),
    lifetimeGiving: lifetimeGivingByUser.get(Number(row.user_id)) ?? null,
    priorYearToDate: {
      raised: asOptionalNumber(givingTotalsByUser.get(Number(row.user_id))?.prior),
      highValueActions: asOptionalNumber(nxtActionSummaryByUser.get(Number(row.user_id))?.periods?.prior?.highValueActions),
    },
    lastCompletedWeek: {
      raised: asOptionalNumber(givingTotalsByUser.get(Number(row.user_id))?.week),
      highValueActions: asOptionalNumber(nxtActionSummaryByUser.get(Number(row.user_id))?.periods?.week?.highValueActions),
    },
    nxtActionsThisFiscalYear: asOptionalNumber(
      nxtActionSummaryByUser.get(Number(row.user_id))?.actionsThisFY,
    ),
    highValueActionsThisFiscalYear: asOptionalNumber(
      nxtActionSummaryByUser.get(Number(row.user_id))?.highValueActionsThisFY,
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

  const refreshUnavailableSources = new Set(refreshFailures.map(({ source }) => source));
  if (lifetimeCreditUnavailableUserIds.length) refreshUnavailableSources.add("lifetime_credit");
  if (standings.some((entry) => entry.fundedThisFiscalYear === null || entry.priorYearToDate.raised === null || entry.lastCompletedWeek.raised === null)) {
    refreshUnavailableSources.add("giving_comparison");
  }
  if (standings.some((entry) => entry.highValueActionsThisFiscalYear === null || entry.priorYearToDate.highValueActions === null || entry.lastCompletedWeek.highValueActions === null)) {
    refreshUnavailableSources.add("actions");
  }
  return {
    fiscalYear,
    trendWindowDays: TREND_WINDOW_DAYS,
    source:
      "Raiser's Edge NXT fundraiser-attributed gift credit and actions; JUMGOGPT local pipeline and next-step records",
    scoringVersion: 2,
    comparison,
    generatedAt: new Date().toISOString(),
    refreshUnavailableSources: [...refreshUnavailableSources],
    refreshFailures,
    lifetimeCreditUnavailableUserIds: [...new Set(lifetimeCreditUnavailableUserIds)],
    scoringUnavailableUserIds: standings
      .filter((entry) => entry.fundedThisFiscalYear === null || entry.highValueActionsThisFiscalYear === null
        || Object.values(entry.priorYearToDate).some((value) => value === null)
        || Object.values(entry.lastCompletedWeek).some((value) => value === null))
      .map((entry) => entry.userId),
    standings,
  };
}

export async function GET(request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const internalRefresh = isAuthorizedReportRefreshRequest(request);
    const access = await getReportAccessForUser(EXECUTIVE_TEAM_STANDINGS_REPORT_KEY, user);
    if (!internalRefresh && !access.canView) {
      return Response.json(
        { error: "You do not have access to Team Standings." },
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

      return Response.json(
        {
          status: "refresh_required",
          message:
            "No saved Team Standings snapshot is available yet. Select Refresh standings to create one.",
        },
        { headers: getReportCacheHeaders("empty") },
      );
    }

    const origin = request?.url ? new URL(request.url).origin : null;
    const payload = await buildExecutiveTeamStandingsPayload({
      authUser: user,
      origin,
    });
    if (payload.lifetimeCreditUnavailableUserIds.length > 0 || payload.scoringUnavailableUserIds.length > 0) {
      const cachedPayload = await getCachedReportSnapshot(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY);
      if (cachedPayload) {
        return Response.json(
          {
            ...cachedPayload,
            snapshotStatus: "stale",
            refreshWarning: refreshWarning(payload, true),
            refreshUnavailableSources: payload.refreshUnavailableSources,
            refreshFailures: payload.refreshFailures,
          },
          { headers: getReportCacheHeaders("stale") },
        );
      }

      // A missing or temporarily unavailable credit total for one MGO must not
      // make the whole dashboard unusable. Save the other safely refreshed
      // metrics, preserve unavailable values as null, and make the partial
      // state explicit to the UI instead of presenting a misleading zero.
      const partialPayload = {
        ...payload,
        snapshotStatus: "partial",
        refreshWarning: refreshWarning(payload, false),
      };
      await saveReportSnapshot(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY, partialPayload);

      return Response.json(
        partialPayload,
        { headers: getReportCacheHeaders(forceRefresh ? "partial" : "miss") },
      );
    }
    await saveReportSnapshot(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY, payload);

    return Response.json(payload, {
      headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
    });
  } catch (error) {
    console.error("Failed to load Team Standings:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load Team Standings.",
      },
      { status: 500 },
    );
  }
}
