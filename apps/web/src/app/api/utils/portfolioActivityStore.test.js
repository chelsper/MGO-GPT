import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("./sql", () => ({ default: sql }));
import { claimActivityGate, deferActivityRow, dueActivityRows, readActivitySeed, releaseActivityGate, requestPortfolioActionRefresh,
  reserveActivityCall, saveActivityResult, seedActivityQueue } from "./portfolioActivityStore";
import { prospectActivityCacheKey } from "./prospectActivityCacheKey";
import { activityNextCheckAt } from "./portfolioActivitySchedule";

const row = { workspace_user_id: 7, origin: "https://example.com", constituent_id: "100", kind: "action" };
const gate = { origin: row.origin, token: "lease" };
const query = () => sql.mock.calls.at(-1)[0].join("?");
beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "allowlist");
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "");
  vi.stubEnv("VERCEL_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());
it("atomically claims one origin-wide lease with a bounded expiry", async () => {
  sql.mockResolvedValue([{ lease_token: "lease" }]);
  expect((await claimActivityGate(row.origin)).token).toBeTruthy();
  expect(query()).toContain("ON CONFLICT (origin)");
  expect(query()).toContain("next_allowed_at <= NOW()");
  expect(query()).toContain("INTERVAL '150 seconds'");
  sql.mockResolvedValue([]);
  expect(await claimActivityGate(row.origin)).toBeNull();
});
it("persists the shared daily budget, including calls that fail", async () => {
  expect(await reserveActivityCall(gate)).toBe(false);
  expect(query()).toContain("call_count + 1");
  expect(query()).toContain("lease_until > NOW()");
  expect(sql.mock.calls[0].slice(1)).toContain(360);
});
it("only the owning lease can release the gate or save results", async () => {
  await releaseActivityGate(gate, 300000);
  expect(query()).toContain("lease_token = ?");
  await saveActivityResult(row, { id: "a", date: "2020-01-01", checkedAt: "2026-09-15T12:00:00Z" }, 99, gate);
  expect(query()).toContain("checked_at <= ?::timestamptz");
  expect(query()).toContain("requested_at > ?::timestamptz");
  expect(query()).toContain("lease_token = ? AND lease_until > NOW()");
  expect(query()).not.toContain("UPDATE users");
});
it("preserves successful dates and timestamps on failures or incomplete pages", async () => {
  await deferActivityRow(row, { error: "unverified_response", delayMs: 3600000 }, gate);
  expect(query()).not.toContain("checked_at =");
  expect(query()).not.toContain("activity_date =");
  expect(query()).not.toContain("activity_details =");
  expect(query()).toContain("last_attempt_at = NOW()");
});
it("atomically saves bound details and clears them for empty or date-only results", async () => {
  const entry = { id: "a", date: "2020-01-01", checkedAt: "2026-09-15T12:00:00Z", summary: "Call donor", notes: "omit" };
  await saveActivityResult(row, entry, 99, gate);
  expect(query()).toContain("activity_details = ?::jsonb");
  expect(JSON.parse(sql.mock.calls.at(-1)[3])).toEqual({ version: 1, kind: "action", id: "a", date: "2020-01-01", checkedAt: "2026-09-15T12:00:00.000Z", summary: "Call donor" });
  for (const next of [{ id: "new", date: "2026-09-14" }, { id: null, date: null }]) {
    await saveActivityResult(row, { ...next, checkedAt: entry.checkedAt }, 99, gate);
    expect(sql.mock.calls.at(-1)[3]).toBe("null");
  }
});
it("selects only allowlisted, active, currently assigned constituents using bounded fair queues", async () => {
  await seedActivityQueue(["7"], row.origin);
  expect(query()).toContain("u.active = TRUE");
  expect(query()).toContain("ON CONFLICT");
  await dueActivityRows(["7"], row.origin);
  expect(query()).toContain("person ->> 'constituentId' = s.constituent_id");
  expect(query()).toContain("s.checked_at IS NULL OR s.requested_at > s.checked_at");
  expect(query()).toContain("PARTITION BY e.queue_lane, e.workspace_user_id");
  expect(query()).toContain("MAX(last_attempt_at)");
  expect(query()).toContain("last_served NULLS FIRST");
  expect(query()).toContain("lane_rank <= ?");
  expect(sql.mock.calls.at(-1).at(-1)).toBe(20);
});
it("staggering does not postpone a write hint newer than the successful read", async () => {
  const entry = { id: "a", date: "2020-01-01", checkedAt: "2026-09-18T10:00:00Z" };
  await saveActivityResult(row, entry, 99, gate);
  expect(query()).toContain("last_attempt_at = NOW()");
  expect(query()).toContain("CASE WHEN requested_at > ?::timestamptz");
  expect(query()).toContain("THEN NOW() ELSE ?::timestamptz END");
  expect(sql.mock.calls.at(-1)).toContain(activityNextCheckAt(row, entry.checkedAt));
});
it("never reuses another connection's raw activity cache", async () => {
  await readActivitySeed(row, 99);
  expect(sql.mock.calls[0].slice(1)).toEqual([7, 99, "100", prospectActivityCacheKey(row.origin, "100", "action")]);
});
it("action writes only request a check for enabled portfolios in the same origin", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "");
  await requestPortfolioActionRefresh({ origin: row.origin, constituentId: "100" });
  expect(sql).not.toHaveBeenCalled();
  vi.stubEnv("PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "7");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ORIGIN", row.origin);
  await requestPortfolioActionRefresh({ origin: "https://other.example.com", constituentId: "100" });
  expect(sql).not.toHaveBeenCalled();
  sql.mockResolvedValueOnce([{ id: 7, role: "mgo", active: true }]);
  await requestPortfolioActionRefresh({ origin: row.origin, constituentId: "100" });
  expect(query()).toContain("requested_at = NOW()");
  expect(query()).not.toContain("activity_date =");
  expect(sql.mock.calls.at(-1).slice(1)).toEqual([row.origin, "100", ["7"]]);
});
it("requests action checks for newly enrolled MGOs while excluding inactive and opted-out accounts", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ORIGIN", row.origin);
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "7");
  sql.mockResolvedValueOnce([{ id: 7, role: "mgo", active: true }, { id: 12, role: "mgo", active: true }, { id: 13, role: "mgo", active: false }]);
  await requestPortfolioActionRefresh({ origin: row.origin, constituentId: "100" });
  expect(sql.mock.calls.at(-1).slice(1)).toEqual([row.origin, "100", ["12"]]);
  expect(query()).not.toContain("activity_date =");
});
it("does not enqueue production action hints from preview", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ORIGIN", row.origin);
  vi.stubEnv("VERCEL_ENV", "preview");
  await requestPortfolioActionRefresh({ origin: row.origin, constituentId: "100" });
  expect(sql).not.toHaveBeenCalled();
});
