import { executeSavedQueryResults } from "@/app/api/reports/alumni-family-engagement/route";
import {
  QUERY_RESULTS_LIMITS,
  isValidDashboardTableData,
  validateDashboardQueryId,
} from "@/app/api/utils/dashboardConfiguration";
import {
  BlackbaudQueryResultTooLargeError,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";

export const DASHBOARD_QUERY_RESULTS_SOURCE = "query-results-csv-v1";
const FAILURE_MESSAGE =
  "Could not retrieve the saved query results. No report snapshot was changed.";
const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/x-csv",
  "application/x-csv",
]);

export class DashboardQueryResultsError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "DashboardQueryResultsError";
    this.status = status;
  }
}

function limitError(message) {
  return new DashboardQueryResultsError(
    `${message} Narrow the saved query in NXT and try again. No results were truncated.`,
    413,
  );
}

function byteLimitError() {
  return limitError(`Query results must not exceed ${QUERY_RESULTS_LIMITS.bytes} bytes.`);
}

function decodeResult({ body, contentType }) {
  if (!(body instanceof Uint8Array)) throw new DashboardQueryResultsError(FAILURE_MESSAGE);
  if (body.byteLength > QUERY_RESULTS_LIMITS.bytes) throw byteLimitError();
  // Only the actual response MIME can authorize CSV decoding, not the URL or Accept header.
  const [mime, ...parameters] = String(contentType || "").split(";");
  if (!CSV_MIME_TYPES.has(mime.trim().toLowerCase())) {
    throw new DashboardQueryResultsError("NXT must return a CSV result file for this table.");
  }
  const charsetParameters = parameters.filter((value) => /^\s*charset\b/i.test(value));
  const match = charsetParameters[0]?.match(/^\s*charset\s*=\s*(?:"([^"\r\n]+)"|([^\s";]+))\s*$/i);
  if (charsetParameters.length > 1 || (charsetParameters.length && !match)) {
    throw new DashboardQueryResultsError("NXT returned an invalid CSV charset.");
  }
  try {
    return new TextDecoder(match ? (match[1] || match[2]) : "utf-8", { fatal: true }).decode(body);
  } catch {
    throw new DashboardQueryResultsError("NXT returned an unsupported charset or invalid CSV text encoding.");
  }
}

function malformedCsv() {
  return new DashboardQueryResultsError("NXT returned malformed CSV. Check the saved query result file.");
}

function parseResultCsv(content) {
  const text = content.replace(/^\uFEFF/, "");
  const leading = text.trimStart();
  if (!leading) throw new DashboardQueryResultsError("NXT returned an empty CSV result file.");
  if (
    /^<(?:!doctype\b|!--|\?xml\b|[a-z][\w:-]*[\s/>])/i.test(leading) ||
    /^PK[\u0003\u0005\u0007]/.test(leading) ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)
  ) throw malformedCsv();
  if (/^[\[{]/.test(leading)) {
    let isJson = false;
    try { JSON.parse(leading); isJson = true; } catch { /* CSV headers may start with brackets. */ }
    if (isJson) throw malformedCsv();
  }

  let headers = null;
  const rows = [];
  let row = [];
  let cell = "";
  let state = "start";

  const append = (character) => {
    cell += character;
    if (cell.length > QUERY_RESULTS_LIMITS.cellCharacters) {
      throw limitError(`Query result cells must not exceed ${QUERY_RESULTS_LIMITS.cellCharacters} characters.`);
    }
  };
  const finishCell = () => {
    row.push(cell);
    if (row.length > QUERY_RESULTS_LIMITS.columns) {
      throw limitError(`Query results must not exceed ${QUERY_RESULTS_LIMITS.columns} columns.`);
    }
    cell = "";
    state = "start";
  };
  const finishRow = () => {
    if (headers === null) {
      headers = row.map((header) => header.trim());
      if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
        throw new DashboardQueryResultsError("CSV headers must be nonblank and unique.");
      }
      if (headers.some((header) => header.length > 200)) {
        throw limitError("Query result headers must not exceed 200 characters.");
      }
    } else {
      if (row.length !== headers.length) throw malformedCsv();
      rows.push(row);
      if (rows.length > QUERY_RESULTS_LIMITS.rows) {
        throw limitError(`Query results must not exceed ${QUERY_RESULTS_LIMITS.rows} rows.`);
      }
    }
    row = [];
  };

  // A strict state machine preserves empty cells and quoted newlines without
  // accepting embedded unescaped quotes or dropping blank records.
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (state === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') { append('"'); index += 1; }
        else state = "closed";
      } else append(character);
    } else if (character === ",") {
      finishCell();
    } else if (character === "\r" || character === "\n") {
      finishCell();
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else if (character === '"' && state === "start") {
      state = "quoted";
    } else {
      if (character === '"' || state === "closed") throw malformedCsv();
      append(character);
      state = "unquoted";
    }
  }
  if (state === "quoted") throw malformedCsv();
  if (state !== "start" || row.length) { finishCell(); finishRow(); }
  const table = { headers, rows };
  if (!isValidDashboardTableData(table)) {
    throw limitError("Query results exceed the supported table size or shape.");
  }
  return table;
}

export async function runDashboardQueryResults({ user, origin, queryId }) {
  const validationError = validateDashboardQueryId(queryId);
  if (validationError) throw new DashboardQueryResultsError(validationError, 400);
  let result;
  try {
    if (getBlackbaudConfigIssues(origin).length) {
      throw new Error("Incomplete configuration.");
    }
    result = await executeSavedQueryResults({
      user, origin, queryId: String(queryId), maxBytes: QUERY_RESULTS_LIMITS.bytes,
    });
  } catch (error) {
    if (error instanceof BlackbaudQueryResultTooLargeError) throw byteLimitError();
    throw new DashboardQueryResultsError(FAILURE_MESSAGE);
  }
  const table = parseResultCsv(decodeResult(result));
  return {
    ...table,
    dataSource: DASHBOARD_QUERY_RESULTS_SOURCE,
    queryJobRowCount: Number.isSafeInteger(result.queryJobRowCount) && result.queryJobRowCount >= 0
      ? result.queryJobRowCount : null,
  };
}
