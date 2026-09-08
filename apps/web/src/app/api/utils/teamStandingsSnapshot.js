import { getCachedReportSnapshotWithMetadata } from "@/app/api/utils/reportCache";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { numericScore } from "@/app/reports/executive-team-standings/standingsPresentation";

export const EXECUTIVE_TEAM_STANDINGS_CACHE_KEY =
  "report:executive-team-standings:v4-lifetime-gift-feed";

// Project only the authorized workspace's totals, never team rows or drilldowns.
export function projectWorkspaceStandingsSummary(snapshot, workspaceUserId, now = new Date()) {
  const periods = getStandingsPeriods(now);
  const result = {
    currentFY: periods.fiscalYear.label,
    priorFY: periods.prior.label,
    closedThisFY: null,
    closedPriorFY: null,
    raisedSnapshot: {
      source: "team_standings",
      status: "unavailable",
      reason: "missing_snapshot",
      periodMode: "ytd",
      asOf: null,
      updatedAt: null,
    },
  };
  const payload = snapshot?.payload;
  if (!payload) return result;
  if (payload.fiscalYear?.startsOn !== periods.fiscalYear.startsOn ||
      payload.fiscalYear?.endsOn !== periods.fiscalYear.endsOn) {
    result.raisedSnapshot.reason = "fiscal_year_mismatch";
    return result;
  }

  const id = Number(workspaceUserId);
  const entry = Number.isSafeInteger(id) && id > 0 && Array.isArray(payload.standings)
    ? payload.standings.find((row) => Number(row?.userId) === id)
    : null;
  if (!entry) {
    result.raisedSnapshot.reason = "workspace_not_ranked";
    return result;
  }

  const isYtd = Boolean(payload.comparison);
  result.closedThisFY = numericScore(entry.fundedThisFiscalYear);
  result.closedPriorFY = isYtd ? numericScore(entry.priorYearToDate?.raised) : null;
  result.raisedSnapshot = {
    source: "team_standings",
    status: result.closedThisFY === null ? "unavailable" : "available",
    reason: result.closedThisFY === null ? "missing_metric" : null,
    periodMode: isYtd ? "ytd" : "full_fiscal_year",
    asOf: isYtd ? payload.comparison.current?.endsOn || null : null,
    updatedAt: snapshot.updatedAt || null,
  };
  return result;
}

export async function getWorkspaceStandingsSummary(workspaceUserId) {
  const snapshot = await getCachedReportSnapshotWithMetadata(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY);
  return projectWorkspaceStandingsSummary(snapshot, workspaceUserId);
}
