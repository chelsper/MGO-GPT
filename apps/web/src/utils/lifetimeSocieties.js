export const LIFETIME_REPORT_KEY = "lifetime-giving-societies";
export const LIFETIME_QUERY_ID = "31118";
export const LIFETIME_QUERY_NAME = "Lifetime Giving - JUMGOGPT";
export const LIFETIME_RULE_VERSION = 3;
export const LIFETIME_SOCIETY_KEYS = ["1934_club", "frances_bartlett_kinne_society"];
export const lifetimeError = (message, status = 422) => Object.assign(new Error(message), { lifetimeSafe: true, status });
export const lifetimeMoney = cents => cents == null ? "Needs review" : new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
}).format(cents / 100);
export const lifetimeDate = date => date ? new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`)) : "Needs review";
export const lifetimeFiscalYear = date => date ? `FY${String(Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) >= 7 ? 1 : 0)).slice(-2)}` : "";

// These are semantic paths, not guesses based on an alias containing "ID".
export const LIFETIME_FIELDS = {
  constituentId: { label: "Constituent system record ID (optional)", names: ["Constituent System Record ID", "System Record ID"], path: "Constituent" },
  lookupId: { label: "Constituent ID", names: ["Constituent ID"], path: "Constituent" },
  name: { label: "Constituent name", names: ["Name", "Constituent Name"], path: "Constituent", required: true },
  constituentType: { label: "Individual / organization (for filtering)", names: ["Key Indicator", "Constituent Key Indicator"], path: "Constituent" },
  giftId: { label: "Gift system record ID", names: ["System Record ID", "Gift System Record ID"], path: "Gift Information", required: true },
  date: { label: "Gift date", names: ["Gift Date"], path: "Gift Information", required: true },
  amount: { label: "Gift amount", names: ["Gift Amount"], path: "Gift Information", required: true },
  type: { label: "Gift type", names: ["Gift Type"], path: "Gift Information", required: true },
  credit: { label: "Soft Credit/Matching Gift Flag", names: ["Soft Credit/Matching Gift Flag"], path: "Gift Information", required: true, many: true },
};

export function lifetimeSourceWarnings(query) {
  const warnings = [
    "Dates are provisional calculations from this query, not official induction dates. Historical adjustments, recognition settings and household credit still require reconciliation.",
    "This report treats each constituent record separately. Spouses are not combined and constituent totals must not be added together as organizational revenue.",
  ];
  if (query.constituent_filters?.include_deceased === false) warnings.push("This query excludes deceased constituents.");
  if (query.filter_fields?.some(field => /Donor Recognition/i.test(field.query_field?.selected_field_name || "")))
    warnings.push("This query is limited by Donor Recognition. It does not discover qualifying donors who are missing that custom field.");
  if (query.gift_processing_options?.soft_credit_sub_option === "FullAmountToAll")
    warnings.push("Soft credits use Full amount to all. For both 1934 and Kinne, dates involving soft credit are withheld until actual recipient credit allocations can be verified.");
  return warnings;
}

export const lifetimeTypeLabel = type => type === "individual" ? "Individual" : type === "organization" ? "Organization" : "Type not supplied / needs review";
export function lifetimeConstituentType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  return ["i", "individual"].includes(type) ? "individual" : ["o", "organization"].includes(type) ? "organization" : "unknown";
}

export function lifetimeCoverage(rows) {
  return { constituents: new Set(rows.map(row => row.id)).size,
    provisional: rows.filter(row => row.status === "provisional").length,
    review: rows.filter(row => row.status !== "provisional").length,
    unclassified: new Set(rows.filter(row => !["individual", "organization"].includes(row.constituentType)).map(row => row.id)).size };
}

export function filterLifetimeRows(rows, { search = "", society = "", constituentType = "", status = "", year = "" } = {}) {
  const term = search.trim().toLowerCase();
  return rows.filter(row => (!society || row.societyKey === society) && (!status || row.status === status) &&
    (!constituentType || (row.constituentType || "unknown") === constituentType) &&
    (!year || lifetimeFiscalYear(row.date) === year) && `${row.name} ${row.systemId || ""} ${row.lookupId || ""}`.toLowerCase().includes(term));
}

export function lifetimeCsv(rows) {
  const safe = value => {
    const text = String(value ?? "");
    return `"${(/^[\s]*[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  return [["Constituent system record ID", "Constituent ID", "Name", "Constituent type", "Society", "Threshold", "Calculated qualification date (provisional)",
    "Fiscal year", "Imported qualifying history", "Status", "Review notes"],
  ...rows.map(row => [row.systemId, row.lookupId, row.name, lifetimeTypeLabel(row.constituentType), row.societyName, (row.thresholdCents / 100).toFixed(2), row.date,
    lifetimeFiscalYear(row.date), row.totalCents == null ? "" : (row.totalCents / 100).toFixed(2),
    row.status === "provisional" ? "Provisional - reconcile history" : "Needs review", [...row.reasons, row.constituentTypeNote].filter(Boolean).join("; ")])]
    .map(row => row.map(safe).join(",")).join("\r\n");
}
