import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
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
import {
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";
import {
  executeSavedQueryCount,
  executeSavedQueryResults,
} from "@/app/api/utils/savedQueryExecution";
import {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";
import {
  DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
  getAlumniFamilyEngagementDashboardFingerprint,
  getAlumniDonorCountPanels,
  getAlumniDonorCountRows,
  getAlumniDonorCountRowFingerprint,
  getAlumniGenericDashboard,
  normalizeAlumniFamilyEngagementDashboard,
} from "@/app/api/utils/alumniDonorConfiguration";
import {
  presentDashboardSnapshot,
  publicDashboardSnapshot,
  refreshDashboardSnapshot,
} from "@/app/api/utils/dashboardSnapshots";

export const maxDuration = 300;

export const ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY = "report:alumni-family-engagement";
// The old export name is kept so any internal reference remains compatible.
export const ALUMNI_DONOR_TOTAL_QUERIES = getAlumniDonorCountRows(
  DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
);

const DEFAULT_REPORT_TITLE = "Alumni & Family Engagement";
const DEFAULT_REPORT_DESCRIPTION =
  "Configured dashboard panels backed by saved NXT query snapshots.";
const QUERY_RESULT_CSV_ROW_COUNT_SOURCE = "query-result-csv-row-count-v3";

export { executeSavedQueryCount, executeSavedQueryResults };

function getReportPresentation(access) {
  return {
    title: String(access?.title || "").trim() || DEFAULT_REPORT_TITLE,
    description:
      String(access?.description || "").trim() || DEFAULT_REPORT_DESCRIPTION,
    canArrange: access?.canArrange === true,
  };
}

function getCompatibleCachedTotal({ cachedPayload, dashboard, row }) {
  if (!cachedPayload || !row?.key) return null;
  const cachedTotals = Array.isArray(cachedPayload?.totals) ? cachedPayload.totals : [];
  const cachedTotal = cachedTotals.find(
    (total) =>
      String(total?.key || "").trim() === String(row.key || "").trim() &&
      String(total?.panelKey || "").trim() === String(row.panelKey || "").trim(),
  );
  if (!cachedTotal) return null;

  // Only reuse snapshots counted from the completed query CSV. Query-job
  // metadata does not reliably represent the rendered saved-query result.
  if (
    String(cachedTotal?.countSource || "").trim() !==
    QUERY_RESULT_CSV_ROW_COUNT_SOURCE
  ) {
    return null;
  }

  const rowFingerprint = getAlumniDonorCountRowFingerprint(dashboard, row);
  const cachedRowFingerprint = String(cachedTotal?.definitionFingerprint || "").trim();
  if (cachedRowFingerprint) {
    return cachedRowFingerprint === rowFingerprint ? cachedTotal : null;
  }

  return null;
}

function getCompatibleCachedTotals({ cachedPayload, dashboard, countRows }) {
  const totals = countRows.map((row) =>
    getCompatibleCachedTotal({ cachedPayload, dashboard, row }),
  );
  return totals.every(Boolean) ? totals : null;
}

function needsNxtRefresh({ cachedPayload, dashboard, countRows }) {
  return countRows.some((row) => {
    if (row.refreshPolicy !== "frozen") return true;
    return !getCompatibleCachedTotal({ cachedPayload, dashboard, row });
  });
}

function genericDashboardNeedsNxtRefresh(configuration, cached) {
  const snapshot = presentDashboardSnapshot(configuration, cached, {});
  const values = new Map(snapshot.values.map((value) => [value.key, value]));
  const tables = new Map(snapshot.tables.map((table) => [table.key, table]));
  return configuration.panels.some((panel) =>
    panel.layout === "query_results"
      ? panel.refreshPolicy !== "frozen" || tables.get(panel.key)?.rows === null
      : panel.values.some(
          (value) =>
            value.source === "query_count" &&
            (value.refreshPolicy !== "frozen" ||
              values.get(value.key)?.value === null),
        ),
  );
}

function buildDashboardPanels({ dashboard, totals }) {
  const totalsByRow = new Map(
    (Array.isArray(totals) ? totals : []).map((total) => [
      `${total?.panelKey || ""}:${total?.key || ""}`,
      total,
    ]),
  );

  return getAlumniDonorCountPanels(dashboard).map((panel) => ({
    key: panel.key,
    type: panel.type,
    title: panel.title,
    width: panel.width,
    totals: panel.rows.map((row) => {
      const countRow = {
        ...row,
        panelKey: panel.key,
        panelTitle: panel.title,
        panelType: panel.type,
      };
      return {
        ...totalsByRow.get(`${panel.key}:${row.key}`),
        ...countRow,
        definitionFingerprint: getAlumniDonorCountRowFingerprint(dashboard, countRow),
      };
    }),
  }));
}

function attachReportPresentation({ cachedPayload, dashboard, presentation, countRows }) {
  if (!cachedPayload) return null;

  const configurationFingerprint = getAlumniFamilyEngagementDashboardFingerprint(dashboard);
  const compatibleTotals = getCompatibleCachedTotals({
    cachedPayload,
    dashboard,
    countRows,
  });
  if (!compatibleTotals) return null;

  const genericConfiguration = getAlumniGenericDashboard(dashboard);
  const genericSnapshot = presentDashboardSnapshot(
    genericConfiguration,
    cachedPayload?.genericSnapshot,
    {},
  );

  const { constituencyMembershipCache: ignoredMembershipCache, ...publicPayload } = cachedPayload;
  return {
    ...publicPayload,
    status:
      genericSnapshot.status === "complete"
        ? "complete"
        : genericSnapshot.status,
    report: presentation,
    dashboard: {
      panels: buildDashboardPanels({ dashboard, totals: compatibleTotals }),
    },
    dashboardConfiguration: dashboard,
    configurationFingerprint,
    genericConfiguration,
    genericSnapshot: publicDashboardSnapshot(genericSnapshot),
    totalRows: compatibleTotals.reduce((sum, total) => sum + Number(total.total || 0), 0),
    totals: countRows.map((row, index) => ({
      ...compatibleTotals[index],
      ...row,
      definitionFingerprint: getAlumniDonorCountRowFingerprint(dashboard, row),
    })),
  };
}

async function buildQueryApiDonorTotals({ user, origin, dashboard, cachedPayload }) {
  const countRows = getAlumniDonorCountRows(dashboard);
  const totals = [];
  let queryJobPolls = 0;
  let queryJobs = 0;
  let frozenSnapshotsReused = 0;
  const refreshedAt = new Date().toISOString();

  // A small sequential job queue avoids burst throttling while keeping this
  // report to a handful of saved-query jobs. Frozen rows reuse their
  // compatible saved total and intentionally skip this queue.
  for (const row of countRows) {
    const definitionFingerprint = getAlumniDonorCountRowFingerprint(dashboard, row);
    const cachedTotal = getCompatibleCachedTotal({
      cachedPayload,
      dashboard,
      row,
    });

    if (row.refreshPolicy === "frozen" && cachedTotal) {
      frozenSnapshotsReused += 1;
      totals.push({
        ...cachedTotal,
        ...row,
        definitionFingerprint,
        frozenAt: cachedTotal.frozenAt || cachedPayload?.generatedAt || refreshedAt,
      });
      continue;
    }

    if (!row.queryId) {
      throw new Error(
        `Add a saved NXT query system record ID for ${row.label} before refreshing.`,
      );
    }

    const { total, polls, queryJobRowCount } = await executeSavedQueryCount({
      user,
      origin,
      queryId: row.queryId,
      label: row.label,
    });
    queryJobs += 1;
    queryJobPolls += polls;
    totals.push({
      ...row,
      total,
      countSource: QUERY_RESULT_CSV_ROW_COUNT_SOURCE,
      queryJobRowCount,
      refreshPolicy: row.refreshPolicy,
      definitionFingerprint,
      frozenAt: row.refreshPolicy === "frozen" ? refreshedAt : null,
    });
  }

  return {
    totals,
    totalRows: totals.reduce((sum, total) => sum + total.total, 0),
    warnings: [],
    refreshMetrics: {
      source: "blackbaud-query-result-csv",
      queryJobs,
      queryJobPolls,
      frozenSnapshotsReused,
    },
  };
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

export async function GET(request) {
  let presentedCachedPayload = null;

  try {
    const user = await getCurrentUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const internalRefresh = isAuthorizedReportRefreshRequest(request);
    const access = await getReportAccessForUser(ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY, user);
    if (!internalRefresh && !access.canView) {
      return Response.json(
        { error: "Alumni & Family Engagement is not shared with you." },
        { status: 403 },
      );
    }

    const dashboard = normalizeAlumniFamilyEngagementDashboard(access.dataConfiguration);
    const countRows = getAlumniDonorCountRows(dashboard);
    const genericConfiguration = getAlumniGenericDashboard(dashboard);
    const presentation = getReportPresentation(access);
    const forceRefresh = shouldBypassReportCache(request);
    const cachedPayload = await getCachedReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY);
    presentedCachedPayload = attachReportPresentation({
      cachedPayload,
      dashboard,
      presentation,
      countRows,
    });

    if (!forceRefresh && presentedCachedPayload) {
      return Response.json(presentedCachedPayload, { headers: getReportCacheHeaders("hit") });
    }

    if (!forceRefresh) {
      return Response.json(
        {
          status: "refresh_required",
          report: presentation,
          dashboard: { panels: buildDashboardPanels({ dashboard, totals: [] }) },
          dashboardConfiguration: dashboard,
          genericConfiguration,
          genericSnapshot: publicDashboardSnapshot(
            presentDashboardSnapshot(genericConfiguration, null, {}),
          ),
          configurationFingerprint: getAlumniFamilyEngagementDashboardFingerprint(dashboard),
          message: countRows.length || genericConfiguration.panels.length
            ? "No saved Alumni & Family Engagement snapshot matches this dashboard configuration yet. Select Refresh data to create one."
            : "No Alumni & Family Engagement dashboard panels are configured yet.",
        },
        { headers: getReportCacheHeaders("empty") },
      );
    }

    const shouldCallNxt = needsNxtRefresh({
      cachedPayload,
      dashboard,
      countRows,
    }) || genericDashboardNeedsNxtRefresh(
      genericConfiguration,
      cachedPayload?.genericSnapshot,
    );
    const origin = new URL(request.url).origin;
    if (shouldCallNxt) {
      const configurationIssues = getBlackbaudConfigIssues(origin);
      if (configurationIssues.length) {
        return Response.json(
          { error: `Blackbaud configuration is incomplete: ${configurationIssues.join(", ")}` },
          { status: 500 },
        );
      }
    }

    const queryTotals = await buildQueryApiDonorTotals({
      user,
      origin,
      dashboard,
      cachedPayload,
    });
    const genericSnapshot = await refreshDashboardSnapshot({
      configuration: genericConfiguration,
      cached: cachedPayload?.genericSnapshot,
      user,
      origin,
      staticValueProvenance: {},
    });
    const refreshMetrics = {
      ...queryTotals.refreshMetrics,
      queryJobs:
        queryTotals.refreshMetrics.queryJobs +
        genericSnapshot.refreshMetrics.queryJobs,
      genericQueryJobs: genericSnapshot.refreshMetrics.queryJobs,
      remainingQueryCount: genericSnapshot.remainingQueryCount,
    };
    if (
      refreshMetrics.queryJobs === 0 &&
      presentedCachedPayload &&
      !genericConfiguration.panels.length
    ) {
      return Response.json(
        {
          ...presentedCachedPayload,
          refreshMetrics,
          refreshNotice:
            "All configured rows are frozen snapshots. The saved report was returned without another NXT request.",
        },
        { headers: getReportCacheHeaders("frozen") },
      );
    }

    const payload = {
      status: "complete",
      generatedAt: new Date().toISOString(),
      report: presentation,
      dashboard: { panels: buildDashboardPanels({ dashboard, totals: queryTotals.totals }) },
      configurationFingerprint: getAlumniFamilyEngagementDashboardFingerprint(dashboard),
      ...queryTotals,
      refreshMetrics,
      genericSnapshot,
    };
    await saveReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY, payload);

    const publicPayload = attachReportPresentation({
      cachedPayload: payload,
      dashboard,
      presentation,
      countRows,
    });
    return Response.json(publicPayload, { headers: getReportCacheHeaders("refresh") });
  } catch (error) {
    console.error("Alumni & Family Engagement report error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Could not refresh the Alumni & Family Engagement report.";

    if (presentedCachedPayload) {
      return Response.json(
        {
          ...presentedCachedPayload,
          refreshWarning: `${message} Showing the last successful snapshot instead.`,
        },
        { headers: getReportCacheHeaders("stale") },
      );
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
