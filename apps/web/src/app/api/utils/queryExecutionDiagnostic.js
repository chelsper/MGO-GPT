function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getFirstString(value, keys) {
  const object = asObject(value);
  for (const key of keys) {
    const candidate = object[key];
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return null;
}

export function getTopLevelFieldNames(value) {
  return Object.keys(asObject(value)).sort();
}

export function getQueryJobId(value) {
  return getFirstString(value, ["id", "job_id", "jobId", "key"]);
}

export function getQueryJobStatus(value) {
  return getFirstString(value, ["status", "job_status", "jobStatus", "state"]);
}

export function getQueryJobRowCount(value) {
  const object = asObject(value);
  const candidates = [object.row_count, object.rowCount];
  const rawValue = candidates.find(
    (candidate) => candidate !== undefined && candidate !== null && String(candidate).trim(),
  );
  const rowCount = Number(rawValue);
  return Number.isSafeInteger(rowCount) && rowCount >= 0 ? rowCount : null;
}

export function getQueryJobUrlFieldPresence(value) {
  const object = asObject(value);
  return {
    sas_uri: Boolean(String(object.sas_uri || "").trim()),
    result_uri: Boolean(String(object.result_uri || "").trim()),
    read_url: Boolean(String(object.read_url || "").trim()),
    download_url: Boolean(String(object.download_url || "").trim()),
  };
}

export function getSasUri(value) {
  return getFirstString(value, ["sas_uri"]);
}

export function isTerminalQueryJobStatus(status) {
  return /^(?:completed|complete|succeeded|success|failed|failure|cancelled|canceled|error|expired)$/i.test(
    String(status || "").trim(),
  );
}

export function isSuccessfulQueryJobStatus(status) {
  return /^(?:completed|complete|succeeded|success)$/i.test(
    String(status || "").trim(),
  );
}

export function summarizeQueryJobResponse(response) {
  const payload = asObject(response?.payload ?? response);
  return {
    httpStatus: Number.isInteger(response?.httpStatus) ? response.httpStatus : null,
    jobId: getQueryJobId(payload),
    jobStatus: getQueryJobStatus(payload),
    rowCount: getQueryJobRowCount(payload),
    topLevelFieldNames: getTopLevelFieldNames(payload),
    urlFieldPresence: getQueryJobUrlFieldPresence(payload),
  };
}

function getMediaType(contentType) {
  return String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export function getCharsetFromContentType(contentType) {
  const match = String(contentType || "").match(/;\s*charset\s*=\s*([^;\s]+)/i);
  return match ? match[1].trim().replace(/^['\"]|['\"]$/g, "") : null;
}

function decodeText(bytes, charset) {
  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function isWhitespaceByte(byte) {
  return byte === 9 || byte === 10 || byte === 13 || byte === 32;
}

function getFirstNonWhitespaceByte(bytes) {
  for (const byte of bytes) {
    if (!isWhitespaceByte(byte)) return byte;
  }
  return null;
}

export function classifyResultFileStart(bytes) {
  if (!bytes?.byteLength) return "empty";

  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "zip_or_xlsx";
  }

  const firstByte = getFirstNonWhitespaceByte(bytes);
  if (firstByte === null) return "empty";
  if (firstByte === 0x7b || firstByte === 0x5b) return "json";
  if (firstByte === 0x3c) return "html";

  const preview = decodeText(bytes.slice(0, 512), "utf-8");
  if (preview.includes(",") || preview.includes("\n") || preview.includes("\r")) {
    return "csv";
  }

  return "other";
}

export function redactResultPreview(text, length = 100) {
  return String(text || "")
    .replace(/[A-Za-z0-9]+(?:[._@'/-][A-Za-z0-9]+)*/g, "[redacted]")
    .slice(0, length);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let isQuoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (isQuoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        isQuoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      isQuoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function getJsonShape(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return "array";
    if (parsed && typeof parsed === "object") return "object";
    return typeof parsed;
  } catch {
    return "invalid_json";
  }
}

export function summarizeQueryResultFile({
  httpStatus,
  contentType,
  contentLength,
  body,
}) {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body || []);
  const mediaType = getMediaType(contentType);
  const charset = getCharsetFromContentType(contentType);
  const contentBeginsLike = classifyResultFileStart(bytes);
  const isTextual = mediaType === "text/csv" || mediaType === "application/json" || mediaType === "text/html";
  const text = isTextual ? decodeText(bytes, charset) : "";
  const summary = {
    endpoint: "sas_uri",
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : null,
    contentType: contentType || null,
    contentLength: contentLength || null,
    byteCount: bytes.byteLength,
    charset,
    contentBeginsLike,
    safePreview: isTextual ? redactResultPreview(text) : "[binary content omitted]",
    parser: "not_parsed_unknown_content_type",
    parsedDataRowCount: null,
    jsonShape: null,
  };

  if (mediaType === "text/csv") {
    const rows = parseCsvRows(text);
    return {
      ...summary,
      parser: "csv",
      parsedDataRowCount: Math.max(0, rows.length - 1),
    };
  }

  if (mediaType === "application/json") {
    return {
      ...summary,
      parser: "json_shape_only",
      jsonShape: getJsonShape(text),
    };
  }

  if (
    mediaType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mediaType === "application/vnd.ms-excel" ||
    mediaType === "application/zip" ||
    contentBeginsLike === "zip_or_xlsx"
  ) {
    return {
      ...summary,
      parser: "not_parsed_binary",
    };
  }

  if (mediaType === "text/html" || contentBeginsLike === "html") {
    return {
      ...summary,
      parser: "unexpected_html",
    };
  }

  return summary;
}

export function reconcileQueryResultCounts({ jobRowCount, parsedDataRowCount }) {
  const hasJobRowCount = Number.isSafeInteger(jobRowCount) && jobRowCount >= 0;
  const hasParsedDataRowCount =
    Number.isSafeInteger(parsedDataRowCount) && parsedDataRowCount >= 0;

  return {
    jobRowCount: hasJobRowCount ? jobRowCount : null,
    parsedDataRowCount: hasParsedDataRowCount ? parsedDataRowCount : null,
    countsAgree:
      hasJobRowCount && hasParsedDataRowCount
        ? jobRowCount === parsedDataRowCount
        : null,
    comparisonAvailable: hasJobRowCount && hasParsedDataRowCount,
    parsedCountEndpoint: hasParsedDataRowCount ? "sas_uri" : null,
  };
}
