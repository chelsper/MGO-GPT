import {
  BlackbaudQueryResultTooLargeError,
  createBlackbaudQueryJob,
  downloadBlackbaudQueryResult,
  downloadBlackbaudQueryResultWithMetadata,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";

const QUERY_POLL_INTERVAL_MS = 1500;
const QUERY_MAX_WAIT_MS = 90000;

function getQueryJobId(job) {
  return String(job?.id ?? job?.job_id ?? job?.jobId ?? "").trim();
}

function getQueryJobStatus(job) {
  return String(
    job?.status ?? job?.state ?? job?.job_status ?? job?.jobStatus ?? "",
  ).trim();
}

function isCompletedQueryJob(status) {
  return /^(?:completed|complete|succeeded|success)$/i.test(
    String(status || "").trim(),
  );
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
    (candidate) =>
      candidate !== undefined &&
      candidate !== null &&
      String(candidate).trim(),
  );
  const rowCount = Number(value);
  return Number.isSafeInteger(rowCount) && rowCount >= 0 ? rowCount : null;
}

function firstUrl(candidates) {
  return String(
    candidates.find((candidate) => String(candidate || "").trim()) || "",
  ).trim();
}

function getQueryResultUrl(job) {
  return firstUrl([
    job?.sas_uri,
    job?.sasUri,
    job?.result_uri,
    job?.resultUri,
    job?.result_url,
    job?.resultUrl,
    job?.resultFileUrl,
    job?.download_url,
    job?.downloadUrl,
    job?.read_url,
    job?.readUrl,
    job?.result?.sas_uri,
    job?.result?.sasUri,
    job?.result?.result_uri,
    job?.result?.resultUri,
    job?.result?.result_url,
    job?.result?.resultUrl,
    job?.result?.resultFileUrl,
    job?.result?.download_url,
    job?.result?.downloadUrl,
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
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value || "").trim())) records.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
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
  return records.length ? records.slice(1).length : 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBlackbaudQueryJob({
  user,
  origin,
  jobId,
  label,
  validateResultCsv,
  readResult,
}) {
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
      const resultUrl = getQueryResultUrl(job);
      if (!resultUrl) {
        throw new Error(
          `NXT completed ${label}, but did not provide its result file. The report was not updated.`,
        );
      }
      if (readResult) return readResult({ resultUrl, job });
      const resultCsv = await downloadBlackbaudQueryResult(resultUrl, {
        userId: user.id,
        authUserId: user.id,
        origin,
      });
      if (validateResultCsv) validateResultCsv(resultCsv);
      return {
        total: countQueryResultRows(resultCsv, label),
        polls,
        queryJobRowCount: getQueryJobMetadataRowCount(job),
      };
    }
    if (isFailedQueryJob(lastStatus)) {
      throw new Error(
        `NXT query job for ${label} ${lastStatus.toLocaleLowerCase("en-US")}.`,
      );
    }
    await sleep(QUERY_POLL_INTERVAL_MS);
  }
  throw new Error(
    `NXT is still preparing ${label}. The last saved report remains available; try Refresh data again shortly.`,
  );
}

export async function executeSavedQueryCount({
  user,
  origin,
  queryId,
  label,
  validateResultCsv,
}) {
  const createdJob = await createBlackbaudQueryJob({
    userId: user.id,
    authUserId: user.id,
    origin,
    queryId,
  });
  const jobId = getQueryJobId(createdJob);
  if (!jobId) throw new Error(`NXT did not return a query job ID for ${label}.`);
  return waitForBlackbaudQueryJob({
    user,
    origin,
    jobId,
    label,
    validateResultCsv,
  });
}

export async function executeSavedQueryResults({
  user,
  origin,
  queryId,
  maxBytes,
}) {
  try {
    const createdJob = await createBlackbaudQueryJob({
      userId: user.id,
      authUserId: user.id,
      origin,
      queryId,
    });
    const jobId = getQueryJobId(createdJob);
    if (!jobId) throw new Error("Missing query job ID.");
    return await waitForBlackbaudQueryJob({
      user,
      origin,
      jobId,
      label: "dashboard query",
      readResult: async ({ resultUrl, job }) => {
        const { body, contentType } =
          await downloadBlackbaudQueryResultWithMetadata(resultUrl, {
            userId: user.id,
            authUserId: user.id,
            origin,
            maxBytes,
          });
        return {
          body,
          contentType,
          queryJobRowCount: getQueryJobMetadataRowCount(job),
        };
      },
    });
  } catch (error) {
    if (error instanceof BlackbaudQueryResultTooLargeError) throw error;
    throw new Error(
      "Could not retrieve the saved query results. No report snapshot was changed.",
    );
  }
}
