import { fiscalYearForOpportunityDate, getProspectFiscalYearLabel, withProspectDisplayData } from "./prospectDisplay";
import { calendarDate } from "./prospectActivity";
import { buildBlackbaudConstituentProfileUrl } from "./blackbaudLinks";

export const EXPORT_LIMITS = { owners: 50, prospects: 10000, opportunities: 25000, perProspect: 1000 };
export const PROSPECT_EXPORT_COLUMNS = [
  { key: "mgo", label: "MGO / workspace", required: true },
  { key: "rank", label: "Portfolio rank", type: "number", default: true },
  { key: "name", label: "Constituent", required: true },
  { key: "status", label: "Prospect status", default: true },
  { key: "pipeline", label: "Open opportunity pipeline", type: "currency", default: true },
  { key: "openCount", label: "Open opportunities", type: "number", default: true },
  { key: "years", label: "Open opportunity fiscal years", default: true },
  { key: "nextStep", label: "Next step", default: true },
  { key: "due", label: "Next step due", type: "date", default: true },
  { key: "followUp", label: "Next step status", default: true },
  { key: "profile", label: "NXT profile", default: true },
  { key: "lookupId", label: "Lookup ID" },
  { key: "email", label: "Email (saved)" },
  { key: "phone", label: "Phone (saved)" },
  { key: "societies", label: "Giving societies (saved)" },
  { key: "latestAction", label: "Latest known action" },
  { key: "latestActionDate", label: "Latest known action date", type: "date" },
  { key: "latestGiftDate", label: "Latest cached gift date", type: "date" },
  { key: "latestGiftAmount", label: "Latest cached gift amount", type: "currency" },
  { key: "savedAt", label: "Prospect saved at (UTC)", required: true },
  { key: "identityAt", label: "Identity snapshot at (UTC)" },
  { key: "activityAt", label: "Action cache at (UTC)" },
  { key: "giftAt", label: "Gift cache at (UTC)" },
  { key: "societiesAt", label: "Society snapshot at (UTC)" },
];
export const DEFAULT_EXPORT_COLUMNS = PROSPECT_EXPORT_COLUMNS.filter((c) => c.default || c.required).map((c) => c.key);
export const OPPORTUNITY_EXPORT_COLUMNS = [
  { key: "mgo", label: "MGO / workspace" }, { key: "name", label: "Constituent" },
  { key: "title", label: "Opportunity" }, { key: "stage", label: "Stage" },
  { key: "status", label: "Status" }, { key: "amount", label: "Ask amount", type: "currency" },
  { key: "expected", label: "Expected date", type: "date" }, { key: "fy", label: "Expected fiscal year" },
  { key: "funded", label: "Funded amount", type: "currency" },
  { key: "closed", label: "Closed date", type: "date" },
  { key: "sharedKey", label: "Opportunity reference (deduplication)" },
  { key: "profile", label: "NXT profile" }, { key: "savedAt", label: "Opportunity saved at (UTC)" },
];

export function exportError(message, status = 400) {
  return Object.assign(new Error(message), { exportStatus: status });
}

function ids(value, max, label) {
  if (!Array.isArray(value) || !value.length || value.length > max ||
      value.some((id) => !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)))) {
    throw exportError(`Choose between 1 and ${max} ${label}.`);
  }
  const result = value.map(String);
  if (new Set(result).size !== result.length) throw exportError(`Duplicate ${label} selected.`);
  return result;
}

export function validateExportOptions(body) {
  if (!body || !["filtered", "active", "master"].includes(body.scope) || !["xlsx", "csv"].includes(body.format)) {
    throw exportError("Choose a valid export scope and format.");
  }
  if (!Array.isArray(body.columns) || body.columns.length > PROSPECT_EXPORT_COLUMNS.length ||
      body.columns.some((key) => !PROSPECT_EXPORT_COLUMNS.some((c) => c.key === key))) {
    throw exportError("Choose valid export columns.");
  }
  for (const key of ["includeInactive", "includeClosedOpportunities"]) {
    if (body[key] != null && typeof body[key] !== "boolean") throw exportError("Invalid export options.");
  }
  const selected = new Set(body.columns);
  // Freshness accompanies optional cached fields, even if its checkbox was omitted.
  if (["latestAction", "latestActionDate"].some((k) => selected.has(k))) selected.add("activityAt");
  if (["latestGiftDate", "latestGiftAmount"].some((k) => selected.has(k))) selected.add("giftAt");
  if (selected.has("societies")) selected.add("societiesAt");
  if (["email", "phone", "lookupId"].some((k) => selected.has(k))) selected.add("identityAt");
  return {
    scope: body.scope, format: body.format,
    columns: PROSPECT_EXPORT_COLUMNS.filter((c) => c.required || selected.has(c.key)),
    ownerIds: ids(body.ownerIds, body.scope === "master" ? EXPORT_LIMITS.owners : 1, "workspaces"),
    prospectIds: body.scope === "filtered" ? ids(body.prospectIds, EXPORT_LIMITS.prospects, "prospects") : [],
    includeInactive: body.scope !== "filtered" && body.includeInactive === true,
    includeClosedOpportunities: body.includeClosedOpportunities === true,
  };
}

