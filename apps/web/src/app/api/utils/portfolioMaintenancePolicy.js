// Keep diagnostic arithmetic tied to the worker limits. Cron cadence is checked
// against the effective apps/web/vercel.json in the policy regression test.
export const PORTFOLIO_REFRESH_HOURS = Object.freeze([1, 2, 3, 4, 5, 6]);
export const PORTFOLIO_BATCH_SIZE = 10;
export const PORTFOLIO_CRON_MINUTES = 10;
export const ACTIVITY_CRON_MINUTES = 10;

export function normalNightSlots(minutes) {
  return PORTFOLIO_REFRESH_HOURS.length * 60 / minutes;
}
