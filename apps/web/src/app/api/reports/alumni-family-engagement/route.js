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
  createBlackbaudQueryJob,
  downloadBlackbaudQueryResult,
  getBlackbaudConfigIssues,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";
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
  normalizeAlumniFamilyEngagementDashboard,
} from "@/app/api/utils/alumniDonorConfiguration";

export const maxDuration = 300;

export const ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY = "report:alumni-family-engagement";
// The old export name is kept so any internal reference remains compatible.
export const ALUMNI_DONOR_TOTAL_QUERIES = getAlumniDonorCountRows(
  DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
);

const DEFAULT_REPORT_TITLE = "Alumni & Family Engagement";
const DEFAULT_REPORT_DESCRIPTION =
  "Configured dashboard panels backed by saved NXT query snapshots.";
const QUERY_POLL_INTERVAL_MS = 1500;
const QUERY_MAX_WAIT_MS = 90000;
const QUERY_RESULT_CSV_ROW_COUNT_SOURCE = "query-result-csv-row-count-v3";

function getReportPresentation(access) {
  return {
    title: String(access?.title || "").trim() || DEFAULT_REPORT_TITLE,
    description:
      String(access?.description || "").trim() || DEFAULT_REPORT_DESCRIPTION,
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

  const { constituencyMembershipCache: ignoredMembershipCache, ...publicPayload } = cachedPayload;
  return {
    ...publicPayload,
    report: presentation,
    dashboard: {
      panels: buildDashboardPanels({ dashboard, totals: compatibleTotals }),
    },
    configurationFingerprint,
    totalRows: compatibleTotals.reduce((sum, total) => sum + Number(total.total || 0), 0),
    totals: countRows.map((row, index) => ({
      ...compatibleTotals[index],
      ...row,
      definitionFingerprint: getAlumniDonorCountRowFingerprint(dashboard, row),
    })),
  };
}

function getQueryJobId(job) {
  return String(job?.id ?? job?.job_id ?? job?.jobId ?? "").trim();
}

function getQueryJobStatus(job) {
  return String(job?.status ?? job?.state ?? job?.job_status ?? job?.jobStatus ?? "").trim();
}

function isCompletedQueryJob(status) {
  return /^(?:completed|complete|succeeded|success)$/i.test(String(status || "").trim());
}

function isFailedQueryJob(status) {
  return /(?:fail|cancel|error|declin)/i.test(String(status || ""));
}

function getQueryJobMetadataRowCount(job) {
  const candidates = [
    job?.row_count,
    job?.rowCount,
    job?.total_rows,
    job?.totalRows,
    job?.record_count,
    job?.recordCount,
    job?.result?.row_count,
    job?.result?.rowCount,
    job?.result?.total_rows,
    job?.result?.totalRows,
    job?.result?.record_count,
    job?.result?.recordCount,
  ];
  const value = candidates.find(
    (candidate) => candidate !== undefined && candidate !== null && String(candidate).trim(),
  );
  const rowCount = Number(value);
  return Number.isSafeInteger(rowCount) && rowCount >= 0 ? rowCount : null;
}

function getFirstQueryResultUrl(candidates) {
  return String(
    candidates.find((candidate) => String(candidate || "").trim()) || "",
  ).trim();
}

function getQueryResultFileUrl(job) {
  return getFirstQueryResultUrl([
    job?.sas_uri,
    job?.sasUri,
    job?.result_uri,
    job?.resultUri,
    job?.result_url,
    job?.resultUrl,
    job?.resultFileUrl,
    job?.download_url,
    job?.downloadUrl,
    job?.result?.sas_uri,
    job?.result?.sasUri,
    job?.result?.result_uri,
    job?.result?.resultUri,
    job?.result?.result_url,
    job?.result?.resultUrl,
    job?.result?.resultFileUrl,
    job?.result?.download_url,
    job?.result?.downloadUrl,
  ]);
}

function getQueryResultReadUrl(job) {
  return getFirstQueryResultUrl([
    job?.read_url,
    job?.readUrl,
    job?.result?.read_url,
    job?.result?.readUrl,
  ]);
}

function parseCsv(content) {
  const records = [];
  const text = String(content || "").replace(/^\uFEFF/, "");
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (quoted && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value || "").trim())) records.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  if (row.some((value) => String(value || "").trim())) records.push(row);
  return records;
}

function countQueryResultRows(content, label) {
  const resultCsv = String(content || "").replace(/^\uFEFF/, "");
  const leadingContent = resultCsv.trimStart();

  if (!leadingContent) {
    throw new Error(
      `NXT returned an empty result file for ${label}. The report was not updated.`,
    );
  }

  if (/^(?:[\[{]|<!doctype\b|<html\b)/i.test(leadingContent)) {
    throw new Error(
      `NXT returned query-job metadata instead of the completed CSV result for ${label}. The report was not updated.`,
    );
  }

  const records = parseCsv(resultCsv);
  if (!records.length) return 0;

  // Query jobs return a CSV header followed by the actual saved-query rows.
  return records.slice(1).length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBlackbaudQueryJob({ user, origin, jobId, label }) {
  const startedAt = Date.now();
  let polls = 0;
  let lastStatus = "Queued";

  while (Date.now() - startedAt < QUERY_MAX_WAIT_MS) {
    const job = await getBlackbaudQueryJob({
      userId: user.id,
      authUserId: user.id,
      origin,
      jobId,
    });
    polls += 1;
    lastStatus = getQueryJobStatus(job) || lastStatus;

    if (isCompletedQueryJob(lastStatus)) {
      const resultUrl = getQueryResultFileUrl(job) || getQueryResultReadUrl(job);
      if (!resultUrl) {
        throw new Error(
          `NXT completed ${label}, but did not provide its result file. The report was not updated.`,
        );
      }
      const resultCsv = await downloadBlackbaudQueryResult(resultUrl, {
        userId: user.id,
        authUserId: user.id,
        origin,
      });
      return {
        total: countQueryResultRows(resultCsv, label),
        polls,
        queryJobRowCount: getQueryJobMetadataRowCount(job),
      };
    }

    if (isFailedQueryJob(lastStatus)) {
      throw new Error(`NXT query job for ${label} ${lastStatus.toLocaleLowerCase("en-US")}.`);
    }

    await sleep(QUERY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `NXT is still preparing ${label}. The last saved report remains available; try Refresh data again shortly.`,
  );
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

    const createdJob = await createBlackbaudQueryJob({
      userId: user.id,
      authUserId: user.id,
      origin,
      queryId: row.queryId,
    });
    const jobId = getQueryJobId(createdJob);
    if (!jobId) {
      throw new Error(`NXT did not return a query job ID for ${row.label}.`);
    }
    queryJobs += 1;

    const { total, polls, queryJobRowCount } = await waitForBlackbaudQueryJob({
      user,
      origin,
      jobId,
      label: row.label,
    });
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
          configurationFingerprint: getAlumniFamilyEngagementDashboardFingerprint(dashboard),
          message: countRows.length
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
    });
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
    if (queryTotals.refreshMetrics.queryJobs === 0 && presentedCachedPayload) {
      return Response.json(
        {
          ...presentedCachedPayload,
          refreshMetrics: queryTotals.refreshMetrics,
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
