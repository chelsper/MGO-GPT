import Papa from "papaparse";
import { blackbaudApiFetch, downloadBlackbaudQueryResultWithMetadata } from "./blackbaud";
import { OPEN_PLEDGE_QUERY_ID, pledgeDataError } from "@/utils/pledgePayments";

export const PLEDGE_QUERY_MAX_BYTES = 10 * 1024 * 1024;
export const isPledgeQueryJob = (job) => job?.source === "saved_query" && job.queryId === OPEN_PLEDGE_QUERY_ID;
const queryBase = "https://api.sky.blackbaud.com/query";
// Verified from query 12033's authenticated job response. Do not allow arbitrary
// blackbaud.net subdomains or forward SKY credentials to the signed-file host.
const queryResultHosts = new Set(["api.sky.blackbaud.com", "nsa-pusa01.app.blackbaud.net"]);

export function pledgeQueryTransport(context) {
  const options = { userId: context.userId, authUserId: context.authUserId, origin: context.origin, timeoutMs: 12000, maxRetries: 1 };
  const params = { product: "RE", module: "None" };
  return {
    metadata: () => blackbaudApiFetch(`${queryBase}/queries/${OPEN_PLEDGE_QUERY_ID}`, { ...options, searchParams: params }),
    // Never automatically retry submission: a lost response may still have created a job.
    create: () => blackbaudApiFetch(`${queryBase}/queries/executebyid`, { ...options, maxRetries: 0,
      method: "POST", searchParams: { ...params, include_read_url: "OnceCompleted" },
      body: { id: Number(OPEN_PLEDGE_QUERY_ID), ux_mode: "Asynchronous", output_format: "Csv", formatting_mode: "UI", sql_generation_mode: "Query" } }),
    poll: (id) => blackbaudApiFetch(`${queryBase}/jobs/${encodeURIComponent(id)}`, { ...options,
      searchParams: { ...params, include_read_url: "OnceCompleted" } }),
    download: (uri) => downloadBlackbaudQueryResultWithMetadata(pledgeQueryResultUrl(uri), {
      ...options, maxBytes: PLEDGE_QUERY_MAX_BYTES, redirect: "error",
    }),
  };
}

