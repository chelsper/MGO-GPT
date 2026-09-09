import { getStandingsPeriods } from "./standingsPeriods";

export function calendarDate(value) {
  if (value instanceof Date && !Number.isFinite(value.getTime())) return null;
  const text = value instanceof Date ? value.toISOString() : String(value || "");
  const day = text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function formatCalendarDate(value, options = { month: "long", day: "numeric", year: "numeric" }) {
  const day = calendarDate(value);
  return day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" }) : "";
}

const normalize = (value) => String(value || "").trim().toLowerCase()
  .replace(/[\u2013\u2014-]/g, " ").replace(/\s+/g, " ");

export function closedOpportunityKind(opportunity = {}) {
  const labels = [opportunity.current_stage, opportunity.opportunity_status, opportunity.status].map(normalize);
  if (labels.some((label) => ["withdrawn", "closed withdrawn"].includes(label))) return "Withdrawn";
  if (labels.some((label) => ["declined", "closed declined"].includes(label))) return "Declined";
  if (labels.some((label) => ["funded", "closed gift secured"].includes(label)) || Number(opportunity.closed_amount || 0) > 0) return "Funded";
  return null;
}

export function partitionOpportunities(opportunities, now = new Date()) {
  const today = getStandingsPeriods(now).asOf;
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  const cutoffDay = calendarDate(cutoff);
  const result = { active: [], recentClosed: [], olderClosed: [] };
  for (const opportunity of opportunities) {
    if (!closedOpportunityKind(opportunity)) result.active.push(opportunity);
    else {
      // A sync timestamp is not a closing date. Keep undated history accessible.
      const closed = calendarDate(opportunity.close_date);
      result[closed && closed > cutoffDay && closed <= today ? "recentClosed" : "olderClosed"].push(opportunity);
    }
  }
  for (const key of ["recentClosed", "olderClosed"]) {
    result[key].sort((a, b) => (calendarDate(b.close_date) || "").localeCompare(calendarDate(a.close_date) || ""));
  }
  return result;
}

export function canRollOpportunityForward(opportunity, now = new Date()) {
  if (!opportunity || closedOpportunityKind(opportunity)) return false;
  const stage = normalize(opportunity.current_stage || opportunity.status);
  const expected = calendarDate(opportunity.expected_date);
  return ["identification", "cultivation", "solicitation", "solicitation verbal"].includes(stage) &&
    Boolean(expected && expected < getStandingsPeriods(now).fiscalYear.startsOn);
}

export function latestDatedAction(actions, now = new Date()) {
  const today = getStandingsPeriods(now).asOf;
  return actions.filter((action) => calendarDate(action.date) && calendarDate(action.date) <= today)
    .sort((a, b) => calendarDate(b.date).localeCompare(calendarDate(a.date)) || String(b.id).localeCompare(String(a.id)))[0] || null;
}
