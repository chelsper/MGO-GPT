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
  createBlackbaudQueryJob,
  downloadBlackbaudQueryResult,
  getBlackbaudConfigIssues,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";
import {
  customFieldReportCacheKey,
  serializeCustomFieldReport,
} from "@/app/api/utils/customFieldReports";
import { getDirectCustomFieldQueryDefinition } from "@/app/api/utils/directCustomFieldQuery";
import { getCustomFieldReportAccessForUser } from "@/app/api/utils/reportAccess";

const MAX_QUERY_ROWS = 10000;

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

function isCompletedQueryJob(status) {
  return /^(?:completed|complete|succeeded|success)$/i.test(String(status || "").trim());
}

function getQueryJobRowCount(job) {
  const rowCount = Number(
    job?.row_count ??
      job?.rowCount ??
      job?.total_rows ??
      job?.totalRows ??
      job?.record_count ??
      job?.recordCount ??
      job?.result?.row_count ??
      job?.result?.rowCount ??
      job?.result?.total_rows ??
      job?.result?.totalRows ??
      job?.result?.record_count ??
      job?.result?.recordCount,
  );
  return Number.isSafeInteger(rowCount) && rowCount >= 0 ? rowCount : null;
}

function isDirectCustomFieldReport(report) {
  return !String(report?.sourceQueryId || "").trim();
}

