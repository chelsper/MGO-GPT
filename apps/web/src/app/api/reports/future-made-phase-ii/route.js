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
import sql from "@/app/api/utils/sql";
import {
  createBlackbaudQueryJob,
  downloadBlackbaudQueryResult,
  findBlackbaudQueryByName,
  getBlackbaudConfigIssues,
  getBlackbaudConstituentById,
  getBlackbaudQueryJob,
  listBlackbaudConstituentCustomFields,
} from "@/app/api/utils/blackbaud";
import {
  FUTURE_MADE_PHASE_TWO_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

const QUERY_NAME = "Future. Made. Phase II";
const MAX_QUERY_ROWS = 10000;
const FALLBACK_CUSTOM_FIELD_CATEGORY = "Prospect Research";
const FALLBACK_CUSTOM_FIELD_DESCRIPTION = "Future. Made. Phase II";
const FALLBACK_SCAN_CONCURRENCY = 8;
export const FUTURE_MADE_PHASE_TWO_CACHE_KEY = "report:future-made-phase-ii";
const REPORT_COLUMNS = [
  "Constituent name",
  "Constituent lookup ID",
  "Date added",
  "Added by",
];

function getFutureMadePhaseTwoQueryConfig() {
  const queryId = String(process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_ID || "").trim();
  const queryName = String(
    process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_NAME || QUERY_NAME,
  ).trim();

  return {
    queryId,
    queryName: queryName || QUERY_NAME,
  };
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

function getFutureMadeRefreshWarning(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const traceId = message.match(/\(trace\s+([^)]+)\)/i)?.[1] || null;

  if (isBlackbaudNotFoundError(error)) {
    return [
      "Blackbaud could not refresh the saved Future. Made. Phase II query because its upstream resource was not found.",
      "The saved list was not changed.",
      traceId ? `Blackbaud trace: ${traceId}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return message || "Could not refresh the Future. Made. Phase II report.";
}

function getStaleFutureMadeSnapshotResponse(payload, error) {
  return Response.json(
    {
      ...payload,
      refreshWarning: `${getFutureMadeRefreshWarning(
        error,
      )} Showing the last successful snapshot instead.`,
    },
    { headers: getReportCacheHeaders("stale") },
  );
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function normalizeLooseBlackbaudText(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[.\-_/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSimpleDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[2]}/${match[3]}/${match[1].slice(-2)}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York",
  }).format(parsed);
}

function extractAddedBy(field) {
  const comment = String(field?.comment || "").trim();
  const match = comment.match(/^Added from JUMGOGPT by (.+)$/i);
  return match?.[1]?.trim() || "";
}

function getFallbackDescriptionCandidates(field) {
  const candidates = [
    field?.description,
    field?.value ??
      field?.code_table_entry ??
      field?.code_table_entry_name ??
      field?.code_table_entry_description ??
      field?.codetableentry_value ??
      null,
    field?.value,
    field?.code_table_entry,
    field?.code_table_entry_name,
    field?.code_table_entry_description,
    field?.codetableentry_value,
    field?.comment,
  ];
  return candidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getFallbackPrimaryDescription(field) {
  return getFallbackDescriptionCandidates(field)[0] || "";
}

function fieldMatchesFutureMadePhaseTwo(field) {
  const normalizedCategory = normalizeText(field?.category);
  if (normalizedCategory !== normalizeText(FALLBACK_CUSTOM_FIELD_CATEGORY)) {
    return false;
  }

  const normalizedDescription = normalizeLooseBlackbaudText(
    FALLBACK_CUSTOM_FIELD_DESCRIPTION,
  );
  return getFallbackDescriptionCandidates(field).some(
    (candidate) =>
      normalizeLooseBlackbaudText(candidate) === normalizedDescription,
  );
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function mergeFallbackConstituentRows(rows) {
  const merged = new Map();

  for (const row of rows.flat()) {
    const blackbaudConstituentId = String(row?.blackbaud_constituent_id || "").trim();
    if (!blackbaudConstituentId) continue;

    const existing =
      merged.get(blackbaudConstituentId) || {
        blackbaudConstituentId,
        name: "",
        email: "",
        phone: "",
        sources: new Set(),
      };

    if (!existing.name && row?.name) existing.name = String(row.name).trim();
    if (!existing.email && row?.email) existing.email = String(row.email).trim();
    if (!existing.phone && row?.phone) existing.phone = String(row.phone).trim();
    if (row?.source) existing.sources.add(String(row.source).trim());

    merged.set(blackbaudConstituentId, existing);
  }

  return Array.from(merged.values()).sort((left, right) =>
    String(left.name || left.blackbaudConstituentId).localeCompare(
      String(right.name || right.blackbaudConstituentId),
      "en-US",
    ),
  );
}

async function listFallbackConstituents() {
  const [prospectPoolRows, auditRows, requestRows, constituentRows, portfolioAssignmentRows] =
    await Promise.all([
      sql`
        SELECT
          blackbaud_constituent_id,
          prospect_name AS name,
          email,
          phone,
          'prospect_pool' AS source
        FROM prospect_pool
        WHERE blackbaud_constituent_id IS NOT NULL
          AND TRIM(blackbaud_constituent_id) <> ''
      `,
      sql`
        SELECT
          blackbaud_constituent_id,
          constituent_name AS name,
          NULL::TEXT AS email,
          NULL::TEXT AS phone,
          'assignment_audit' AS source
        FROM prospect_pool_assignment_audits
        WHERE blackbaud_constituent_id IS NOT NULL
          AND TRIM(blackbaud_constituent_id) <> ''
      `,
      sql`
        SELECT
          blackbaud_constituent_id,
          constituent_name AS name,
          NULL::TEXT AS email,
          NULL::TEXT AS phone,
          'data_change_request' AS source
        FROM data_change_requests
        WHERE blackbaud_constituent_id IS NOT NULL
          AND TRIM(blackbaud_constituent_id) <> ''
      `,
      sql`
        SELECT
          blackbaud_constituent_id,
          name,
          NULL::TEXT AS email,
          NULL::TEXT AS phone,
          'constituent' AS source
        FROM constituents
        WHERE blackbaud_constituent_id IS NOT NULL
          AND TRIM(blackbaud_constituent_id) <> ''
      `,
      sql`
        SELECT
          blackbaud_constituent_id,
          NULL::TEXT AS name,
          NULL::TEXT AS email,
          NULL::TEXT AS phone,
          'portfolio_assignment' AS source
        FROM portfolio_category_assignments
        WHERE blackbaud_constituent_id IS NOT NULL
          AND TRIM(blackbaud_constituent_id) <> ''
      `,
    ]);

  return mergeFallbackConstituentRows([
    prospectPoolRows,
    auditRows,
    requestRows,
    constituentRows,
    portfolioAssignmentRows,
  ]);
}

function buildFallbackReportResponse(rows, reason) {
  return {
    status: "complete",
    queryName: QUERY_NAME,
    mode: "custom-field-fallback",
    fallbackReason: reason,
    generatedAt: new Date().toISOString(),
    columns: REPORT_COLUMNS,
    rows,
    totalRows: rows.length,
    truncated: false,
  };
}

async function buildFutureMadePhaseTwoFallbackReport({ user, origin, reason }) {
  const candidates = await listFallbackConstituents();
  if (!candidates.length) {
    return buildFallbackReportResponse([], reason);
  }

  const results = await mapWithConcurrency(
    candidates,
    FALLBACK_SCAN_CONCURRENCY,
    async (candidate) => {
      const customFields = await listBlackbaudConstituentCustomFields({
        userId: user.id,
        authUserId: user.id,
        origin,
        constituentId: candidate.blackbaudConstituentId,
      }).catch(() => []);

      const matchingFields = customFields.filter(fieldMatchesFutureMadePhaseTwo);
      if (!matchingFields.length) {
        return [];
      }

      const profile = await getBlackbaudConstituentById({
        userId: user.id,
        authUserId: user.id,
        origin,
        constituentId: candidate.blackbaudConstituentId,
      }).catch(() => null);

      return matchingFields.map((field, index) => ({
        id: `fallback-${candidate.blackbaudConstituentId}-${field?.id || index + 1}`,
        name:
          profile?.name ||
          candidate.name ||
          `NXT constituent ${candidate.blackbaudConstituentId}`,
        constituentId: candidate.blackbaudConstituentId,
        values: {
          "Constituent name":
            profile?.name ||
            candidate.name ||
            `NXT constituent ${candidate.blackbaudConstituentId}`,
          "Constituent lookup ID": profile?.lookupId || "",
          "Date added": formatSimpleDate(field?.date || ""),
          "Added by": extractAddedBy(field),
        },
      }));
    },
  );

  return buildFallbackReportResponse(results.flat(), reason);
}

async function createFutureMadeQueryJob({
  user,
  origin,
  configuredQueryId,
  queryName,
}) {
  const trimmedConfiguredQueryId = String(configuredQueryId || "").trim();

  if (trimmedConfiguredQueryId) {
    try {
      const createdJob = await createBlackbaudQueryJob({
        userId: user.id,
        origin,
        queryId: trimmedConfiguredQueryId,
      });

      return {
        createdJob,
        query: {
          id: trimmedConfiguredQueryId,
          name: queryName,
        },
        resolvedStaleConfiguredId: false,
      };
    } catch (error) {
      if (!isBlackbaudNotFoundError(error)) throw error;

      const fallbackQuery = await findBlackbaudQueryByName({
        userId: user.id,
        origin,
        name: queryName,
        versions: ["v1"],
      });

      if (!fallbackQuery) {
        return {
          createdJob: null,
          query: {
            id: trimmedConfiguredQueryId,
            name: queryName,
          },
          resolvedStaleConfiguredId: false,
        };
      }

      const createdJob = await createBlackbaudQueryJob({
        userId: user.id,
        origin,
        queryId: fallbackQuery.id,
      });

      return {
        createdJob,
        query: fallbackQuery,
        resolvedStaleConfiguredId: true,
      };
    }
  }

  const query = await findBlackbaudQueryByName({
    userId: user.id,
    origin,
    name: queryName,
    versions: ["v1"],
  });

  if (!query) {
    return {
      createdJob: null,
      query: null,
      resolvedStaleConfiguredId: false,
    };
  }

  const createdJob = await createBlackbaudQueryJob({
    userId: user.id,
    origin,
    queryId: query.id,
  }).catch((error) => {
    if (isBlackbaudNotFoundError(error)) {
      return null;
    }
    throw error;
  });

  return {
    createdJob,
    query,
    resolvedStaleConfiguredId: false,
  };
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

function normalizeColumnName(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "");
}

function findValue(values, aliases) {
  const matchingEntry = Object.entries(values).find(([header]) =>
    aliases.includes(normalizeColumnName(header)),
  );
  return String(matchingEntry?.[1] || "").trim();
}

function getRowName(values, rowNumber) {
  const directName = findValue(values, [
    "constituentname",
    "fullname",
    "name",
    "constituent",
  ]);
  if (directName) return directName;

  const firstName = findValue(values, ["firstname", "first"]);
  const lastName = findValue(values, ["lastname", "last"]);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  if (combinedName) return combinedName;

  const lookupId = findValue(values, ["constituentlookupid", "lookupid"]);
  return lookupId ? `NXT constituent ${lookupId}` : `Query row ${rowNumber}`;
}

function getConstituentId(values) {
  const aliasPriority = [
    "constituentsystemrecordid",
    "systemrecordid",
    "constituentid",
    "constituentlookupid",
    "lookupid",
    "recordid",
  ];

  for (const alias of aliasPriority) {
    const match = Object.entries(values).find(
      ([header]) => normalizeColumnName(header) === alias,
    );
    const value = String(match?.[1] || "").trim();
    if (value) return value;
  }

  return "";
}

function getLookupId(values) {
  return findValue(values, ["constituentlookupid", "lookupid"]);
}

function parseQueryResult(content) {
  const records = parseCsv(content);
  if (!records.length) return { columns: [], rows: [], totalRows: 0, truncated: false };

  const columns = getUniqueHeaders(records[0]);
  const sourceRows = records.slice(1);
  const rows = sourceRows.slice(0, MAX_QUERY_ROWS).map((record, index) => {
    const values = Object.fromEntries(
      columns.map((column, columnIndex) => [column, String(record[columnIndex] || "").trim()]),
    );
    const rowNumber = index + 1;
    return {
      id: `query-row-${rowNumber}`,
      name: getRowName(values, rowNumber),
      constituentId: getConstituentId(values),
      values,
    };
  });

  return {
    columns,
    rows,
    totalRows: sourceRows.length,
    truncated: sourceRows.length > rows.length,
  };
}

async function enrichQueryRows({ rows, user, origin }) {
  const results = await mapWithConcurrency(
    rows,
    FALLBACK_SCAN_CONCURRENCY,
    async (row) => {
      const blackbaudConstituentId = String(row?.constituentId || "").trim();
      let matchedField = null;
      let profile = null;

      if (blackbaudConstituentId) {
        const customFields = await listBlackbaudConstituentCustomFields({
          userId: user.id,
          authUserId: user.id,
          origin,
          constituentId: blackbaudConstituentId,
        }).catch(() => []);

        matchedField = (Array.isArray(customFields) ? customFields : []).find(
          fieldMatchesFutureMadePhaseTwo,
        ) || null;

        profile = await getBlackbaudConstituentById({
          userId: user.id,
          authUserId: user.id,
          origin,
          constituentId: blackbaudConstituentId,
        }).catch(() => null);
      }

      const constituentName =
        profile?.name ||
        row?.values?.["Constituent name"] ||
        row?.name ||
        `NXT constituent ${blackbaudConstituentId || row?.id}`;
      const lookupId =
        profile?.lookupId ||
        getLookupId(row?.values || {}) ||
        "";

      return {
        id: row.id,
        name: constituentName,
        constituentId: blackbaudConstituentId,
        values: {
          "Constituent name": constituentName,
          "Constituent lookup ID": lookupId,
          "Date added": formatSimpleDate(matchedField?.date || ""),
          "Added by": extractAddedBy(matchedField),
        },
      };
    },
  );

  return results;
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
  let forceRefresh = false;
  let presentedCachedPayload = null;
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const internalRefresh = isAuthorizedReportRefreshRequest(request);
    const access = await getReportAccessForUser(FUTURE_MADE_PHASE_TWO_REPORT_KEY, user);
    if (!internalRefresh && !access.canView) {
      return Response.json(
        { error: "Future. Made. Phase II is not shared with you." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    forceRefresh = shouldBypassReportCache(request);
    const queryConfig = getFutureMadePhaseTwoQueryConfig();
    let jobId = searchParams.get("jobId")?.trim() || "";
    let query = null;
    let jobStartedThisRequest = false;
    let resolvedStaleConfiguredId = false;
    presentedCachedPayload = await getCachedReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY);

    if (!jobId && !forceRefresh) {
      if (presentedCachedPayload) {
        return Response.json(presentedCachedPayload, {
          headers: getReportCacheHeaders("hit"),
        });
      }

      return Response.json(
        {
          status: "refresh_required",
          message:
            "No saved Future. Made. Phase II snapshot is available yet. Select Run query again to create one.",
        },
        { headers: getReportCacheHeaders("empty") },
      );
    }

    const origin = new URL(request.url).origin;
    const configurationIssues = getBlackbaudConfigIssues(origin);
    if (configurationIssues.length) {
      throw new Error(`Blackbaud configuration is incomplete: ${configurationIssues.join(", ")}`);
    }

    if (!jobId) {
      const result = await createFutureMadeQueryJob({
        user,
        origin,
        configuredQueryId: queryConfig.queryId,
        queryName: queryConfig.queryName,
      });
      query = result.query;
      resolvedStaleConfiguredId = result.resolvedStaleConfiguredId;

      if (!query) {
        const refreshError = new Error(
          `Saved NXT query \"${queryConfig.queryName}\" was not found in Blackbaud Query v1.`,
        );
        if (presentedCachedPayload) {
          return getStaleFutureMadeSnapshotResponse(presentedCachedPayload, refreshError);
        }

        const fallbackPayload = await buildFutureMadePhaseTwoFallbackReport({
          user,
          origin,
          reason: `Saved NXT query \"${queryConfig.queryName}\" was not found in Blackbaud Query v1.`,
        });
        await saveReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY, fallbackPayload);
        return Response.json(fallbackPayload, {
          headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
        });
      }

      if (!result.createdJob) {
        const configuredLabel = queryConfig.queryId
          ? `Configured query ID ${queryConfig.queryId}`
          : `Saved NXT query \"${query.name || queryConfig.queryName}\"`;
        const refreshError = new Error(
          `${configuredLabel} could not be executed in Blackbaud Query v1.`,
        );
        if (presentedCachedPayload) {
          return getStaleFutureMadeSnapshotResponse(presentedCachedPayload, refreshError);
        }

        const fallbackPayload = await buildFutureMadePhaseTwoFallbackReport({
          user,
          origin,
          reason: `${configuredLabel} could not be executed in Blackbaud Query v1.`,
        });
        await saveReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY, fallbackPayload);
        return Response.json(fallbackPayload, {
          headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
        });
      }

      const createdJob = result.createdJob;
      jobStartedThisRequest = true;
      jobId = getQueryJobId(createdJob);
      if (!jobId) {
        throw new Error("Blackbaud did not return a query job ID.");
      }
    }

    let job;
    try {
      job = await getBlackbaudQueryJob({ userId: user.id, origin, jobId });
    } catch (error) {
      // Blackbaud can briefly return 404 while a newly created query job is
      // being materialized. Return a pollable response once, without masking a
      // persistent missing-job error on subsequent client polls.
      if (jobStartedThisRequest && isBlackbaudNotFoundError(error)) {
        return Response.json(
          {
            status: "running",
            jobId,
            queryName: query?.name || queryConfig.queryName,
            jobStatus: resolvedStaleConfiguredId ? "Starting (re-resolved query ID)" : "Starting",
          },
          { status: 202, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      if (isBlackbaudNotFoundError(error)) {
        if (presentedCachedPayload) {
          return getStaleFutureMadeSnapshotResponse(presentedCachedPayload, error);
        }

        const fallbackPayload = await buildFutureMadePhaseTwoFallbackReport({
          user,
          origin,
          reason: `Saved NXT query job ${jobId} could not be read in Blackbaud Query v1.`,
        });
        await saveReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY, fallbackPayload);
        return Response.json(fallbackPayload, {
          headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
        });
      }
      throw error;
    }
    const status = getQueryJobStatus(job);
    const resultUrl = getQueryResultUrl(job);
    if (!resultUrl) {
      if (isFailedQueryJob(status)) {
        throw new Error(`The NXT query job ${status || "failed"}.`);
      }
      return Response.json(
        {
          status: "running",
          jobId,
          queryName: query?.name || queryConfig.queryName,
          jobStatus: status || "Queued",
        },
        { status: 202, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    let content;
    try {
      content = await downloadBlackbaudQueryResult(resultUrl);
    } catch (error) {
      if (isBlackbaudNotFoundError(error)) {
        if (presentedCachedPayload) {
          return getStaleFutureMadeSnapshotResponse(presentedCachedPayload, error);
        }

        const fallbackPayload = await buildFutureMadePhaseTwoFallbackReport({
          user,
          origin,
          reason: `Saved NXT query results for job ${jobId} could not be downloaded from Blackbaud Query v1.`,
        });
        await saveReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY, fallbackPayload);
        return Response.json(fallbackPayload, {
          headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
        });
      }
      throw error;
    }
    const parsedResult = parseQueryResult(content);
    const enrichedRows = await enrichQueryRows({
      rows: parsedResult.rows,
      user,
      origin,
    });

    const payload = {
      status: "complete",
      jobId,
      queryName: query?.name || queryConfig.queryName,
      generatedAt: new Date().toISOString(),
      columns: REPORT_COLUMNS,
      rows: enrichedRows,
      totalRows: parsedResult.totalRows,
      truncated: parsedResult.truncated,
    };
    await saveReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY, payload);

    return Response.json(payload, {
      headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
    });
  } catch (error) {
    console.error("Future. Made. Phase II report error:", error);
    if (presentedCachedPayload) {
      return getStaleFutureMadeSnapshotResponse(presentedCachedPayload, error);
    }

    if (isBlackbaudNotFoundError(error)) {
      const user = await getCurrentUser(request);
      if (user) {
        const origin = new URL(request.url).origin;
        const fallbackPayload = await buildFutureMadePhaseTwoFallbackReport({
          user,
          origin,
          reason: "Blackbaud Query v1 returned a resource-not-found response while running this saved query.",
        });
        await saveReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY, fallbackPayload);
        return Response.json(fallbackPayload, {
          headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
        });
      }
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not run the Future. Made. Phase II query.",
      },
      { status: 500 },
    );
  }
}
