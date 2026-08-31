export const DONORS_BY_CONSTITUENCY_SOURCE_KEY = "donors-by-constituency";

// These IDs came from the working NXT "Alumni Donors FY27" definition. The
// Query API requires table-entry IDs, not the display labels used in NXT.
export const ALUMNI_CONSTITUENCY_CODE_OPTIONS = [
  { id: "13", label: "Alumni" },
  { id: "12366", label: "Alumni - Honorary Doctorate" },
  { id: "9799", label: "Alumni - Non-Graduate" },
  { id: "14061", label: "Alumni - Spouse" },
  { id: "9721", label: "Alumni - Surviving Spouse" },
  { id: "10296", label: "Alumni Associate's Degree" },
  { id: "8818", label: "Alumni Bachelor's Degree" },
  { id: "8897", label: "Alumni Graduate Degree" },
  { id: "9384", label: "Alumni Orthodontic Program" },
];

// Kept as labels for the configuration UI and existing saved configurations.
export const AVAILABLE_CONSTITUENCY_CODES = ALUMNI_CONSTITUENCY_CODE_OPTIONS.map(
  (option) => option.label,
);

// Legacy direct-Gift settings are retained while existing configurations are
// migrated. The Query API definition below intentionally does not use them.
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
const CODE_OPTION_BY_LABEL = new Map(
  ALUMNI_CONSTITUENCY_CODE_OPTIONS.map((option) => [
    normalizeComparableText(option.label),
    option,
  ]),
);

export const ALUMNI_DONOR_QUERY_FIELDS = {
  constituencyCode: 2217,
  giftDate: 8471,
};

// These identifiers mirror the working NXT "Alumni Donors FY27" query
// supplied by Advancement Services. Category does not create or change a
// saved query; it keeps the ad-hoc definition in the same supported shape.
export const ALUMNI_DONOR_QUERY_TYPE_ID = 18;
export const ALUMNI_DONOR_QUERY_CATEGORY_ID = 81;

export const ALUMNI_DONOR_ROW_REFRESH_POLICIES = [
  {
    key: "refreshable",
    label: "Refresh with report",
    description: "Runs again when an administrator or the scheduled report refresh requests new data.",
  },
  {
    key: "frozen",
    label: "Frozen snapshot",
    description:
      "Keeps its last successful total and makes no further NXT calls until the row definition changes or it is changed back to refreshable.",
  },
];

const ALUMNI_DONOR_ROW_REFRESH_POLICY_KEYS = new Set(
  ALUMNI_DONOR_ROW_REFRESH_POLICIES.map((policy) => policy.key),
);

