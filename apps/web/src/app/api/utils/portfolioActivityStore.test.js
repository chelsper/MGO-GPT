import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("./sql", () => ({ default: sql }));
import { claimActivityGate, deferActivityRow, dueActivityRows, readActivitySeed, releaseActivityGate, requestPortfolioActionRefresh,
  reserveActivityCall, saveActivityResult, seedActivityQueue } from "./portfolioActivityStore";
import { prospectActivityCacheKey } from "./prospectActivityCacheKey";

const row = { workspace_user_id: 7, origin: "https://example.com", constituent_id: "100", kind: "action" };
const gate = { origin: row.origin, token: "lease" };
const query = () => sql.mock.calls.at(-1)[0].join("?");
beforeEach(() => sql.mockReset().mockResolvedValue([]));
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
});
it("selects only allowlisted, active, currently assigned constituents, missing first", async () => {
  await seedActivityQueue(["7"], row.origin);
  expect(query()).toContain("u.active = TRUE");
  expect(query()).toContain("ON CONFLICT");
  await dueActivityRows(["7"], row.origin);
  expect(query()).toContain("person ->> 'constituentId' = s.constituent_id");
  expect(query()).toContain("ORDER BY (s.checked_at IS NOT NULL)");
  expect(query()).toContain("LIMIT 20");
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
  await requestPortfolioActionRefresh({ origin: row.origin, constituentId: "100" });
  expect(query()).toContain("requested_at = NOW()");
  expect(query()).not.toContain("activity_date =");
  expect(sql.mock.calls[0].slice(1)).toEqual([row.origin, "100", ["7"]]);
});
