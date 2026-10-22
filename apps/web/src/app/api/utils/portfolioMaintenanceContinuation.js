import { PORTFOLIO_REFRESH_HOURS } from "./portfolioMaintenancePolicy";

export const MAINTENANCE_DAYTIME_CALLS = 360;
export const MAINTENANCE_NIGHT_CALLS = 2160;
export const MAINTENANCE_BATCH_CALLS = 60;
export const MAINTENANCE_DAYTIME_ITEMS = 1;
export const MAINTENANCE_LEASE_SECONDS = 240;
export const MAINTENANCE_REQUEST_MS = 180000;

export function maintenanceOrigin(env = process.env) {
  try {
    const value = env.PORTFOLIO_MAINTENANCE_ORIGIN;
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value ? value : null;
  } catch { return null; }
}

export function maintenanceContinuationEnabled(env = process.env) {
  return env.VERCEL_ENV === "production" &&
    env.PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED === "true" && !!maintenanceOrigin(env);
}

export function isPortfolioOvernight(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23",
  }).format(now));
  return PORTFOLIO_REFRESH_HOURS.includes(hour);
}
