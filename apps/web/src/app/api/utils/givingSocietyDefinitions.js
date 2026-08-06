export const GIVING_SOCIETY_BASIS_OPTIONS = ["annual", "lifetime"];
export const GIVING_SOCIETY_PERIOD_OPTIONS = [
  "calendar_year",
  "fiscal_year",
  "lifetime",
];

export const GIVING_SOCIETY_COUNT_SOURCE_OPTIONS = [
  {
    key: "received_revenue",
    label: "Received revenue",
    description: "Cash received on eligible gifts during the society period.",
  },
  {
    key: "recognition_credit",
    label: "Recognition credit / recognized gifts",
    description: "Soft-credit or recognition-credit amounts assigned to the constituent.",
  },
  {
    key: "committed",
    label: "Committed giving",
    description: "Lifetime committed giving from Blackbaud's giving summary.",
  },
];

export const DEFAULT_GIVING_SOCIETY_CONFIGURATIONS = [
  {
    key: "presidents_society",
    name: "President's Society",
    basis: "annual",
    periodBasis: "calendar_year",
    fiscalYearStartMonth: 7,
    minimumAmount: 10000,
    maximumAmount: null,
    countSources: ["received_revenue", "recognition_credit"],
    active: true,
    displayOrder: 1,
  },
  {
    key: "order_of_the_dolphin",
    name: "Order of the Dolphin",
    basis: "annual",
    periodBasis: "calendar_year",
    fiscalYearStartMonth: 7,
    minimumAmount: 1000,
    maximumAmount: 9999.99,
    countSources: ["received_revenue", "recognition_credit"],
    active: true,
    displayOrder: 2,
  },
];

const COUNT_SOURCE_ALIASES = {
  recognized: "recognition_credit",
  recognition: "recognition_credit",
  recognition_credit: "recognition_credit",
  received: "received_revenue",
  received_revenue: "received_revenue",
  revenue: "received_revenue",
  committed: "committed",
};

function toFiniteAmount(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTextKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function slugifyGivingSocietyKey(name, fallback = "giving_society") {
  return normalizeTextKey(name) || fallback;
}

export function normalizeCountSources(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

  const sources = rawValues
    .map((source) => COUNT_SOURCE_ALIASES[normalizeTextKey(source)] || normalizeTextKey(source))
    .filter(Boolean);

  const unique = Array.from(new Set(sources));
  return unique.length > 0 ? unique : ["received_revenue", "recognition_credit"];
}

export function normalizeGivingSocietyConfiguration(raw = {}, index = 0) {
  const name = String(raw.name || raw.label || "").trim() || "Giving Society";
  const basis = GIVING_SOCIETY_BASIS_OPTIONS.includes(raw.basis)
    ? raw.basis
    : "annual";
  const periodBasis =
    basis === "lifetime"
      ? "lifetime"
      : GIVING_SOCIETY_PERIOD_OPTIONS.includes(raw.periodBasis || raw.period_basis)
        ? raw.periodBasis || raw.period_basis
        : "calendar_year";
  const fiscalYearStartMonth = Math.min(
    12,
    Math.max(
      1,
      Math.round(
        toFiniteAmount(
          raw.fiscalYearStartMonth || raw.fiscal_year_start_month,
          7,
        ),
      ),
    ),
  );
  const minimumAmount = Math.max(
    0,
    toFiniteAmount(raw.minimumAmount ?? raw.minimum_amount, 0),
  );
  const rawMaximum = raw.maximumAmount ?? raw.maximum_amount;
  const maximumAmount =
    rawMaximum === null || rawMaximum === undefined || rawMaximum === ""
      ? null
      : Math.max(minimumAmount, toFiniteAmount(rawMaximum, minimumAmount));
  const displayOrder = Math.round(
    toFiniteAmount(raw.displayOrder || raw.display_order, index + 1),
  );

  return {
    key: String(raw.key || slugifyGivingSocietyKey(name, `giving_society_${index + 1}`)).trim(),
    name,
    label: name,
    basis,
    periodBasis,
    period_basis: periodBasis,
    fiscalYearStartMonth,
    fiscal_year_start_month: fiscalYearStartMonth,
    minimumAmount,
    minimum: minimumAmount,
    minimum_amount: minimumAmount,
    maximumAmount,
    maximum: maximumAmount,
    maximum_amount: maximumAmount,
    countSources: normalizeCountSources(raw.countSources || raw.count_sources),
    count_sources: normalizeCountSources(raw.countSources || raw.count_sources),
    active: raw.active !== false,
    displayOrder,
    display_order: displayOrder,
    hierarchy: displayOrder,
  };
}

export function getDefaultGivingSocietyConfigurations() {
  return DEFAULT_GIVING_SOCIETY_CONFIGURATIONS.map((definition, index) =>
    normalizeGivingSocietyConfiguration(definition, index),
  );
}

export function normalizeGivingSocietyConfigurations(definitions) {
  const source = Array.isArray(definitions) && definitions.length > 0
    ? definitions
    : DEFAULT_GIVING_SOCIETY_CONFIGURATIONS;

  return source
    .map((definition, index) => normalizeGivingSocietyConfiguration(definition, index))
    .sort((left, right) => {
      if (left.displayOrder !== right.displayOrder) {
        return left.displayOrder - right.displayOrder;
      }
      return left.name.localeCompare(right.name);
    });
}

export function getGivingSocietyConfigurationSignature(definitions) {
  return normalizeGivingSocietyConfigurations(definitions)
    .map((definition) =>
      [
        definition.key,
        definition.name,
        definition.basis,
        definition.periodBasis,
        definition.fiscalYearStartMonth,
        definition.minimumAmount,
        definition.maximumAmount ?? "",
        definition.countSources.join("+"),
        definition.active ? "active" : "inactive",
      ].join(":"),
    )
    .join("|");
}
