export const TRACKER_VERSION = "fund-splits-v1";
export const isSystemId = (value) => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value);
export const moneyCents = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(value * 100 - cents) < 0.00001 ? cents : null;
};
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function newFundraisingTracker(key, aTrain = false) {
  return { key, title: aTrain ? "The A-Train Campaign" : "Fundraising campaign", layout: "fundraising_tracker", width: "full",
    goal: aTrain ? 250000 : 100000, milestone: aTrain ? 187500 : null, display: "both",
    funds: [], period: "all_time", startDate: "", endDate: "", rows: [], columns: [], values: [] };
}

export function validateFundraisingTracker(panel) {
  if (moneyCents(panel.goal) === null || panel.goal <= 0) return "Enter a positive campaign goal with at most two decimal places.";
  if (panel.milestone !== null && (moneyCents(panel.milestone) === null || panel.milestone <= 0 || panel.milestone >= panel.goal))
    return "The milestone must be greater than zero and less than the campaign goal.";
  if (!["committed", "received", "both"].includes(panel.display)) return "Choose committed, received, or both.";
  if (!Array.isArray(panel.funds) || panel.funds.length > 25 || panel.funds.some((f) => !isSystemId(f?.id) ||
      typeof f.name !== "string" || !f.name.trim() || f.name.length > 250) || new Set(panel.funds.map((f) => f.id)).size !== panel.funds.length)
    return "Choose up to 25 distinct NXT funds.";
  if (!["all_time", "date_range"].includes(panel.period)) return "Choose all-time giving or a date range.";
  if (panel.period === "date_range" && (!validDate(panel.startDate) || !validDate(panel.endDate) || panel.startDate > panel.endDate))
    return "Enter a valid giving date range.";
  if (["rows", "columns", "values"].some((key) => !Array.isArray(panel[key]) || panel[key].length))
    return "Fundraising trackers use fund totals, not manual rows or values.";
  return "";
}

export function normalizeFundraisingTracker(panel) {
  return { key: panel.key, title: panel.title.trim(), layout: "fundraising_tracker", width: panel.width,
    goal: panel.goal, milestone: panel.milestone, display: panel.display,
    funds: panel.funds.map(({ id, name }) => ({ id, name: name.trim() })), period: panel.period,
    startDate: panel.period === "date_range" ? panel.startDate : "", endDate: panel.period === "date_range" ? panel.endDate : "",
    rows: [], columns: [], values: [] };
}

// Goal, milestone, display, title and fund labels do not change the source totals.
export const trackerFingerprint = (panel) => JSON.stringify([TRACKER_VERSION, panel.funds.map((f) => f.id).sort(),
  panel.period, panel.period === "date_range" ? panel.startDate : "", panel.period === "date_range" ? panel.endDate : ""]);

export function presentFundraisingTracker(panel, cached) {
  const saved = cached?.fingerprint === trackerFingerprint(panel) ? cached : null;
  const known = Number.isSafeInteger(saved?.committedCents) && Number.isSafeInteger(saved?.receivedCents) && !!saved?.refreshedAt;
  return { key: panel.key, fingerprint: trackerFingerprint(panel), committedCents: known ? saved.committedCents : null,
    receivedCents: known ? saved.receivedCents : null, refreshedAt: known ? saved.refreshedAt : null,
    status: !panel.funds.length ? "unconfigured" : known ? saved?.error ? "stale" : "ready" : "missing",
    error: saved?.error || null, pending: !!saved?.pending, excludedCount: known ? saved.excludedCount || 0 : 0 };
}

export const TRACKER_BASIS = "Committed includes outright gifts, recurring payments, realized planned-gift revenue, pledges and matching pledges; pledge payments are not counted again. Received includes outright gifts and actual payments, not unpaid pledges. Non-cash gifts use their recorded gift value. Unrealized planned gifts, recurring gift schedules and write-offs are excluded; committed is a gross commitment total, not a net pledge balance. These two views overlap and must not be added together.";
