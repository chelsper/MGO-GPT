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
