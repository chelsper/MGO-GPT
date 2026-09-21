import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activityCatchupEnabled, activityRunWindow } from "./portfolioActivityCatchup";
beforeEach(() => { vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("PORTFOLIO_ACTIVITY_CATCHUP_ENABLED", ""); });
afterEach(() => vi.unstubAllEnvs());

it.each(["", "false", "TRUE", "1", "true "])("fails closed without the exact opt-in (%s)", flag => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_CATCHUP_ENABLED", flag);
  expect(activityCatchupEnabled()).toBe(false);
  expect(activityRunWindow(new Date("2026-09-21T11:05:00Z"))).toBeNull();
});
it.each(["preview", "development", ""])("never enables catch-up in %s", env => {
  vi.stubEnv("VERCEL_ENV", env); vi.stubEnv("PORTFOLIO_ACTIVITY_CATCHUP_ENABLED", "true");
  expect(activityCatchupEnabled()).toBe(false);
});
it.each([
  ["2026-09-21T04:59:59Z", null], ["2026-09-21T05:00:00Z", "overnight"],
  ["2026-09-21T10:59:59Z", "overnight"], ["2026-09-21T11:00:00Z", "catchup"],
  ["2026-09-21T12:59:59Z", "catchup"], ["2026-09-21T13:00:00Z", null],
  ["2026-11-01T11:59:59Z", "overnight"], ["2026-11-01T12:00:00Z", "catchup"],
  ["2026-11-01T14:00:00Z", null], ["2027-03-14T11:00:00Z", "catchup"],
  ["2027-03-14T13:00:00Z", null],
])("uses Eastern boundaries including daylight-saving transitions: %s", (date, expected) => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_CATCHUP_ENABLED", "true");
  expect(activityRunWindow(new Date(date))).toBe(expected);
});
it("preserves explicit operator batches but never bypasses catch-up classification", () => {
  expect(activityRunWindow(new Date("2026-09-21T17:00:00Z"), true)).toBe("manual");
  vi.stubEnv("PORTFOLIO_ACTIVITY_CATCHUP_ENABLED", "true");
  expect(activityRunWindow(new Date("2026-09-21T11:00:00Z"), true)).toBe("catchup");
});
