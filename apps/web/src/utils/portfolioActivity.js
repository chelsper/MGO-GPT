import { calendarDate } from "./prospectActivity";
import { getStandingsPeriods } from "./standingsPeriods";

// Dates describe the last successful activity check, not a live NXT assertion.
export function savedPortfolioActivityDate(value, now = new Date()) {
  if (!value || typeof value.date !== "string" || typeof value.checkedAt !== "string") return null;
  const date = calendarDate(value.date);
  const checkedAt = Date.parse(value.checkedAt);
  if (!date || !calendarDate(value.checkedAt) || !Number.isFinite(checkedAt) || checkedAt > now.getTime()) return null;
  if (date > getStandingsPeriods(new Date(checkedAt)).asOf || date > getStandingsPeriods(now).asOf) return null;
  return { date, checkedAt: new Date(checkedAt).toISOString() };
}

// Optional details never substitute for a verified date or imply a zero amount.
export function portfolioActivityFields(value, kind) {
  if (kind === "gift" && typeof value?.amount === "number" && Number.isFinite(value.amount)) {
    return { amount: value.amount };
  }
  if (kind === "action" && typeof value?.summary === "string") {
    const summary = value.summary.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 2000);
    if (summary) return { summary };
  }
  return {};
}

export function portfolioActivityDetailsEnvelope(entry, kind) {
  const saved = savedPortfolioActivityDate(entry);
  const fields = portfolioActivityFields(entry, kind);
  if (!saved || typeof entry.id !== "string" || !entry.id.trim() || !Object.keys(fields).length) return null;
  return { version: 1, kind, id: entry.id, ...saved, ...fields };
}

export function savedPortfolioActivity(value, kind, { now = new Date(), requireBoundDetails = false } = {}) {
  const saved = savedPortfolioActivityDate(value, now);
  if (!saved || typeof value.id !== "string" || !value.id.trim()) return null;
  let details = value;
  if (requireBoundDetails) {
    details = value.details;
    // Older workers can update the date without this column during a rollback.
    // Never attach the prior record's details to a newer activity check.
    if (details?.version !== 1 || details.kind !== kind || details.id !== value.id ||
        details.date !== saved.date || Date.parse(details.checkedAt) !== Date.parse(saved.checkedAt)) details = null;
  }
  return { ...saved, ...portfolioActivityFields(details, kind) };
}
