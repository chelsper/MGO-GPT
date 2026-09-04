const dayString = (date) => date.toISOString().slice(0, 10);

export function getStandingsPeriods(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  const year = part("year"), month = part("month"), day = part("day");
  const asOf = new Date(Date.UTC(year, month - 1, day));
  const startYear = month >= 7 ? year : year - 1;
  // Match calendar cutoffs, clamping February 29 to February 28 in a non-leap year.
  const priorDay = Math.min(day, new Date(Date.UTC(year - 1, month, 0)).getUTCDate());
  const monday = new Date(asOf);
  monday.setUTCDate(day - (asOf.getUTCDay() + 6) % 7);
  const weekEnd = new Date(monday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 1);
  const weekStart = new Date(monday);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return {
    timeZone: "America/New_York",
    asOf: dayString(asOf),
    fiscalYear: { label: `FY${String(startYear + 1).slice(-2)}`, startsOn: `${startYear}-07-01`, endsOn: `${startYear + 1}-06-30` },
    current: { label: `FY${String(startYear + 1).slice(-2)}`, startsOn: `${startYear}-07-01`, endsOn: dayString(asOf) },
    prior: { label: `FY${String(startYear).slice(-2)}`, startsOn: `${startYear - 1}-07-01`, endsOn: dayString(new Date(Date.UTC(year - 1, month - 1, priorDay))) },
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
