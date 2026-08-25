export const DONORS_BY_CONSTITUENCY_SOURCE_KEY = "donors-by-constituency";

// These are the active Alumni-related codes used by the original FY27 query.
// Report builders can also add another active NXT code when their definition
// needs one that is not in this common list.
export const AVAILABLE_CONSTITUENCY_CODES = [
  "Alumni",
  "Alumni - Honorary Doctorate",
  "Alumni - Non-Graduate",
  "Alumni - Spouse",
  "Alumni - Surviving Spouse",
  "Alumni Associate's Degree",
  "Alumni Bachelor's Degree",
  "Alumni Graduate Degree",
  "Alumni Orthodontic Program",
];

export const GIFT_TYPE_OPTIONS = [
  { key: "donation", label: "Donation / cash received" },
  { key: "pledge", label: "Pledge" },
  { key: "pledge-payment", label: "Pledge payment" },
  { key: "recurring-gift-payment", label: "Recurring gift payment" },
  { key: "matching-gift-payment", label: "Matching gift payment" },
  { key: "gift-in-kind", label: "Gift-in-kind" },
  { key: "stock-property", label: "Stock or property" },
  { key: "other", label: "Other / unclassified gift type" },
];

const GIFT_TYPE_KEYS = new Set(GIFT_TYPE_OPTIONS.map((option) => option.key));

export const DEFAULT_ALUMNI_DONOR_CONFIGURATION = {
  sourceKey: DONORS_BY_CONSTITUENCY_SOURCE_KEY,
  sourceLabel: "Donors by Constituency",
  constituencies: AVAILABLE_CONSTITUENCY_CODES,
  giftTypes: GIFT_TYPE_OPTIONS.map((option) => option.key),
  rows: [
    {
      key: "fy27-alumni-giving",
      label: "FY27 Alumni Giving",
      fiscalYearStart: "2026-07-01",
      fiscalYearEnd: "2027-06-30",
    },
    {
      key: "fy26-alumni-giving",
      label: "FY26 Alumni Giving",
      fiscalYearStart: "2025-07-01",
      fiscalYearEnd: "2026-06-30",
    },
  ],
};

function parseConfiguration(value) {
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return value;
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function createRowKey(value, index, usedKeys) {
  const base = normalizeText(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const preferredKey = base || `donor-count-${index + 1}`;
  let key = preferredKey;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${preferredKey}-${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

function normalizeRows(value) {
  const candidateRows = Array.isArray(value)
    ? value.slice(0, 12)
    : DEFAULT_ALUMNI_DONOR_CONFIGURATION.rows;
  const usedKeys = new Set();

  return candidateRows.map((row, index) => {
    const defaultRow = DEFAULT_ALUMNI_DONOR_CONFIGURATION.rows[index] || {};
    const label = normalizeText(row?.label, defaultRow.label || `Donor count ${index + 1}`);
    return {
      key: createRowKey(row?.key || label, index, usedKeys),
      label,
      fiscalYearStart: normalizeText(row?.fiscalYearStart, defaultRow.fiscalYearStart || ""),
      fiscalYearEnd: normalizeText(row?.fiscalYearEnd, defaultRow.fiscalYearEnd || ""),
    };
  });
}

function normalizeConstituencies(value) {
  if (!Array.isArray(value)) return [...AVAILABLE_CONSTITUENCY_CODES];
  const unique = [];
  const seen = new Set();
  value.forEach((entry) => {
    const code = normalizeText(entry);
    const normalizedCode = code.toLocaleLowerCase("en-US");
    if (!code || seen.has(normalizedCode) || unique.length >= 60) return;
    seen.add(normalizedCode);
    unique.push(code);
  });
  return unique;
}

function normalizeGiftTypes(value) {
  if (!Array.isArray(value)) return GIFT_TYPE_OPTIONS.map((option) => option.key);
  const unique = [];
  const seen = new Set();
  value.forEach((entry) => {
    const giftType = normalizeText(entry).toLocaleLowerCase("en-US");
    if (!GIFT_TYPE_KEYS.has(giftType) || seen.has(giftType)) return;
    seen.add(giftType);
    unique.push(giftType);
  });
  return unique;
}

export function normalizeAlumniDonorConfiguration(value) {
  const configuration = parseConfiguration(value);
  return {
    sourceKey: DONORS_BY_CONSTITUENCY_SOURCE_KEY,
    sourceLabel: DEFAULT_ALUMNI_DONOR_CONFIGURATION.sourceLabel,
    constituencies: normalizeConstituencies(configuration.constituencies),
    giftTypes: normalizeGiftTypes(configuration.giftTypes),
    rows: normalizeRows(configuration.rows),
  };
}

export function getAlumniDonorCountRows(value) {
  return normalizeAlumniDonorConfiguration(value).rows.map((row) => ({ ...row }));
}

// Preserves a small compatibility surface for callers that were written
// before Alumni donor totals stopped depending on saved NXT queries.
export const getAlumniDonorQueryRows = getAlumniDonorCountRows;

export function getAlumniDonorConfigurationFingerprint(value) {
  const configuration = normalizeAlumniDonorConfiguration(value);
  return JSON.stringify({
    constituencies: configuration.constituencies,
    giftTypes: configuration.giftTypes,
    rows: configuration.rows.map((row) => ({
      key: row.key,
      label: row.label,
      fiscalYearStart: row.fiscalYearStart,
      fiscalYearEnd: row.fiscalYearEnd,
    })),
  });
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function validateAlumniDonorConfiguration(value) {
  const configuration = normalizeAlumniDonorConfiguration(value);
  if (!configuration.constituencies.length) {
    return "Select at least one constituency code for this donor count configuration.";
  }
  if (!configuration.giftTypes.length) {
    return "Select at least one gift type for this donor count configuration.";
  }
  if (!configuration.rows.length) {
    return "Add at least one fiscal-year donor count.";
  }

  const labels = new Set();
  for (const row of configuration.rows) {
    if (!row.label) return "Each donor count needs a label.";
    const normalizedLabel = row.label.toLocaleLowerCase("en-US");
    if (labels.has(normalizedLabel)) {
      return `Use a different label for each donor count; ${row.label} is repeated.`;
    }
    labels.add(normalizedLabel);
    if (!isIsoDate(row.fiscalYearStart) || !isIsoDate(row.fiscalYearEnd)) {
      return `Use YYYY-MM-DD start and end dates for ${row.label}.`;
    }
    if (row.fiscalYearStart > row.fiscalYearEnd) {
      return `${row.label} has an end date before its start date.`;
    }
  }

  return "";
}
