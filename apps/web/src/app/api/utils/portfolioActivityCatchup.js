import { PORTFOLIO_REFRESH_HOURS } from "./portfolioMaintenancePolicy";

export const ACTIVITY_CATCHUP_START_HOUR = 7;
export const ACTIVITY_CATCHUP_END_HOUR = 9;
export const ACTIVITY_CATCHUP_DAILY_CALLS = 72;

// A deployment opt-in, not a user-page side effect. Existing origin/enrollment
// checks and the total daily call budget still apply independently.
export function activityCatchupEnabled() {
  return process.env.VERCEL_ENV === "production" && process.env.PORTFOLIO_ACTIVITY_CATCHUP_ENABLED === "true";
}

export function activityRunWindow(now = new Date(), force = false) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", hour12: false,
  }).format(now));
  if (PORTFOLIO_REFRESH_HOURS.includes(hour)) return "overnight";
  if (activityCatchupEnabled() && hour >= ACTIVITY_CATCHUP_START_HOUR && hour < ACTIVITY_CATCHUP_END_HOUR) return "catchup";
  return force ? "manual" : null;
}
