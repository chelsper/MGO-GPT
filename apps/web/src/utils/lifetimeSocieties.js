export const LIFETIME_REPORT_KEY = "lifetime-giving-societies";
export const LIFETIME_QUERY_ID = "31118";
export const LIFETIME_QUERY_NAME = "Lifetime Giving - JUMGOGPT";
export const LIFETIME_RULE_VERSION = 5;
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
  spouseLookupId: { label: "Spouse Constituent ID (automatic households)", names: ["Constituent ID", "Spouse Constituent ID"], path: "Spouse" },
  spouseId: { label: "Spouse system record ID (alternative)", names: ["System Record ID", "Spouse System Record ID"], path: "Spouse" },
  maritalStatus: { label: "Marital Status (automatic households)", names: ["Marital Status"], path: "Constituent" },
  giftId: { label: "Gift system record ID", names: ["System Record ID", "Gift System Record ID"], path: "Gift Information", required: true },
  date: { label: "Gift date", names: ["Gift Date"], path: "Gift Information", required: true },
  amount: { label: "Gift amount", names: ["Gift Amount"], path: "Gift Information", required: true },
  type: { label: "Gift type", names: ["Gift Type"], path: "Gift Information", required: true },
  credit: { label: "Soft Credit/Matching Gift Flag", names: ["Soft Credit/Matching Gift Flag"], path: "Gift Information", required: true, many: true },
};

export function lifetimeSourceWarnings(query) {
  const warnings = [
    "Dates are provisional calculations from this query, not official induction dates. Historical adjustments, recognition settings and household credit still require reconciliation.",
    "Reciprocal spouse IDs and either Married or Alum married to alum status on both individuals allow automatic households. Shared gifts alone do not prove a household. Companies remain separate; a household includes only gifts given by or explicitly credited to its members, once per gift. Recognition totals must not be added together as organizational revenue.",
  ];
  if (query.constituent_filters?.include_deceased === false) warnings.push("This query excludes deceased constituents.");
  if (query.filter_fields?.some(field => /Donor Recognition/i.test(field.query_field?.selected_field_name || "")))
    warnings.push("This query is limited by Donor Recognition. It does not discover qualifying donors who are missing that custom field.");
  if (query.gift_processing_options?.soft_credit_sub_option === "FullAmountToAll")
    warnings.push("Soft credits use Full amount to all, as selected for this report. Each recognized recipient receives the full gift amount; a confirmed group counts that gift only once. These are recognition totals, not additional revenue.");
  return warnings;
}

export const lifetimeTypeLabel = type => type === "individual" ? "Individual" : type === "organization" ? "Organization" : type === "mixed" ? "Individuals & organizations" : "Type not supplied / needs review";
export function lifetimeConstituentType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  return ["i", "individual"].includes(type) ? "individual" : ["o", "organization"].includes(type) ? "organization" : "unknown";
}

export function lifetimeCoverage(rows) {
  return { constituents: new Set(rows.map(row => row.id)).size,
    confirmed: rows.filter(row => row.status === "confirmed").length,
    provisional: rows.filter(row => row.status === "provisional").length,
    review: rows.filter(row => !["confirmed", "provisional"].includes(row.status)).length,
    unclassified: new Set(rows.filter(row => !["individual", "organization", "mixed"].includes(row.constituentType)).map(row => row.id)).size };
}

export const lifetimeNeedsInvestigation = row => !["provisional", "confirmed"].includes(row.status) || !!row.reasons?.length || !!row.confirmationNeedsReview;
export function lifetimeMatchesQueue(row, queue) {
  if (queue === "attention") return row.status !== "confirmed" || lifetimeNeedsInvestigation(row);
  if (queue === "review") return lifetimeNeedsInvestigation(row);
  if (queue === "provisional") return row.status === "provisional" && !lifetimeNeedsInvestigation(row);
  return !queue || row.status === queue;
}
export function lifetimeReviewSteps(row) {
  const steps = new Set();
  for (const reason of row.reasons || []) {
    if (/complex gifts|linked history|Pledge history/.test(reason)) steps.add("Use Check linked history to verify the pledge, its applied payments and dated write-offs. Earlier credited payments retain their dates. Only unverifiable evidence needs staff review; do not confirm a date from the supported subtotal alone.");
    else if (/conflict/.test(reason)) steps.add("Check the listed gift system IDs for conflicting amounts, dates, types or owners. Resolve the source conflict before refreshing; no conflicting value is chosen as correct.");
    else if (/gift date/.test(reason)) steps.add("Verify the gift date in NXT. Missing, invalid or future dates cannot establish a past milestone.");
    else if (/gift amount/.test(reason)) steps.add("Verify the gift amount and any adjustments in NXT. Do not treat missing amounts as zero.");
    else if (/credit flag|allocation/.test(reason)) steps.add("Have Advancement Services verify the credit flag and query recognition settings. No recipient credit is inferred from a donor's name.");
    else if (/criteria/.test(reason)) steps.add("Review the query's gift-level filters for omitted earlier gifts. Changing the report view will not restore gifts absent from the source.");
    else if (/does not demonstrate/.test(reason)) steps.add("Check whether earlier qualifying gifts are absent or the imported history is below this threshold. A missing date is not proof of ineligibility.");
    else if (/reopened/.test(reason)) steps.add("Refresh gift history when ready to calculate a replacement provisional date. Reopening does not change another society's confirmed date.");
    else steps.add("Ask Advancement Services to reconcile the saved review note before confirming this date.");
  }
  if (row.confirmationNeedsReview) steps.add("The society rules changed after confirmation. Review the saved date; reopen it only if staff decides a correction is necessary.");
  if (!steps.size) steps.add(row.status === "confirmed" ? "This date is already confirmed. No repeat approval is needed. Reopen review only for an intentional correction."
    : "Check the included gifts, recognition settings and household members, then explicitly confirm the provisional date when satisfied.");
  return [...steps];
}

