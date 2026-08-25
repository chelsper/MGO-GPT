export const DONORS_BY_CONSTITUENCY_SOURCE_KEY = "donors-by-constituency";

const DEFAULT_CONSTITUENCY_CODES = [
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

export const DEFAULT_ALUMNI_DONOR_CONFIGURATION = {
  sourceKey: DONORS_BY_CONSTITUENCY_SOURCE_KEY,
  sourceLabel: "Donors by Constituency",
  includeInactiveConstituents: true,
  includeDeceasedConstituents: true,
  includeConstituentsWithoutValidAddress: true,
  includeSoftCreditedDonors: true,
  includeMatchingGiftCredits: true,
  constituencies: DEFAULT_CONSTITUENCY_CODES,
  rows: [
    {
      key: "fy27-alumni-giving",
      label: "FY27 Alumni Giving",
      queryId: "30976",
      queryName: "Alumni Donors FY27",
      fiscalYearStart: "2026-07-01",
      fiscalYearEnd: "2027-06-30",
    },
    {
      key: "fy26-alumni-giving",
      label: "FY26 Alumni Giving",
      queryId: "30679",
      queryName: "Alumni Donors FY26",
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

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
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
  const candidateRows = Array.isArray(value) && value.length
    ? value.slice(0, 12)
    : DEFAULT_ALUMNI_DONOR_CONFIGURATION.rows;
  const usedKeys = new Set();

  return candidateRows.map((row, index) => {
    const defaultRow = DEFAULT_ALUMNI_DONOR_CONFIGURATION.rows[index] || {};
    const label = normalizeText(row?.label, defaultRow.label || `Donor count ${index + 1}`);
    return {
      key: createRowKey(row?.key || label, index, usedKeys),
      label,
      queryId: normalizeText(row?.queryId, defaultRow.queryId || ""),
      queryName: normalizeText(row?.queryName, defaultRow.queryName || ""),
      fiscalYearStart: normalizeText(row?.fiscalYearStart, defaultRow.fiscalYearStart || ""),
      fiscalYearEnd: normalizeText(row?.fiscalYearEnd, defaultRow.fiscalYearEnd || ""),
    };
  });
}

function normalizeConstituencies(value) {
  if (!Array.isArray(value)) return [...DEFAULT_CONSTITUENCY_CODES];
  const unique = [];
  const seen = new Set();
  value.forEach((entry) => {
    const code = normalizeText(entry);
    const normalizedCode = code.toLocaleLowerCase("en-US");
    if (!code || seen.has(normalizedCode) || unique.length >= 60) return;
    seen.add(normalizedCode);
    unique.push(code);
  });
  return unique.length ? unique : [...DEFAULT_CONSTITUENCY_CODES];
}

export function normalizeAlumniDonorConfiguration(value) {
  const configuration = parseConfiguration(value);
  return {
    sourceKey: DONORS_BY_CONSTITUENCY_SOURCE_KEY,
    sourceLabel: normalizeText(
      configuration.sourceLabel,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.sourceLabel,
    ).slice(0, 120),
    includeInactiveConstituents: normalizeBoolean(
      configuration.includeInactiveConstituents,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeInactiveConstituents,
    ),
    includeDeceasedConstituents: normalizeBoolean(
      configuration.includeDeceasedConstituents,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeDeceasedConstituents,
    ),
    includeConstituentsWithoutValidAddress: normalizeBoolean(
      configuration.includeConstituentsWithoutValidAddress,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeConstituentsWithoutValidAddress,
    ),
    includeSoftCreditedDonors: normalizeBoolean(
      configuration.includeSoftCreditedDonors,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeSoftCreditedDonors,
    ),
    includeMatchingGiftCredits: normalizeBoolean(
      configuration.includeMatchingGiftCredits,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeMatchingGiftCredits,
    ),
    constituencies: normalizeConstituencies(configuration.constituencies),
    rows: normalizeRows(configuration.rows),
  };
}

export function getAlumniDonorQueryRows(value) {
  return normalizeAlumniDonorConfiguration(value).rows.map((row) => ({ ...row }));
}

export function getAlumniDonorConfigurationFingerprint(value) {
  const configuration = normalizeAlumniDonorConfiguration(value);
  return JSON.stringify({
    includeInactiveConstituents: configuration.includeInactiveConstituents,
    includeDeceasedConstituents: configuration.includeDeceasedConstituents,
    includeConstituentsWithoutValidAddress: configuration.includeConstituentsWithoutValidAddress,
    includeSoftCreditedDonors: configuration.includeSoftCreditedDonors,
    includeMatchingGiftCredits: configuration.includeMatchingGiftCredits,
    constituencies: configuration.constituencies,
    rows: configuration.rows.map((row) => ({
      key: row.key,
      queryId: row.queryId,
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
  if (!configuration.sourceLabel) {
    return "Provide a source name for this donor count configuration.";
  }
  if (!configuration.constituencies.length) {
    return "Select at least one constituency code for this donor count configuration.";
  }
  if (!configuration.rows.length) {
    return "Add at least one fiscal-year donor count.";
  }

  const queryIds = new Set();
  for (const row of configuration.rows) {
    if (!row.label) return "Each donor count needs a label.";
    if (!/^\d+$/.test(row.queryId)) {
      return `Provide a numeric saved NXT query system record ID for ${row.label}.`;
    }
    if (queryIds.has(row.queryId)) {
      return `Use each saved NXT query system record ID only once; ${row.queryId} is repeated.`;
    }
    queryIds.add(row.queryId);
    if (!row.queryName) return `Provide the saved NXT query name for ${row.label}.`;
    if ((row.fiscalYearStart && !isIsoDate(row.fiscalYearStart)) ||
        (row.fiscalYearEnd && !isIsoDate(row.fiscalYearEnd))) {
      return `Use YYYY-MM-DD dates for ${row.label}.`;
    }
    if (row.fiscalYearStart && row.fiscalYearEnd && row.fiscalYearStart > row.fiscalYearEnd) {
      return `${row.label} has an end date before its start date.`;
    }
  }

  return "";
}
