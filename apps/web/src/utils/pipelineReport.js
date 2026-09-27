import { calendarDate } from "./prospectActivity";
import { ORGANIZATION_REPORTING_POLICY } from "./organizationRuntimePolicy";
import { getStandingsPeriods } from "./standingsPeriods";
import { isPlaceholderProspectName } from "./prospectDisplay";
import { isAdminRole, isMgoRole } from "./workspaceRoles";

export const PIPELINE_REPORT_KEY = "opportunity-pipeline";
export const PIPELINE_OUTCOMES = ["Funded", "Declined", "Archived", "Withdrawn"];
const text = (value) => String(value ?? "").trim();
const label = (value) => text(value).toLowerCase().replace(/[\u2013\u2014-]/g, " ").replace(/\s+/g, " ");
const id = (value) => /^[1-9]\d*$/.test(text(value)) ? text(value) : "";

export function pipelineFiscalYear(date) {
  const day = calendarDate(date);
  if (!day) return null;
  const month = ORGANIZATION_REPORTING_POLICY.fiscalYearStartMonth;
  const year = Number(day.slice(0, 4)) + (month !== 1 && Number(day.slice(5, 7)) >= month ? 1 : 0);
  return year >= 1900 && year <= 9998 ? year : null;
}

export function pipelineFiscalWindow(year) {
  if (!Number.isInteger(Number(year)) || Number(year) < 1900 || Number(year) > 9998) return null;
  const month = ORGANIZATION_REPORTING_POLICY.fiscalYearStartMonth;
  const startYear = Number(year) - (month === 1 ? 0 : 1);
  return {
    year: Number(year), label: `FY${String(year).slice(-2)}`,
    startsOn: `${startYear}-${String(month).padStart(2, "0")}-01`,
    endsOn: new Date(Date.UTC(startYear + 1, month - 1, 0)).toISOString().slice(0, 10),
  };
}

export function currentPipelineFiscalYear(now = new Date()) {
  return pipelineFiscalYear(getStandingsPeriods(now).asOf);
}

