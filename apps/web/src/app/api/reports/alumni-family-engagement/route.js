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
import { getCurrentFiscalYearWindow } from "@/app/api/utils/currentFyGiving";
import {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

const MAX_QUERY_ROWS = 10000;
export const ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY = "report:alumni-family-engagement";
export const ALUMNI_DONOR_TOTAL_QUERIES = [
  {
    key: "fy27",
    label: "FY27 Alumni Donor Total",
    queryId: "30976",
  },
  {
    key: "fy26",
    label: "FY26 Alumni Donor Total",
    queryId: "30679",
  },
];

const CONSTITUENT_ID_ALIASES = [
  "constituentsystemrecordid",
  "systemrecordid",
  "constituentrecordid",
  "constituentid",
  "constituentlookupid",
  "lookupid",
  "recordid",
];
const LOOKUP_ID_ALIASES = ["constituentlookupid", "lookupid"];
const NAME_ALIASES = ["constituentname", "fullname", "name", "constituent"];
const CONSTITUENCY_ALIASES = [
  "constituencycode",
  "constituency",
  "constituencydescription",
  "constituencycodedescription",
];
const GIFT_DATE_ALIASES = ["giftdate", "cashreceiveddate", "receiveddate"];
const GIFT_TYPE_ALIASES = [
  "gifttype",
  "revenuetype",
  "transactiontype",
  "paymenttype",
  "cashreceivedtype",
];
const CREDIT_TYPE_ALIASES = [
  "credittype",
  "giftcredittype",
  "recognitioncredittype",
  "credittypedescription",
];

function normalizeColumnName(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(content) {
  const records = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const text = String(content || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    records.push(row);
  }

  return records.filter((record) => record.some((value) => String(value || "").trim()));
}

function getUniqueHeaders(headerRow) {
  const used = new Map();
  return headerRow.map((header, index) => {
    const base = String(header || "").trim() || `Column ${index + 1}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function hasAnyColumn(columns, aliases) {
  return columns.some((column) => aliases.includes(normalizeColumnName(column)));
}

function findValue(values, aliases) {
  const matchingEntry = Object.entries(values).find(([header]) =>
    aliases.includes(normalizeColumnName(header)),
  );
  return String(matchingEntry?.[1] || "").trim();
}

function getQueryJobId(job) {
  return String(job?.id ?? job?.job_id ?? job?.jobId ?? "").trim();
}

function getQueryJobStatus(job) {
  return String(job?.status ?? job?.state ?? job?.job_status ?? job?.jobStatus ?? "").trim();
}

function getQueryResultUrl(job) {
  const candidates = [
    job?.sas_uri,
    job?.sasUri,
    job?.result_uri,
    job?.resultUri,
    job?.result_file_url,
    job?.resultFileUrl,
    job?.download_url,
    job?.downloadUrl,
    job?.result?.sas_uri,
    job?.result?.sasUri,
    job?.result?.download_url,
    job?.result?.downloadUrl,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || null;
}

function isFailedQueryJob(status) {
  return /(?:fail|cancel|error)/i.test(status);
}

function isBlackbaudNotFoundError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /(?:404|not found|resource not found)/i.test(message);
}

function getQueryJobParameterName(query) {
  return `${query.key}JobId`;
}

function getQueryJobPollingParameters(queryJobs) {
  return Object.fromEntries(
    queryJobs.map(({ query, jobId }) => [getQueryJobParameterName(query), jobId]),
  );
}

function getSavedQueryTotal(content) {
  const records = parseCsv(content);
  return Math.max(records.length - 1, 0);
}

function createRunningPayload({ queryJobs, queryStatuses = {} }) {
  return {
    status: "running",
    poll: getQueryJobPollingParameters(queryJobs),
    queries: queryJobs.map(({ query, jobId }) => ({
      key: query.key,
      label: query.label,
      queryId: query.queryId,
      jobId,
      jobStatus: queryStatuses[query.key] || "Queued",
    })),
  };
}

function getRowName(values, constituentId, rowNumber) {
  const name = findValue(values, NAME_ALIASES);
  if (name) return name;

  const firstName = findValue(values, ["firstname", "first"]);
  const lastName = findValue(values, ["lastname", "last"]);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  return combinedName || `NXT constituent ${constituentId || rowNumber}`;
}

function isAlumniConstituency(value) {
  return normalizeText(value).startsWith("alumni");
}

function parseDate(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isInFiscalYear(value, fiscalYear) {
  const date = parseDate(value);
  if (!date) return null;

  const start = new Date(`${fiscalYear.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${fiscalYear.endDate}T23:59:59Z`).getTime();
  const timestamp = date.getTime();
  return timestamp >= start && timestamp <= end;
}

function classifyCredit(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "Unspecified credit";
  if (normalized.includes("soft")) return "Soft credit";
  if (normalized.includes("direct") || normalized.includes("hard")) return "Direct credit";
  return String(value || "").trim();
}

function sortDonors(left, right) {
  return String(left?.name || "").localeCompare(String(right?.name || ""), "en", {
    sensitivity: "base",
  });
}

export function buildAlumniDonorReport(content, { fiscalYear = getCurrentFiscalYearWindow() } = {}) {
  const records = parseCsv(content);
  if (!records.length) {
    return {
      fiscalYear,
      donors: [],
      metrics: {
        alumniDonors: 0,
        directCreditDonors: 0,
        softCreditDonors: 0,
        totalSourceRows: 0,
        qualifyingCreditRows: 0,
        duplicateCreditsCollapsed: 0,
        excludedNonAlumniRows: 0,
        excludedOutOfRangeRows: 0,
        excludedNonCashRows: 0,
        rowsMissingConstituentId: 0,
      },
      warnings: ["The saved NXT query did not return any rows."],
      truncated: false,
    };
  }

  const columns = getUniqueHeaders(records[0]);
  const sourceRows = records.slice(1);
  const rows = sourceRows.slice(0, MAX_QUERY_ROWS);
  const hasConstituency = hasAnyColumn(columns, CONSTITUENCY_ALIASES);
  const hasGiftDate = hasAnyColumn(columns, GIFT_DATE_ALIASES);
  const hasGiftType = hasAnyColumn(columns, GIFT_TYPE_ALIASES);
  const hasCreditType = hasAnyColumn(columns, CREDIT_TYPE_ALIASES);
  const hasConstituentId = hasAnyColumn(columns, CONSTITUENT_ID_ALIASES);
  const warnings = [];

  if (!hasConstituentId) {
    warnings.push(
      "The saved query does not include a recognized constituent system record ID or lookup ID column. No donor count can be verified until it does.",
    );
  }
  if (!hasConstituency) {
    warnings.push(
      "The saved query does not include a constituency code column. The report trusts the query's Alumni criterion.",
    );
  }
  if (!hasGiftDate) {
    warnings.push(
      "The saved query does not include a Cash Received gift date column. The report trusts the query's current fiscal-year criterion.",
    );
  }
  if (!hasGiftType) {
    warnings.push(
      "The saved query does not include a gift-type column. This does not affect the count because the saved query's Cash Received criteria control eligibility.",
    );
  }
  if (!hasCreditType) {
    warnings.push(
      "The saved query does not include a credit type column. The total still counts distinct credited constituents, but direct and soft-credit subtotals are unavailable.",
    );
  }

  const donorsById = new Map();
  let qualifyingCreditRows = 0;
  let duplicateCreditsCollapsed = 0;
  let excludedNonAlumniRows = 0;
  let excludedOutOfRangeRows = 0;
  let excludedNonCashRows = 0;
  let rowsMissingConstituentId = 0;

  rows.forEach((record, index) => {
    const values = Object.fromEntries(
      columns.map((column, columnIndex) => [column, String(record[columnIndex] || "").trim()]),
    );
    const constituentId = findValue(values, CONSTITUENT_ID_ALIASES);
    const constituency = findValue(values, CONSTITUENCY_ALIASES);
    const giftDate = findValue(values, GIFT_DATE_ALIASES);
    const giftType = findValue(values, GIFT_TYPE_ALIASES);
    const creditType = findValue(values, CREDIT_TYPE_ALIASES);

    if (!constituentId) {
      rowsMissingConstituentId += 1;
      return;
    }
    if (hasConstituency && !isAlumniConstituency(constituency)) {
      excludedNonAlumniRows += 1;
      return;
    }
    if (hasGiftDate) {
      const inFiscalYear = isInFiscalYear(giftDate, fiscalYear);
      if (inFiscalYear !== true) {
        excludedOutOfRangeRows += 1;
        return;
      }
    }
    // The configured saved query, rather than a display column, is the source
    // of truth for Cash Received eligibility. NXT can label received revenue
    // as Donation, Pledge Payment, Matching Gift Payment, and other values.
    qualifyingCreditRows += 1;
    const existing = donorsById.get(constituentId);
    if (existing) {
      duplicateCreditsCollapsed += 1;
      existing.creditTypes.add(classifyCredit(creditType));
      if (classifyCredit(creditType) === "Soft credit") existing.hasSoftCredit = true;
      if (classifyCredit(creditType) === "Direct credit") existing.hasDirectCredit = true;
      const currentGiftDate = parseDate(existing.giftDate);
      const nextGiftDate = parseDate(giftDate);
      if (nextGiftDate && (!currentGiftDate || nextGiftDate > currentGiftDate)) {
        existing.giftDate = giftDate;
        existing.giftType = giftType;
      }
      return;
    }

    const normalizedCreditType = classifyCredit(creditType);
    donorsById.set(constituentId, {
      id: `alumni-donor-${constituentId}`,
      constituentId,
      lookupId: findValue(values, LOOKUP_ID_ALIASES),
      name: getRowName(values, constituentId, index + 1),
      constituency,
      giftDate,
      giftType,
      creditTypes: new Set([normalizedCreditType]),
      hasSoftCredit: normalizedCreditType === "Soft credit",
      hasDirectCredit: normalizedCreditType === "Direct credit",
    });
  });

  const donors = Array.from(donorsById.values())
    .map((donor) => ({
      ...donor,
      creditTypes: Array.from(donor.creditTypes).sort(),
    }))
    .sort(sortDonors);

  return {
    fiscalYear,
    donors,
    metrics: {
      alumniDonors: donors.length,
      directCreditDonors: donors.filter((donor) => donor.hasDirectCredit).length,
      softCreditDonors: donors.filter((donor) => donor.hasSoftCredit).length,
      totalSourceRows: sourceRows.length,
      qualifyingCreditRows,
      duplicateCreditsCollapsed,
      excludedNonAlumniRows,
      excludedOutOfRangeRows,
      excludedNonCashRows,
      rowsMissingConstituentId,
    },
    warnings,
    truncated: sourceRows.length > rows.length,
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

    const fiscalYear = getCurrentFiscalYearWindow();
    const { searchParams } = new URL(request.url);
    const forceRefresh = shouldBypassReportCache(request);
    const requestedQueryJobs = ALUMNI_DONOR_TOTAL_QUERIES.map((query) => ({
      query,
      jobId: searchParams.get(getQueryJobParameterName(query))?.trim() || "",
    }));
    const hasPollingJobs = requestedQueryJobs.some(({ jobId }) => Boolean(jobId));
    const hasEveryPollingJob = requestedQueryJobs.every(({ jobId }) => Boolean(jobId));

    if (hasPollingJobs && !hasEveryPollingJob) {
      return Response.json(
        { error: "Both alumni donor query jobs are required while the report is refreshing." },
        { status: 400 },
      );
    }

    if (!hasPollingJobs && !forceRefresh) {
      const cachedPayload = await getCachedReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY);
      if (cachedPayload) {
        return Response.json(cachedPayload, { headers: getReportCacheHeaders("hit") });
      }

      return Response.json(
        {
          status: "refresh_required",
          fiscalYear,
          message:
            "No saved Alumni & Family Engagement snapshot is available yet. Select Refresh data to create one.",
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

    const activeQueryJobs = await Promise.all(
      requestedQueryJobs.map(async ({ query, jobId }) => {
        if (jobId) return { query, jobId, started: false };

        const createdJob = await createBlackbaudQueryJob({
          userId: user.id,
          origin,
          queryId: query.queryId,
        });
        const createdJobId = getQueryJobId(createdJob);
        if (!createdJobId) {
          throw new Error(`Blackbaud did not return a job ID for ${query.label}.`);
        }
        return { query, jobId: createdJobId, started: true };
      }),
    );

    const checkedQueryJobs = await Promise.all(
      activeQueryJobs.map(async (activeQueryJob) => {
        try {
          const job = await getBlackbaudQueryJob({
            userId: user.id,
            origin,
            jobId: activeQueryJob.jobId,
          });
          return { ...activeQueryJob, job };
        } catch (error) {
          // Query jobs can briefly return 404 immediately after creation while
          // NXT materializes them. Keep both IDs so the next poll resumes them.
          if (activeQueryJob.started && isBlackbaudNotFoundError(error)) {
            return { ...activeQueryJob, job: null, starting: true };
          }
          throw error;
        }
      }),
    );

    const failedQueryJob = checkedQueryJobs.find(({ job }) =>
      job && isFailedQueryJob(getQueryJobStatus(job)),
    );
    if (failedQueryJob) {
      return Response.json(
        {
          error: `${failedQueryJob.query.label} could not run in NXT (${getQueryJobStatus(failedQueryJob.job) || "failed"}).`,
        },
        { status: 502 },
      );
    }

    const queryStatuses = Object.fromEntries(
      checkedQueryJobs.map(({ query, job, starting }) => [
        query.key,
        starting ? "Starting" : getQueryJobStatus(job) || "Queued",
      ]),
    );
    const isAnyQueryStillRunning = checkedQueryJobs.some(
      ({ job }) => !getQueryResultUrl(job),
    );
    if (isAnyQueryStillRunning) {
      return Response.json(
        {
          ...createRunningPayload({ queryJobs: activeQueryJobs, queryStatuses }),
          fiscalYear,
        },
        { status: 202, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const totals = await Promise.all(
      checkedQueryJobs.map(async ({ query, job }) => {
        const content = await downloadBlackbaudQueryResult(getQueryResultUrl(job));
        return {
          key: query.key,
          label: query.label,
          queryId: query.queryId,
          total: getSavedQueryTotal(content),
        };
      }),
    );
    const payload = {
      status: "complete",
      fiscalYear,
      generatedAt: new Date().toISOString(),
      totals,
      totalRows: totals.reduce((total, result) => total + result.total, 0),
    };
    await saveReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY, payload);

    return Response.json(payload, {
      headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
    });
  } catch (error) {
    console.error("Alumni & Family Engagement report error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not run the Alumni & Family Engagement report.",
      },
      { status: 500 },
    );
  }
}
