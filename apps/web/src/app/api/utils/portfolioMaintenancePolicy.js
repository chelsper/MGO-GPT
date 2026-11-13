// Keep diagnostic arithmetic tied to the worker limits. Cron cadence is checked
// against the effective apps/web/vercel.json in the policy regression test.
export const PORTFOLIO_REFRESH_HOURS = Object.freeze([1, 2, 3, 4, 5, 6]);
export const PORTFOLIO_BATCH_SIZE = 10;
// Safety ceiling for cheap overnight work; the durable API/time gates still decide how far it gets.
export const PORTFOLIO_OVERNIGHT_MAX_ITEMS = 30;
export const PORTFOLIO_ITEM_START_BUFFER_SECONDS = 15;
export const PORTFOLIO_CRON_MINUTES = 10;
export const ACTIVITY_CRON_MINUTES = 10;

export function normalNightSlots(minutes) {
  return PORTFOLIO_REFRESH_HOURS.length * 60 / minutes;
}
