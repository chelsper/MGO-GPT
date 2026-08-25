import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
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
  findBlackbaudQueryByName,
  getBlackbaudConfigIssues,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";
import { getCurrentFiscalYearWindow } from "@/app/api/utils/currentFyGiving";
import {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

const DEFAULT_QUERY_NAME = "Alumni Donors FY27";
const LEGACY_DEFAULT_QUERY_NAME = "alumni & family engagement";
const MAX_QUERY_ROWS = 10000;
export const ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY = "report:alumni-family-engagement";

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

async function getSourceQueryConfiguration() {
  const records = await sql`
    SELECT source_query_id, source_query_name
    FROM report_configurations
    WHERE report_key = ${ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY}
    LIMIT 1
  `;
  const record = records[0] || {};
  const queryId = String(
    record.source_query_id || process.env.BLACKBAUD_ALUMNI_FAMILY_ENGAGEMENT_QUERY_ID || "",
  ).trim();
  const configuredQueryName = String(
    record.source_query_name || process.env.BLACKBAUD_ALUMNI_FAMILY_ENGAGEMENT_QUERY_NAME || "",
  ).trim();
  const queryName =
    configuredQueryName.toLocaleLowerCase("en-US") === LEGACY_DEFAULT_QUERY_NAME
      ? DEFAULT_QUERY_NAME
      : configuredQueryName || DEFAULT_QUERY_NAME;
  const usesLegacyDefault =
    configuredQueryName.toLocaleLowerCase("en-US") === LEGACY_DEFAULT_QUERY_NAME;

  return {
    // The original generic report configuration must not keep pointing to its
    // old query after the report has been moved to the dedicated FY27 source.
    queryId: usesLegacyDefault ? "" : queryId,
    queryName: queryName || DEFAULT_QUERY_NAME,
  };
}

async function resolveSourceQueryConfiguration({ user, origin, configuration }) {
  if (configuration.queryId) return configuration;

  const query = await findBlackbaudQueryByName({
    userId: user.id,
    origin,
    name: configuration.queryName,
    versions: ["v1"],
  });
  if (!query?.id) return configuration;

  await sql`
    UPDATE report_configurations
    SET
      source_query_id = ${query.id},
      source_query_name = ${query.name || configuration.queryName},
      updated_at = NOW()
    WHERE report_key = ${ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY}
  `;

  return {
    queryId: String(query.id),
    queryName: String(query.name || configuration.queryName),
  };
}

function createSetupPayload({ fiscalYear, queryName }) {
  return {
    status: "setup_required",
    fiscalYear,
    query: { id: "", name: queryName },
    message:
      "An administrator must add this report's saved NXT query ID in Report Access before it can run.",
  };
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
    const jobId = searchParams.get("jobId")?.trim() || "";

    if (!jobId && !forceRefresh) {
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
    const configuredQuery = await getSourceQueryConfiguration();
    const queryConfig = await resolveSourceQueryConfiguration({
      user,
      origin,
      configuration: configuredQuery,
    });
    if (!queryConfig.queryId) {
      return Response.json(createSetupPayload({ fiscalYear, queryName: queryConfig.queryName }), {
        headers: getReportCacheHeaders("setup"),
      });
    }

    const configurationIssues = getBlackbaudConfigIssues(origin);
    if (configurationIssues.length) {
      return Response.json(
        { error: `Blackbaud configuration is incomplete: ${configurationIssues.join(", ")}` },
        { status: 500 },
      );
    }

    let activeJobId = jobId;
    let jobStartedThisRequest = false;
    if (!activeJobId) {
      const createdJob = await createBlackbaudQueryJob({
        userId: user.id,
        origin,
        queryId: queryConfig.queryId,
      });
      activeJobId = getQueryJobId(createdJob);
      jobStartedThisRequest = true;
      if (!activeJobId) {
        throw new Error("Blackbaud did not return a query job ID.");
      }
    }

    let job;
    try {
      job = await getBlackbaudQueryJob({ userId: user.id, origin, jobId: activeJobId });
    } catch (error) {
      // Query v1 jobs can briefly return 404 immediately after creation while
      // Blackbaud materializes the job. Subsequent client polling uses the ID.
      if (jobStartedThisRequest && isBlackbaudNotFoundError(error)) {
        return Response.json(
          {
            status: "running",
            jobId: activeJobId,
            query: queryConfig,
            fiscalYear,
            jobStatus: "Starting",
          },
          { status: 202, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      throw error;
    }
    const jobStatus = getQueryJobStatus(job);
    const resultUrl = getQueryResultUrl(job);
    if (!resultUrl) {
      if (isFailedQueryJob(jobStatus)) {
        return Response.json(
          { error: `The NXT query job ${jobStatus || "failed"}.`, jobId: activeJobId },
          { status: 502 },
        );
      }
      return Response.json(
        {
          status: "running",
          jobId: activeJobId,
          query: queryConfig,
          fiscalYear,
          jobStatus: jobStatus || "Queued",
        },
        { status: 202, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const content = await downloadBlackbaudQueryResult(resultUrl);
    const parsed = buildAlumniDonorReport(content, { fiscalYear });
    const payload = {
      status: "complete",
      jobId: activeJobId,
      query: queryConfig,
      generatedAt: new Date().toISOString(),
      ...parsed,
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
