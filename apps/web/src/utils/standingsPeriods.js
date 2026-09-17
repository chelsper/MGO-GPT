import { ORGANIZATION_REPORTING_POLICY } from "./organizationRuntimePolicy";

const dayString = (date) => date.toISOString().slice(0, 10);

export function getStandingsPeriods(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORGANIZATION_REPORTING_POLICY.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  const year = part("year"), month = part("month"), day = part("day");
  const asOf = new Date(Date.UTC(year, month - 1, day));
  const startMonth = ORGANIZATION_REPORTING_POLICY.fiscalYearStartMonth;
  const startYear = month >= startMonth ? year : year - 1;
  const fiscalWindow = (year) => ({
    label: `FY${String(startMonth === 1 ? year : year + 1).slice(-2)}`,
    startsOn: dayString(new Date(Date.UTC(year, startMonth - 1, 1))),
    endsOn: dayString(new Date(Date.UTC(year + 1, startMonth - 1, 0))),
  });
  const currentFY = fiscalWindow(startYear), priorFY = fiscalWindow(startYear - 1);
  // Match calendar cutoffs, clamping February 29 to February 28 in a non-leap year.
  const priorDay = Math.min(day, new Date(Date.UTC(year - 1, month, 0)).getUTCDate());
  const monday = new Date(asOf);
  monday.setUTCDate(day - (asOf.getUTCDay() + 6) % 7);
  const weekEnd = new Date(monday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 1);
  const weekStart = new Date(monday);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return {
    timeZone: ORGANIZATION_REPORTING_POLICY.timeZone,
    asOf: dayString(asOf),
    fiscalYear: currentFY,
    actionFiscalYears: [currentFY, priorFY],
    current: { ...currentFY, endsOn: dayString(asOf) },
    prior: { ...priorFY, endsOn: dayString(new Date(Date.UTC(year - 1, month - 1, priorDay))) },
    week: { label: "Last completed week", startsOn: dayString(weekStart), endsOn: dayString(weekEnd) },
  };
}

export function isInStandingsPeriod(value, period) {
  // NXT gift/action dates are calendar dates, not the time a record was synced.
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && dayString(parsed) === date && date >= period.startsOn && date <= period.endsOn;
}
