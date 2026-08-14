import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  createBlackbaudQueryJob,
  downloadBlackbaudQueryResult,
  findBlackbaudQueryByName,
  getBlackbaudConfigIssues,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";
import {
  FUTURE_MADE_PHASE_TWO_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

const QUERY_NAME = "Future. Made. Phase II";
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
  return findValue(values, [
    "constituentsystemrecordid",
    "systemrecordid",
    "constituentid",
    "constituentlookupid",
    "lookupid",
    "recordid",
  ]);
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

async function getCurrentUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getReportAccessForUser(FUTURE_MADE_PHASE_TWO_REPORT_KEY, user);
    if (!access.canView) {
      return Response.json(
        { error: "Future. Made. Phase II is not shared with you." },
        { status: 403 },
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

    const { searchParams } = new URL(request.url);
    let jobId = searchParams.get("jobId")?.trim() || "";
    let query = null;

    if (!jobId) {
      query = await findBlackbaudQueryByName({
        userId: user.id,
        origin,
        name: QUERY_NAME,
      });
      if (!query) {
        return Response.json(
          { error: `Saved NXT query \"${QUERY_NAME}\" was not found.` },
          { status: 404 },
        );
      }

      const createdJob = await createBlackbaudQueryJob({
        userId: user.id,
        origin,
        queryId: query.id,
      });
      jobId = getQueryJobId(createdJob);
      if (!jobId) {
        throw new Error("Blackbaud did not return a query job ID.");
      }
    }

    const job = await getBlackbaudQueryJob({ userId: user.id, origin, jobId });
    const status = getQueryJobStatus(job);
    const resultUrl = getQueryResultUrl(job);
    if (!resultUrl) {
      if (isFailedQueryJob(status)) {
        return Response.json(
          { error: `The NXT query job ${status || "failed"}.`, jobId },
          { status: 502 },
        );
      }
      return Response.json(
        {
          status: "running",
          jobId,
          queryName: query?.name || QUERY_NAME,
          jobStatus: status || "Queued",
        },
        { status: 202, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const content = await downloadBlackbaudQueryResult(resultUrl);
    return Response.json(
      {
        status: "complete",
        jobId,
        queryName: query?.name || QUERY_NAME,
        ...parseQueryResult(content),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Future. Made. Phase II report error:", error);
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
