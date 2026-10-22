import { calendarDate } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const ALLOWED_STATUSES = new Set([
  "Identification", "Cultivation", "Solicitation", "Solicitation - Verbal",
]);

export function hasLegacyOpportunityPurpose(opportunity) {
  return String(opportunity?.purpose || "").trim().toLowerCase() === "future. made. campaign";
}

export function opportunityCreatedOn(opportunity) {
  const value = opportunity?.date_added;
  if (typeof value !== "string" || !calendarDate(value)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Creation is an instant, unlike the expected gift's calendar date. Apply
  // the organization's time zone at the fiscal-year boundary, not UTC.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? getStandingsPeriods(date).asOf : null;
}

export function isOpportunityEligibleForImport(opportunity, now = new Date()) {
  if (!opportunity?.id || !opportunity.constituent_id || opportunity.inactive ||
      !ALLOWED_STATUSES.has(opportunity.status) || !calendarDate(opportunity.expected_date)) return false;
  if (hasLegacyOpportunityPurpose(opportunity)) return true;
  const createdOn = opportunityCreatedOn(opportunity);
  return Boolean(createdOn && createdOn >= getStandingsPeriods(now).fiscalYear.startsOn);
}