// Archiving is a display choice only, after all gift and household calculations.
// A household remains visible while at least one member is active.
export function lifetimeVisibleRows(snapshot, households = true, archive = "active") {
  const rows = households && archive !== "archived" ? lifetimeHouseholdRows(snapshot) : snapshot?.rows || [];
  return rows.filter(row => archive === "all" || (archive === "archived" ? row.archived : !row.archived));
}

export function lifetimeActiveGroupIds(snapshot) {
  const confirmed = new Set(snapshot?.confirmedGroupIds || []);
  const separate = new Set(snapshot?.separateGroupIds || []);
  return new Set((snapshot?.sharedGroups || []).filter(group => group.automatic ? !separate.has(group.id) : confirmed.has(group.id)).map(group => group.id));
}

export function lifetimeHouseholdRows(snapshot) {
  const active = lifetimeActiveGroupIds(snapshot);
  const groups = (snapshot?.sharedGroups || []).filter(group => active.has(group.id));
  if (!groups.length) return snapshot?.rows || [];
  const members = new Set(groups.flatMap(group => group.members.map(member => member.id)));
  return [...(snapshot?.rows || []).filter(row => !members.has(row.id)), ...groups.flatMap(group => group.rows)]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function filterLifetimeRows(rows, { search = "", society = "", constituentType = "", status = "", year = "" } = {}) {
  const term = search.trim().toLowerCase();
  return rows.filter(row => (!society || row.societyKey === society) && lifetimeMatchesQueue(row, status) &&
    (!constituentType || (row.constituentType || "unknown") === constituentType) &&
    (!year || lifetimeFiscalYear(row.date) === year) && `${row.name} ${row.systemId || ""} ${row.lookupId || ""} ${(row.members || []).map(member => `${member.name} ${member.lookupId} ${member.systemId || ""}`).join(" ")}`.toLowerCase().includes(term));
}

export function lifetimeCsv(rows) {
  const safe = value => {
    const text = String(value ?? "");
    return `"${(/^[\s]*[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  return [["Constituent system record ID", "Constituent ID", "Name", "Constituent type", "Society", "Threshold", "Entry date (see confirmation status)",
    "Fiscal year", "Imported qualifying history", "Status", "Review notes", "Household members", "Supported gifts subtotal (not complete lifetime total)", "Grouping basis", "Report visibility", "Date confirmed at"],
  ...rows.map(row => [row.systemId, row.lookupId, row.name, lifetimeTypeLabel(row.constituentType), row.societyName, (row.thresholdCents / 100).toFixed(2), row.date,
    lifetimeFiscalYear(row.date), row.totalCents == null ? "" : (row.totalCents / 100).toFixed(2),
    row.status === "confirmed" ? "Staff-confirmed entry date" : row.status === "provisional" ? "Provisional - reconcile history" : "Needs review", [...row.reasons, row.confirmationNote, row.constituentTypeNote, row.householdNote].filter(Boolean).join("; "),
    (row.members || []).map(member => `${member.name} (Constituent ID ${member.lookupId || member.systemId})${member.archived ? " [archived from separate view; credit retained]" : ""}`).join("; "),
    row.supportedCents == null ? "" : (row.supportedCents / 100).toFixed(2), row.groupBasis === "spouse" ? "NXT-linked married spouses" : row.members ? "Manually confirmed household" : "Separate constituent",
    row.archived ? "Archived - credit retained" : "Active", row.confirmedAt])]
    .map(row => row.map(safe).join(",")).join("\r\n");
}