export const DEFAULT_ALUMNI_DONOR_CONFIGURATION = {
  sourceKey: DONORS_BY_CONSTITUENCY_SOURCE_KEY,
  sourceLabel: "Donors by Constituency",
  constituencies: AVAILABLE_CONSTITUENCY_CODES,
  // Existing values stay intact in saved configurations, but the new
  // Query-API count does not pretend to support an unverified Gift Type field.
  giftTypes: GIFT_TYPE_OPTIONS.map((option) => option.key),
  includeSoftCreditedDonors: true,
  includeMatchingGiftCredits: true,
  includeInactiveConstituents: true,
  includeDeceasedConstituents: true,
  includeConstituentsWithNoValidAddress: true,
  rows: [
    {
      key: "fy27-alumni-giving",
      label: "FY27 Alumni Giving",
      fiscalYearStart: "2026-07-01",
      fiscalYearEnd: "2027-06-30",
      refreshPolicy: "refreshable",
    },
    {
      key: "fy26-alumni-giving",
      label: "FY26 Alumni Giving",
      fiscalYearStart: "2025-07-01",
      fiscalYearEnd: "2026-06-30",
      refreshPolicy: "frozen",
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

function normalizeComparableText(value) {
  return normalizeText(value)
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeRefreshPolicy(value, fallback = "refreshable") {
  const policy = normalizeText(value).toLocaleLowerCase("en-US");
  if (ALUMNI_DONOR_ROW_REFRESH_POLICY_KEYS.has(policy)) return policy;
  return fallback;
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
      refreshPolicy: normalizeRefreshPolicy(row?.refreshPolicy, defaultRow.refreshPolicy),
    };
  });
}

function entryToConstituencyText(entry) {
  if (entry && typeof entry === "object") {
    const id = normalizeText(entry.id || entry.value || entry.code);
    const label = normalizeText(entry.label || entry.name || entry.description);
    if (id && label) return `${id} | ${label}`;
    return label || id;
  }
  return normalizeText(entry);
}

function normalizeConstituencies(value) {
  if (!Array.isArray(value)) return [...AVAILABLE_CONSTITUENCY_CODES];
  const unique = [];
  const seen = new Set();
  value.forEach((entry) => {
    const code = entryToConstituencyText(entry);
    const normalizedCode = normalizeComparableText(code);
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

function getConfiguredConstituencyOption(value) {
  const text = entryToConstituencyText(value);
  const known = CODE_OPTION_BY_LABEL.get(normalizeComparableText(text));
  if (known) return { ...known };

  // Additional codes can be entered as "12345 | Display label". The ID is
  // the only portion sent to NXT; the label is retained for administrators.
  const match = text.match(/^\s*(\d+)\s*(?:[|:-]\s*(.+))?$/);
  if (!match) return { id: "", label: text };
  return {
    id: match[1],
    label: normalizeText(match[2], `NXT code ${match[1]}`),
  };
}

export function getAlumniDonorConstituencyOptions(value) {
  const configuration = normalizeAlumniDonorConfiguration(value);
  return configuration.constituencies.map(getConfiguredConstituencyOption);
}

export function normalizeAlumniDonorConfiguration(value) {
  const configuration = parseConfiguration(value);
  return {
    sourceKey: DONORS_BY_CONSTITUENCY_SOURCE_KEY,
    sourceLabel: DEFAULT_ALUMNI_DONOR_CONFIGURATION.sourceLabel,
    constituencies: normalizeConstituencies(configuration.constituencies),
    giftTypes: normalizeGiftTypes(configuration.giftTypes),
    includeSoftCreditedDonors: normalizeBoolean(
      configuration.includeSoftCreditedDonors,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeSoftCreditedDonors,
    ),
    includeMatchingGiftCredits: normalizeBoolean(
      configuration.includeMatchingGiftCredits,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeMatchingGiftCredits,
    ),
    includeInactiveConstituents: normalizeBoolean(
      configuration.includeInactiveConstituents,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeInactiveConstituents,
    ),
    includeDeceasedConstituents: normalizeBoolean(
      configuration.includeDeceasedConstituents,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeDeceasedConstituents,
    ),
    includeConstituentsWithNoValidAddress: normalizeBoolean(
      configuration.includeConstituentsWithNoValidAddress,
      DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeConstituentsWithNoValidAddress,
    ),
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
    queryDefinitionVersion: 1,
    constituencies: getAlumniDonorConstituencyOptions(configuration),
    includeSoftCreditedDonors: configuration.includeSoftCreditedDonors,
    includeMatchingGiftCredits: configuration.includeMatchingGiftCredits,
    includeInactiveConstituents: configuration.includeInactiveConstituents,
    includeDeceasedConstituents: configuration.includeDeceasedConstituents,
    includeConstituentsWithNoValidAddress:
      configuration.includeConstituentsWithNoValidAddress,
    rows: configuration.rows.map((row) => ({
      key: row.key,
      label: row.label,
      fiscalYearStart: row.fiscalYearStart,
      fiscalYearEnd: row.fiscalYearEnd,
    })),
  });
}

// A row policy controls when a total is refreshed, not what the total means.
// Keep it out of the data fingerprint so an administrator can freeze or unfreeze
// an already compatible result without invalidating the saved value itself.
export function getAlumniDonorCountRowFingerprint(value, countRow) {
  const configuration = normalizeAlumniDonorConfiguration(value);
  const row = countRow || configuration.rows[0] || {};

  return JSON.stringify({
    queryDefinitionVersion: 1,
    constituencies: getAlumniDonorConstituencyOptions(configuration),
    includeSoftCreditedDonors: configuration.includeSoftCreditedDonors,
    includeMatchingGiftCredits: configuration.includeMatchingGiftCredits,
    includeInactiveConstituents: configuration.includeInactiveConstituents,
    includeDeceasedConstituents: configuration.includeDeceasedConstituents,
    includeConstituentsWithNoValidAddress:
      configuration.includeConstituentsWithNoValidAddress,
    fiscalYearStart: normalizeText(row.fiscalYearStart),
    fiscalYearEnd: normalizeText(row.fiscalYearEnd),
  });
}

function formatQueryDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
}

export function buildAlumniDonorQueryDefinition(value, countRow) {
  const configuration = normalizeAlumniDonorConfiguration(value);
  const row = countRow || configuration.rows[0];
  const constituencyIds = getAlumniDonorConstituencyOptions(configuration)
    .map((option) => option.id)
    .filter(Boolean);
  const startDate = formatQueryDate(row?.fiscalYearStart);
  const endDate = formatQueryDate(row?.fiscalYearEnd);

  if (!constituencyIds.length) {
    throw new Error("Select at least one NXT constituency code before refreshing this donor count.");
  }
  if (!startDate || !endDate) {
    throw new Error(`Use valid fiscal-year dates for ${row?.label || "this donor count"}.`);
  }

  return {
    type_id: ALUMNI_DONOR_QUERY_TYPE_ID,
    category_id: ALUMNI_DONOR_QUERY_CATEGORY_ID,
    format: "Dynamic",
    sql_generation_mode: "Query",
    result_layout: "MultiRow",
    // Count constituents, not gift rows. A couple who each receive a soft
    // credit remains two rows because they are two distinct constituents.
    suppress_duplicates: true,
    advanced_processing_options: {
      use_alternate_sql_code_table_fields: false,
      use_alternate_sql_multiple_attributes: false,
    },
    constituent_filters: {
      include_deceased: configuration.includeDeceasedConstituents,
      include_inactive: configuration.includeInactiveConstituents,
      include_no_valid_addresses: configuration.includeConstituentsWithNoValidAddress,
    },
    gift_processing_options: {
      matching_gift_credit_option: configuration.includeMatchingGiftCredits ? "Both" : "Donor",
      soft_credit_option: configuration.includeSoftCreditedDonors ? "Both" : "Donor",
      ...(configuration.includeSoftCreditedDonors
        ? { soft_credit_sub_option: "FullAmountToAll" }
        : {}),
      use_gross_amount_for_covenants: false,
    },
    filter_fields: [
      {
        compare_type: "None",
        filter_values: constituencyIds,
        left_parenthesis: false,
        operator: "OneOf",
        query_field_id: ALUMNI_DONOR_QUERY_FIELDS.constituencyCode,
        right_parenthesis: false,
      },
      {
        compare_type: "And",
        filter_values: [startDate, endDate],
        left_parenthesis: false,
        operator: "Between",
        query_field_id: ALUMNI_DONOR_QUERY_FIELDS.giftDate,
        right_parenthesis: false,
      },
    ],
    // Query jobs only need the row count. Avoid sending names, emails, or
    // constituent IDs through this report path.
    select_fields: [],
  };
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function validateAlumniDonorConfiguration(value) {
  const configuration = normalizeAlumniDonorConfiguration(value);
  if (!configuration.constituencies.length) {
    return "Select at least one constituency code for this donor count configuration.";
  }

  const invalidConstituency = getAlumniDonorConstituencyOptions(configuration).find(
    (option) => !option.id,
  );
  if (invalidConstituency) {
    return `Add the NXT code ID for ${invalidConstituency.label || "each additional constituency"} using "12345 | Display label".`;
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
