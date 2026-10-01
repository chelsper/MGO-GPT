import { executeSavedQueryResults } from "@/app/api/utils/savedQueryExecution";
import {
  QUERY_RESULTS_LIMITS,
  isTechnicalDashboardQueryHeader,
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

export function decodeResult({ body, contentType }, { maxBytes = QUERY_RESULTS_LIMITS.bytes } = {}) {
  if (!(body instanceof Uint8Array)) throw new DashboardQueryResultsError(FAILURE_MESSAGE);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new DashboardQueryResultsError(FAILURE_MESSAGE);
  if (body.byteLength > maxBytes) throw limitError(`Query results must not exceed ${maxBytes} bytes.`);
  return createResultTextDecoder(contentType).decode(body);
}

export function createResultTextDecoder(contentType) {
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
  const invalidEncoding = () => new DashboardQueryResultsError("NXT returned an unsupported charset or invalid CSV text encoding.");
  let decoder;
  try { decoder = new TextDecoder(match ? (match[1] || match[2]) : "utf-8", { fatal: true }); }
  catch { throw invalidEncoding(); }
  return {
    decode(body, options) {
      try { return decoder.decode(body, options); }
      catch { throw invalidEncoding(); }
    },
  };
}

function malformedCsv() {
  return new DashboardQueryResultsError("NXT returned malformed CSV. Check the saved query result file.");
}

function removeTechnicalColumns(table) {
  const displayedIndexes = table.headers.flatMap((header, index) =>
    isTechnicalDashboardQueryHeader(header) ? [] : [index],
  );
  if (displayedIndexes.length === table.headers.length) return table;
  if (!displayedIndexes.length) {
    throw new DashboardQueryResultsError(
      "The saved query must include at least one report output column besides QRECID.",
    );
  }
  return {
    headers: displayedIndexes.map((index) => table.headers[index]),
    rows: table.rows.map((row) => displayedIndexes.map((index) => row[index])),
  };
}

// Visit complete, strictly validated rows without retaining a raw result table.
// Specialized readers may bound raw rows separately from their deduplicated output.
export function visitResultCsv(content, { onHeaders, onRow, maxRows = QUERY_RESULTS_LIMITS.rows }) {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) throw malformedCsv();
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

  const visitor = createResultCsvVisitor({ onHeaders, onRow, maxRows });
  visitor.write(text);
  return visitor.finish();
}

// Keep only one bounded row between chunks. A closing quote and CRLF can each
// span chunks, so neither requires lookahead or retaining the previous chunk.
export function createResultCsvVisitor({ onHeaders, onRow, maxRows = QUERY_RESULTS_LIMITS.rows }) {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) throw malformedCsv();
  let headers = null;
  let rowCount = 0;
  let row = [];
  let cell = "";
  let state = "start";
  let firstCharacter = true;
  let skipLF = false;
  let finished = false;

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
      onHeaders?.(headers);
    } else {
      if (row.length !== headers.length) throw malformedCsv();
      rowCount += 1;
      if (rowCount > maxRows) {
        throw limitError(`Query results must not exceed ${maxRows} rows.`);
      }
      onRow(row, headers);
    }
    row = [];
  };

  return {
    write(text) {
      if (finished || typeof text !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw malformedCsv();
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (firstCharacter) {
          firstCharacter = false;
          if (character === "\uFEFF") continue;
        }
        if (skipLF) {
          skipLF = false;
          if (character === "\n") continue;
        }
        if (state === "quoted") {
          if (character === '"') state = "closed";
          else append(character);
        } else if (state === "closed" && character === '"') {
          append('"');
          state = "quoted";
        } else if (character === ",") {
          finishCell();
        } else if (character === "\r" || character === "\n") {
          finishCell();
          finishRow();
          skipLF = character === "\r";
        } else if (character === '"' && state === "start") {
          state = "quoted";
        } else {
          if (character === '"' || state === "closed") throw malformedCsv();
          append(character);
          state = "unquoted";
        }
      }
    },
    finish() {
      if (finished || state === "quoted") throw malformedCsv();
      finished = true;
      if (state !== "start" || row.length) { finishCell(); finishRow(); }
      if (!headers) throw malformedCsv();
      return { headers, rowCount };
    },
  };
}

export function parseResultCsv(content, { preserveTechnical = false } = {}) {
  const rows = [];
  const { headers } = visitResultCsv(content, { onRow: (row) => rows.push(row) });
  const table = preserveTechnical ? { headers, rows } : removeTechnicalColumns({ headers, rows });
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
