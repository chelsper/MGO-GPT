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
  createBlackbaudAdHocQueryJob,
  getBlackbaudConfigIssues,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";
import {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";
import {
  buildAlumniDonorQueryDefinition,
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
  getAlumniDonorConfigurationFingerprint,
  getAlumniDonorConstituencyOptions,
  getAlumniDonorCountRows,
  normalizeAlumniDonorConfiguration,
} from "@/app/api/utils/alumniDonorConfiguration";

export const maxDuration = 300;

export const ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY = "report:alumni-family-engagement";
// The old export name is kept so any internal reference remains compatible.
export const ALUMNI_DONOR_TOTAL_QUERIES = getAlumniDonorCountRows(
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
);

const DEFAULT_REPORT_TITLE = "Alumni & Family Engagement";
const DEFAULT_REPORT_DESCRIPTION =
  "Distinct donor totals from configured NXT constituency and gift-credit criteria.";
const QUERY_POLL_INTERVAL_MS = 1500;
const QUERY_MAX_WAIT_MS = 90000;

function getReportPresentation(access, donorConfiguration) {
  return {
    title: String(access?.title || "").trim() || DEFAULT_REPORT_TITLE,
    description:
      String(access?.description || "").trim() || DEFAULT_REPORT_DESCRIPTION,
    sourceKey: donorConfiguration.sourceKey,
    sourceLabel: donorConfiguration.sourceLabel,
  };
}

function getPublicDonorDefinition(donorConfiguration) {
  const constituencyOptions = getAlumniDonorConstituencyOptions(donorConfiguration);
  return {
    sourceKey: donorConfiguration.sourceKey,
    sourceLabel: donorConfiguration.sourceLabel,
    countMethod: "Distinct constituents returned by an NXT Query API job",
    constituencies: constituencyOptions.map((option) => option.label),
    includeSoftCreditedDonors: donorConfiguration.includeSoftCreditedDonors,
    includeMatchingGiftCredits: donorConfiguration.includeMatchingGiftCredits,
    includeInactiveConstituents: donorConfiguration.includeInactiveConstituents,
    includeDeceasedConstituents: donorConfiguration.includeDeceasedConstituents,
    includeConstituentsWithNoValidAddress:
      donorConfiguration.includeConstituentsWithNoValidAddress,
  };
}

function attachReportPresentation({ cachedPayload, donorConfiguration, presentation, countRows }) {
  if (!cachedPayload) return null;

  const configurationFingerprint = getAlumniDonorConfigurationFingerprint(donorConfiguration);
  if (cachedPayload.configurationFingerprint !== configurationFingerprint) return null;

  const cachedTotals = Array.isArray(cachedPayload?.totals) ? cachedPayload.totals : [];
  if (cachedTotals.length !== countRows.length) return null;

  const totalsByKey = new Map(
    cachedTotals.map((total) => [String(total?.key || "").trim(), total]),
  );
  if (countRows.some((row) => !totalsByKey.has(row.key))) return null;

  const { constituencyMembershipCache: ignoredMembershipCache, ...publicPayload } = cachedPayload;
  return {
    ...publicPayload,
    report: presentation,
    donorDefinition: getPublicDonorDefinition(donorConfiguration),
    configurationFingerprint,
    totals: countRows.map((row) => ({
      ...totalsByKey.get(row.key),
      key: row.key,
      label: row.label,
      fiscalYearStart: row.fiscalYearStart,
      fiscalYearEnd: row.fiscalYearEnd,
    })),
  };
}

function getQueryJobId(job) {
  return String(job?.id ?? job?.job_id ?? job?.jobId ?? "").trim();
}

function getQueryJobStatus(job) {
  return String(job?.status ?? job?.state ?? job?.job_status ?? job?.jobStatus ?? "").trim();
}

function getQueryJobRowCount(job) {
  const rowCount = Number(job?.row_count ?? job?.rowCount ?? job?.result?.row_count);
  return Number.isSafeInteger(rowCount) && rowCount >= 0 ? rowCount : null;
}

function isCompletedQueryJob(status) {
  return /^(?:completed|complete|succeeded|success)$/i.test(String(status || "").trim());
}

function isFailedQueryJob(status) {
  return /(?:fail|cancel|error|declin)/i.test(String(status || ""));
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
      const total = getQueryJobRowCount(job);
      if (total === null) {
        throw new Error(
          `NXT completed ${label}, but did not return a row count. The report was not updated.`,
        );
      }
      return { total, polls };
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

async function buildQueryApiDonorTotals({ user, origin, donorConfiguration }) {
  const countRows = getAlumniDonorCountRows(donorConfiguration);
  const totals = [];
  let queryJobPolls = 0;

  // A small sequential job queue avoids burst throttling while keeping this
  // report to a handful of requests instead of one request per donor.
  for (const row of countRows) {
    const query = buildAlumniDonorQueryDefinition(donorConfiguration, row);
    const createdJob = await createBlackbaudAdHocQueryJob({
      userId: user.id,
      authUserId: user.id,
      origin,
      query,
      resultsFileName: `alumni-donor-count-${row.key}.csv`,
    });
    const jobId = getQueryJobId(createdJob);
    if (!jobId) {
      throw new Error(`NXT did not return a query job ID for ${row.label}.`);
    }

    const { total, polls } = await waitForBlackbaudQueryJob({
      user,
      origin,
      jobId,
      label: row.label,
    });
    queryJobPolls += polls;
    totals.push({
      key: row.key,
      label: row.label,
      fiscalYearStart: row.fiscalYearStart,
      fiscalYearEnd: row.fiscalYearEnd,
      total,
    });
  }

  return {
    totals,
    totalRows: totals.reduce((sum, total) => sum + total.total, 0),
    warnings: [],
    refreshMetrics: {
      source: "blackbaud-query-api",
      queryJobs: totals.length,
      queryJobPolls,
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

    const donorConfiguration = normalizeAlumniDonorConfiguration(access.dataConfiguration);
    const countRows = getAlumniDonorCountRows(donorConfiguration);
    const presentation = getReportPresentation(access, donorConfiguration);
    const forceRefresh = shouldBypassReportCache(request);
    const cachedPayload = await getCachedReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY);
    presentedCachedPayload = attachReportPresentation({
      cachedPayload,
      donorConfiguration,
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
          donorDefinition: getPublicDonorDefinition(donorConfiguration),
          configurationFingerprint: getAlumniDonorConfigurationFingerprint(donorConfiguration),
          message:
            "No saved Alumni & Family Engagement snapshot matches this donor definition yet. Select Refresh data to create one.",
        },
        { headers: getReportCacheHeaders("empty") },
      );
    }

    const origin = new URL(request.url).origin;
    const configurationIssues = getBlackbaudConfigIssues(origin);
    if (configurationIssues.length) {
      return Response.json(
        { error: `Blackbaud configuration is incomplete: ${configurationIssues.join(", ")}` },
        { status: 500 },
      );
    }

    const queryTotals = await buildQueryApiDonorTotals({
      user,
      origin,
      donorConfiguration,
    });
    const payload = {
      status: "complete",
      generatedAt: new Date().toISOString(),
      report: presentation,
      donorDefinition: getPublicDonorDefinition(donorConfiguration),
      configurationFingerprint: getAlumniDonorConfigurationFingerprint(donorConfiguration),
      ...queryTotals,
    };
    await saveReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY, payload);

    const publicPayload = attachReportPresentation({
      cachedPayload: payload,
      donorConfiguration,
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
