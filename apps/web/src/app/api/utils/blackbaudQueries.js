export const FY27_CASH_RECEIVED_QUERY_NAME = "MGOGPT - FY27 Total Cash Received";

const CONSTITUENT_ID_HEADERS = new Set([
  "constituentsystemrecordid",
  "systemrecordid",
  "constituentrecordid",
  "constituentid",
  "recordid",
  "nxtsystemid",
  "nxtrecordid",
]);

const FY27_CASH_RECEIVED_HEADERS = new Set([
  "mgogptfy27totalcashreceived",
  "fy27totalcashreceived",
  "totalcashreceived",
  "cashreceivedfy27",
]);

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;

  const collections = [
    payload?.value,
    payload?.results,
    payload?.rows,
    payload?.data,
    payload?.items,
  ];
  return collections.find(Array.isArray) || [];
}

function parseDelimitedRows(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const parseLine = (line) => {
    const values = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === delimiter && !quoted) {
        values.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }

    values.push(current.trim());
    return values;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

export function parseBlackbaudQueryResult(payload) {
  if (typeof payload === "string") {
    try {
      return getRowsFromPayload(JSON.parse(payload));
    } catch {
      return parseDelimitedRows(payload);
    }
  }

  return getRowsFromPayload(payload);
}

function getNormalizedRow(row) {
  return Object.entries(row || {}).reduce((normalized, [key, value]) => {
    normalized[normalizeHeader(key)] = value;
    return normalized;
  }, {});
}

function getNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = String(value || "")
    .replace(/[$,\s]/g, "")
    .replace(/^\((.+)\)$/, "-$1");
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildFY27CashReceivedByConstituentId(payload) {
  const rows = parseBlackbaudQueryResult(payload);
  const normalizedRows = rows.map(getNormalizedRow);
  const headers = new Set(normalizedRows.flatMap((row) => Object.keys(row)));
  const constituentHeader = [...headers].find((header) =>
    CONSTITUENT_ID_HEADERS.has(header),
  );
  const cashReceivedHeader = [...headers].find((header) =>
    FY27_CASH_RECEIVED_HEADERS.has(header),
  );
  const byConstituentId = {};

  if (!constituentHeader || !cashReceivedHeader) {
    return {
      byConstituentId,
      rowCount: rows.length,
      hasRequiredColumns: false,
    };
  }

  for (const row of normalizedRows) {
    const constituentId = String(row[constituentHeader] || "").trim();
    const cashReceived = getNumber(row[cashReceivedHeader]);
    if (!constituentId || cashReceived == null) continue;

    // Saved query output should be one row per constituent. If the query has
    // duplicate rows, retain the largest aggregate rather than double-counting.
    byConstituentId[constituentId] = Math.max(
      byConstituentId[constituentId] ?? 0,
      cashReceived,
    );
  }

  return {
    byConstituentId,
    rowCount: rows.length,
    hasRequiredColumns: true,
  };
}
