// Release-managed reporting contract. Stored profile preferences cannot activate
// a different calendar, currency, or query against existing snapshots/checkpoints.
export const ORGANIZATION_REPORTING_POLICY = Object.freeze({
  version: "ju-reporting-v1",
  timeZone: "America/New_York",
  fiscalYearStartMonth: 7,
  currencyCode: "USD",
  pledgeQuery: Object.freeze({ id: "12033", type: "Gift", systemIdHeader: "QRECID" }),
});

export const GUARDED_PROFILE_FIELDS = Object.freeze({
  fiscalYearStartMonth: "Fiscal-year start",
  timeZone: "Time zone",
  currencyCode: "Currency",
  dateFormat: "Date format",
});

export function reportingSettingsChangeError(previous, next) {
  const changed = Object.entries(GUARDED_PROFILE_FIELDS)
    .filter(([key]) => previous[key] !== next[key]).map(([, label]) => label);
  return changed.length
    ? `${changed.join(", ")} changes require a reviewed reporting migration. No settings were saved; historical reports and query boundaries are unchanged.`
    : null;
}