const text = (value) => typeof value === "string" ? value : "";
const numeric = (value) => !["string", "number"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const timestamp = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : "";

export function buildProspectExport(records, options, owners, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const summary = [];
  const opportunities = [];
  for (const record of records) {
    const linked = Array.isArray(record.opportunities) ? record.opportunities : [];
    if (linked.length > EXPORT_LIMITS.perProspect) throw exportError("A prospect exceeds the opportunity export limit. Narrow the export.");
    const p = withProspectDisplayData(record, linked.map((o) => ({ ...o, expected_date: calendarDate(o.expected_date) })));
    const open = linked.filter((o) => o.opportunity_status === "Active");
    const mapped = record.saved_identity || {};
    const due = !p.next_action_completed_at ? calendarDate(p.next_action_due_date) : null;
    const nextStep = !p.next_action_completed_at ? text(p.next_action_text) : "";
    const followUp = !nextStep ? "No next step" : !due ? "Date not set" : due < today ? "Overdue" : due === today ? "Due today" : "Scheduled";
    const cachedAction = record.cached_action?.data;
    const localAction = record.latest_local_action;
    const action = [cachedAction, localAction].filter((a) => calendarDate(a?.date) && calendarDate(a.date) <= today)
      .sort((a, b) => calendarDate(b.date).localeCompare(calendarDate(a.date)))[0];
    const gift = record.cached_gift?.data;
    const owner = owners.find((u) => String(u.id) === String(p.user_id));
    const mgo = owner?.name || owner?.email || "Workspace";
    const profile = buildBlackbaudConstituentProfileUrl(p.blackbaud_constituent_id);
    const societyData = record.saved_societies;
    const societies = Array.isArray(societyData?.societies) ? societyData.societies : societyData?.primarySociety ? [societyData.primarySociety] : [];
    summary.push({
      mgo, rank: p.status === "Active" ? numeric(p.portfolio_rank) : null, name: p.prospect_name, status: p.status,
      // A missing amount is unknown, not zero. Do not publish a partial pipeline as a complete total.
      pipeline: open.some((o) => numeric(o.estimated_amount) == null) ? null : open.reduce((sum, o) => sum + Number(o.estimated_amount), 0),
      openCount: open.length, years: getProspectFiscalYearLabel({ ...p, status: "Active" }), nextStep, due, followUp, profile,
      lookupId: text(mapped.lookupId || mapped.lookup_id), email: text(mapped.email) || text(record.email), phone: text(mapped.phone) || text(record.phone),
      societies: societies.map((s) => `${text(s.label)}${s.year || societyData.year ? ` (${s.year || societyData.year})` : ""}`).join("; "),
      latestAction: action ? [text(action.summary), text(action.category), text(action.type)].filter(Boolean).join(" / ") : "",
      latestActionDate: calendarDate(action?.date), latestGiftDate: calendarDate(gift?.date), latestGiftAmount: numeric(gift?.amount),
      savedAt: timestamp(p.updated_at), identityAt: timestamp(record.identity_at), activityAt: timestamp(record.cached_action?.fetchedAt),
      giftAt: timestamp(record.cached_gift?.fetchedAt), societiesAt: timestamp(record.societies_at),
    });
    for (const o of linked.filter((o) => options.includeClosedOpportunities || o.opportunity_status === "Active")) {
      opportunities.push({ mgo, name: p.prospect_name, title: o.title, stage: o.current_stage, status: o.opportunity_status,
        amount: numeric(o.estimated_amount), expected: calendarDate(o.expected_date), fy: fiscalYearForOpportunityDate(calendarDate(o.expected_date)),
        funded: numeric(o.closed_amount), closed: calendarDate(o.close_date),
        sharedKey: o.blackbaud_opportunity_id ? `NXT:${o.blackbaud_opportunity_id}` : o.shared_opportunity_key || `Local:${o.id}`,
        profile, savedAt: timestamp(o.updated_at) });
      if (opportunities.length > EXPORT_LIMITS.opportunities) throw exportError("Too many opportunities. Export fewer workspaces at a time.");
    }
  }
  const notes = [
    ["Exported at (UTC)", now.toISOString()], ["Scope", options.scope],
    ["Selected workspaces", owners.map((o) => o.name || o.email).join("; ")],
    ["Prospect rows", summary.length], ["Opportunity rows", opportunities.length],
    ["Included prospects", options.includeInactive ? "Active, closed and archived" : "Active only"],
    ["Included opportunities", options.includeClosedOpportunities ? "Open and closed" : "Open only"],
    ["Source", "Saved app records and available caches. Export makes no Blackbaud calls and does not generate AI summaries."],
    ["Freshness", "Saved timestamps are not a live NXT verification. Blank cached fields mean unavailable, not zero. Latest known action may be a saved app action; the action cache timestamp covers NXT data only."],
    ["Ranking", "Portfolio rank is within each MGO's active list, not an institution-wide ranking. Filtered exports retain the displayed order."],
    ["Shared prospects", "A prospect appears once per selected workspace. Shared opportunities can appear under multiple MGOs. Use the opportunity reference to identify repeated opportunities; do not sum the master as unique institutional revenue."],
    ["Pipeline", "Open opportunity ask amounts, not FY raised or the Team Standings revenue total. A blank pipeline indicates an open opportunity with an unknown amount."],
    ["Privacy", "Internal fundraising use only. Contact columns are optional. Store and share this file only with authorized people."],
  ];
  return { summary, opportunities, notes, columns: options.columns };
}

export function prospectExportCsv(model) {
  const cell = (value) => {
    let result = value == null ? "" : String(value);
    // Quoting alone does not neutralize spreadsheet formulas in CSV imports.
    if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(result)) result = `'${result}`;
    return `"${result.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [model.columns.map((c) => c.label), ...model.summary.map((row) => model.columns.map((c) => row[c.key]))]
    .map((row) => row.map(cell).join(",")).join("\r\n");
}