export function pipelineAmount(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (!/^\d+(?:\.\d+)?$/.test(text(value))) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

function outcome(row) {
  const labels = [row.opportunity_status, row.current_stage].map(label);
  if (label(row.opportunity_status) === "archived") return "Archived";
  if (labels.some((value) => ["withdrawn", "closed withdrawn"].includes(value))) return "Withdrawn";
  if (labels.some((value) => ["declined", "closed declined"].includes(value))) return "Declined";
  if (labels.some((value) => ["funded", "closed gift secured"].includes(value))) return "Funded";
  if (labels.some((value) => ["archived", "inactive", "closed"].includes(value))) return "Archived";
  return "Active";
}

function stamp(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function savedAt(row) {
  return Math.max(stamp(row.updated_at), stamp(row.nxt_checked_at));
}

function jointIds(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value.map(id).filter(Boolean) : [];
}

// Collapse only explicit shared/NXT identities, never similar titles or names.
// Union both keys so a local joint copy and its NXT-linked copy count together.
export function buildPipelineReport(rows, users = [], now = new Date(), viewer = null) {
  const parents = rows.map((_, index) => index);
  const root = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const keys = new Map();
  rows.forEach((row, index) => {
    const identities = [
      id(row.blackbaud_opportunity_id) && `nxt:${id(row.blackbaud_opportunity_id)}`,
      text(row.shared_opportunity_key) && `joint:${text(row.shared_opportunity_key)}`,
    ].filter(Boolean);
    for (const key of identities) {
      if (keys.has(key)) parents[root(index)] = root(keys.get(key));
      else keys.set(key, index);
    }
  });
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = root(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const roster = new Map(users.map((user) => [id(user.id), text(user.name) || `Workspace ${user.id}`]));
  const opportunities = [...groups.values()].map((copies) => {
    copies.sort((a, b) => savedAt(b) - savedAt(a) || text(b.id).localeCompare(text(a.id), "en", { numeric: true }));
    const row = copies[0];
    const constituentIds = new Set(copies.map((copy) => id(copy.blackbaud_constituent_id)).filter(Boolean));
    const nxtIds = new Set(copies.map((copy) => id(copy.blackbaud_opportunity_id)).filter(Boolean));
    const identityConflict = constituentIds.size > 1 || nxtIds.size > 1;
    let status = outcome(row);
    // Archiving a prospect does not update its opportunity rows. Keep that
    // history separate unless another linked workspace still has it active.
    if (status === "Active" && copies.every((copy) => ["archived", "inactive"].includes(label(copy.prospect_status)))) status = "Archived";
    const expectedDate = calendarDate(row.expected_date);
    const closedDate = calendarDate(row.close_date);
    const yearDate = expectedDate || (status !== "Active" ? closedDate : null);
    const ownerIds = [...new Set(copies.flatMap((copy) => [id(copy.user_id), ...jointIds(copy.joint_mgo_user_ids)]).filter(Boolean))];
    return {
      id: text(row.id), title: text(row.title) || "Untitled opportunity",
      constituentName: text([row.prospect_name, row.constituent_name].find((name) => !isPlaceholderProspectName(name))) || "Unnamed constituent",
      constituentId: identityConflict ? null : [...constituentIds][0] || null,
      nxtOpportunityId: identityConflict ? null : [...nxtIds][0] || null,
      stage: text(row.current_stage) || "Stage not recorded", status,
      amount: identityConflict ? null : pipelineAmount(row.estimated_amount),
      fundedAmount: identityConflict || !["Funded", "Archived"].includes(status) ? null : pipelineAmount(row.closed_amount),
      expectedDate, closedDate,
      fiscalYear: identityConflict ? null : pipelineFiscalYear(yearDate),
      yearBasis: expectedDate ? "expected" : yearDate ? "closed" : "undated",
      fundraisers: ownerIds.map((ownerId) => ({ id: ownerId, name: roster.get(ownerId) || `Workspace ${ownerId}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      savedAt: savedAt(row) ? new Date(savedAt(row)).toISOString() : null,
      nxtCheckedAt: stamp(row.nxt_checked_at) ? new Date(stamp(row.nxt_checked_at)).toISOString() : null,
      copyCount: copies.length, identityConflict,
      canEdit: !identityConflict && (isAdminRole(viewer?.role) || (isMgoRole(viewer?.role) && copies.some((copy) => id(copy.user_id) === id(viewer?.id)))),
      canArchive: !identityConflict && isAdminRole(viewer?.role),
      pendingChange: copies.some((copy) => Boolean(copy.pipeline_change_id)),
    };
  });
  const currentYear = currentPipelineFiscalYear(now);
  const years = [...new Set([currentYear - 1, currentYear, currentYear + 1, ...opportunities.map((row) => row.fiscalYear).filter(Boolean)])].sort((a, b) => b - a);
  return { opportunities, years, currentYear, loadedAt: now.toISOString(), source: "saved_app_opportunities", copiesCollapsed: rows.length - opportunities.length };
}

export function pipelineTotals(rows, key = "amount") {
  let cents = 0;
  let unknownCount = 0;
  for (const row of rows) {
    const amount = pipelineAmount(row[key]);
    if (amount === null) unknownCount++;
    else cents += Math.round(amount * 100);
  }
  return { count: rows.length, knownAmount: Number.isSafeInteger(cents) ? cents / 100 : null, unknownCount };
}

export function selectPipelineRows(rows, { year, view = "active", search = "", owner = "all", stage = "all", status = "all", sort = "expected" }) {
  const query = text(search).toLowerCase();
  return rows.filter((row) => {
    if (view === "undated") {
      if (row.fiscalYear !== null) return false;
    } else if (row.fiscalYear === null || (year !== "all" && row.fiscalYear !== Number(year)) ||
      (view === "active" ? row.status !== "Active" : row.status === "Active")) return false;
    return (owner === "all" || row.fundraisers.some((user) => user.id === owner)) &&
      (stage === "all" || row.stage === stage) && (status === "all" || row.status === status) &&
      (!query || [row.constituentName, row.constituentId, row.title, ...row.fundraisers.map((user) => user.name)].join(" ").toLowerCase().includes(query));
  }).sort((a, b) => {
    if (sort === "amount") {
      if (a.amount === null || b.amount === null) return (a.amount === null ? 1 : 0) - (b.amount === null ? 1 : 0) || a.id.localeCompare(b.id);
      if (a.amount !== b.amount) return b.amount - a.amount;
    }
    if (sort === "expected") {
      const compared = (a.expectedDate || a.closedDate || "9999").localeCompare(b.expectedDate || b.closedDate || "9999");
      if (compared) return compared;
    }
    return a.constituentName.localeCompare(b.constituentName) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