function getDirectQueryPresentation(report) {
  return {
    mode: "direct-custom-field",
    category: report.fieldCategory,
    description: report.fieldDescription,
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

function parseQueryResult(content) {
  const records = parseCsv(content);
  if (!records.length) {
    return { columns: [], rows: [], totalRows: 0, truncated: false };
  }

  const columns = getUniqueHeaders(records[0]);
  const sourceRows = records.slice(1);
  const rows = sourceRows.slice(0, MAX_QUERY_ROWS).map((record, index) => ({
    id: `query-row-${index + 1}`,
    values: Object.fromEntries(
      columns.map((column, columnIndex) => [column, String(record[columnIndex] || "").trim()]),
    ),
  }));

  return {
    columns,
    rows,
    totalRows: sourceRows.length,
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

function getReportPayload(record) {
  // The caller has already passed the explicit-assignment access check. The
  // value is serialized only for rendering this report snapshot.
  return serializeCustomFieldReport(record, true);
}

function getBlackbaudTraceId(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.match(/\(trace\s+([^)]+)\)/i)?.[1] || null;
}

function getCustomFieldRefreshFailureMessage(error, isDirectReport) {
  const message = error instanceof Error ? error.message : String(error || "");
  const traceId = getBlackbaudTraceId(error);

  if (isDirectReport && /(?:404|not found|resource could not be found)/i.test(message)) {
    return [
      "Blackbaud could not refresh this report's custom-field metadata.",
      "The report configuration was not changed.",
      traceId ? `Blackbaud trace: ${traceId}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return message || "Could not load this Custom Field Report.";
}

export async function GET(request, { params }) {
  let presentedCachedPayload = null;
  let directCustomFieldReport = false;

  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slug = String(params?.slug || "").trim();
    const internalRefresh = isAuthorizedReportRefreshRequest(request);
    const access = await getCustomFieldReportAccessForUser(slug, user);
    if (!access) {
      return Response.json({ error: "Custom Field Report not found." }, { status: 404 });
    }
    if (internalRefresh && !access.record?.active) {
      return Response.json(
        { error: "This Custom Field Report is disabled and cannot be refreshed." },
        { status: 404 },
      );
    }
    if (!internalRefresh && !access.canView) {
      return Response.json(
        { error: "This Custom Field Report has not been enabled for you." },
        { status: 403 },
      );
    }

    const report = getReportPayload(access.record);
    const cacheKey = customFieldReportCacheKey(report.slug);
    const { searchParams } = new URL(request.url);
    const forceRefresh = shouldBypassReportCache(request);
    let jobId = searchParams.get("jobId")?.trim() || "";
    directCustomFieldReport = isDirectCustomFieldReport(report);

    const cachedPayload = await getCachedReportSnapshot(cacheKey);
    presentedCachedPayload = cachedPayload ? { ...cachedPayload, report } : null;

    if (!jobId && !forceRefresh) {
      if (presentedCachedPayload) {
        return Response.json(presentedCachedPayload, { headers: getReportCacheHeaders("hit") });
      }

      return Response.json(
        {
          status: "refresh_required",
          report,
          message: "No saved report snapshot is available yet. Select Refresh data to create one.",
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
      const createdJob = directCustomFieldReport
        ? await createBlackbaudAdHocQueryJob({
            userId: user.id,
            authUserId: user.id,
            origin,
            query: await getDirectCustomFieldQueryDefinition({
              userId: user.id,
              authUserId: user.id,
              origin,
              fieldCategory: report.fieldCategory,
              fieldDescription: report.fieldDescription,
            }),
            resultsFileName: `custom-field-count-${report.slug}.csv`,
          })
        : await createBlackbaudQueryJob({
            userId: user.id,
            origin,
            queryId: report.sourceQueryId,
          });
      jobId = getQueryJobId(createdJob);
      if (!jobId) {
        throw new Error("Blackbaud did not return a custom-field query job ID.");
      }
    }

    const job = await getBlackbaudQueryJob({
      userId: user.id,
      authUserId: user.id,
      origin,
      jobId,
    });
    const jobStatus = getQueryJobStatus(job);

    if (directCustomFieldReport) {
      if (isFailedQueryJob(jobStatus)) {
        throw new Error(`The NXT custom-field query ${jobStatus || "failed"}.`);
      }

      if (!isCompletedQueryJob(jobStatus)) {
        return Response.json(
          {
            status: "running",
            report,
            jobId,
            query: getDirectQueryPresentation(report),
            jobStatus: jobStatus || "Queued",
            poll: { jobId },
          },
          { status: 202, headers: { "Cache-Control": "private, no-store" } },
        );
      }

      const totalRows = getQueryJobRowCount(job);
      if (totalRows === null) {
        throw new Error(
          "NXT completed the custom-field report refresh but did not return a matching-constituent count.",
        );
      }

      const payload = {
        status: "complete",
        report,
        jobId,
        query: getDirectQueryPresentation(report),
        resultMode: "count_only",
        generatedAt: new Date().toISOString(),
        columns: [],
        rows: [],
        totalRows,
        truncated: false,
      };
      await saveReportSnapshot(cacheKey, payload);

      return Response.json(payload, {
        headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
      });
    }

    const resultUrl = getQueryResultUrl(job);
    if (!resultUrl) {
      if (isFailedQueryJob(jobStatus)) {
        throw new Error(`The configured NXT query ${jobStatus || "failed"}.`);
      }
      return Response.json(
        {
          status: "running",
          report,
          jobId,
          query: { id: report.sourceQueryId, name: report.sourceQueryName || report.title },
          jobStatus: jobStatus || "Queued",
          poll: { jobId },
        },
        { status: 202, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const content = await downloadBlackbaudQueryResult(resultUrl);
    const parsedResult = parseQueryResult(content);
    const payload = {
      status: "complete",
      report,
      jobId,
      query: { id: report.sourceQueryId, name: report.sourceQueryName || report.title },
      generatedAt: new Date().toISOString(),
      ...parsedResult,
    };
    await saveReportSnapshot(cacheKey, payload);

    return Response.json(payload, {
      headers: getReportCacheHeaders(forceRefresh ? "bypass" : "miss"),
    });
  } catch (error) {
    console.error("Custom Field Report error:", error);
    if (presentedCachedPayload) {
      return Response.json(
        {
          ...presentedCachedPayload,
          refreshWarning: `${getCustomFieldRefreshFailureMessage(
            error,
            directCustomFieldReport,
          )} Showing the last successful snapshot instead.`,
        },
        { headers: getReportCacheHeaders("stale") },
      );
    }

    return Response.json(
      { error: getCustomFieldRefreshFailureMessage(error, directCustomFieldReport) },
      { status: 503 },
    );
  }
}