export function pledgeQueryResultUrl(uri) {
  let url;
  try { url = new URL(uri); } catch { throw pledgeDataError("invalid_query_result_url"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash ||
    !(queryResultHosts.has(url.hostname) || /^[a-z0-9]{3,24}\.blob\.core\.windows\.net$/.test(url.hostname))) {
    throw pledgeDataError("invalid_query_result_url");
  }
  return url.href;
}

export function parsePledgeQueryManifest(file, rowCount) {
  if (file?.httpStatus !== 200 || !/^text\/(csv|plain)(;|$)/i.test(file.contentType || "")) throw pledgeDataError("query_not_csv");
  if (!ArrayBuffer.isView(file.body) || file.body.BYTES_PER_ELEMENT !== 1) throw pledgeDataError("query_invalid_encoding");
  if (file.body.byteLength > PLEDGE_QUERY_MAX_BYTES) throw pledgeDataError("query_result_too_large");
  const charset = file.contentType.match(/charset=["']?([^;"']+)/i)?.[1].trim() || "utf-8";
  let csv;
  try { csv = new TextDecoder(charset, { fatal: true }).decode(file.body).replace(/^\uFEFF/, ""); }
  catch { throw pledgeDataError("query_invalid_encoding"); }
  if (!csv.trim() || /^\s*[<{[]/.test(csv)) throw pledgeDataError("query_not_csv");
  const parsed = Papa.parse(csv, { header: false, delimiter: ",", skipEmptyLines: "greedy" });
  const [headers = [], ...rows] = parsed.data;
  if (parsed.errors.length || headers.length > 64 || rows.length > 50000 || rows.some(row => row.length !== headers.length)) {
    throw pledgeDataError("query_malformed_csv");
  }
  const normalizedHeaders = headers.map(header => header.trim().toUpperCase());
  if (new Set(normalizedHeaders).size !== headers.length || normalizedHeaders.some(header => !header)) throw pledgeDataError("query_ambiguous_headers");
  // QRECID was verified against Gift Get for this Gift query. Gift ID is a
  // lookup ID; constituent and installment IDs must never select the pledge.
  const idColumn = normalizedHeaders.indexOf("QRECID");
  if (idColumn < 0) throw pledgeDataError("query_missing_gift_system_id");
  const expected = typeof rowCount === "number" ? rowCount : /^\d+$/.test(rowCount ?? "") ? Number(rowCount) : NaN;
  if (!Number.isSafeInteger(expected) || expected < 0 || rows.length !== expected) throw pledgeDataError("query_row_count_mismatch");
  const ids = rows.map(row => row[idColumn].trim());
  if (ids.some(id => !/^[1-9]\d{0,19}$/.test(id))) throw pledgeDataError("query_invalid_gift_id");
  return { ids: [...new Set(ids)], rowCount: rows.length };
}

// Persist only the query job ID and validated gift IDs, never a SAS credential
// or raw CSV. Each invocation does one stage, not a long polling loop.
export async function advancePledgeDiscovery(job, store, query, now) {
  const stage = job.queryStage;
  if (stage === "metadata") {
    const metadata = await query.metadata();
    if (String(metadata?.id) !== OPEN_PLEDGE_QUERY_ID || metadata.type !== "Gift" || metadata.can_execute === false || metadata.has_ask_fields) {
      throw pledgeDataError("query_not_executable_gift_query");
    }
    return { ...job, queryStage: "create" };
  }
  if (stage === "creating") throw pledgeDataError("query_submission_uncertain");
  if (stage === "create") {
    job.queryStage = "creating";
    await store.saveJob(job);
    let created;
    try { created = await query.create(); }
    catch (error) {
      if ([401, 429].includes(error?.httpStatus) || error?.name === "BlackbaudQuotaExceededError" || (error?.httpStatus === 403 && error?.retryAfterMs)) job.queryStage = "create";
      else error.pledgeCode = "query_submission_uncertain";
      throw error;
    }
    if (typeof created?.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(created.id)) throw pledgeDataError("query_submission_uncertain");
    job.queryJobId = created.id;
    job.queryStage = "poll";
    return { ...job, nextPollAt: new Date(now() + 3000).toISOString(), pollCount: 0 };
  }
  if (!["poll", "download"].includes(stage) || !job.queryJobId) throw pledgeDataError("invalid_checkpoint");
  const execution = await query.poll(job.queryJobId);
  if (execution?.id !== job.queryJobId) throw pledgeDataError("query_job_mismatch");
  if (["Failed", "Cancelled", "Canceled"].includes(execution.status)) throw pledgeDataError("query_execution_failed");
  if (execution.status !== "Completed") {
    if (!["Pending", "Queued", "Running", "InProgress", "NotStarted"].includes(execution.status)) throw pledgeDataError("query_unknown_status");
    job.pollCount = (job.pollCount || 0) + 1;
    if (job.pollCount >= 30) throw pledgeDataError("query_still_running");
    return { ...job, queryStage: "poll", nextPollAt: new Date(now() + 3000).toISOString() };
  }
  if (stage === "poll") return { ...job, queryStage: "download", nextPollAt: null };
  const uri = pledgeQueryResultUrl(execution.sas_uri);
  const manifest = parsePledgeQueryManifest(await query.download(uri), execution.row_count);
  // Idempotent if interrupted between the manifest upsert and final checkpoint.
  await store.discover(job.id, manifest.ids);
  if ((await store.counts(job.id)).total !== manifest.ids.length) throw pledgeDataError("query_manifest_mismatch");
  return { ...job, queryStage: "complete", queryRowCount: manifest.rowCount, expectedCount: manifest.ids.length,
    discoveryComplete: true, status: "running", nextPollAt: null };
}
