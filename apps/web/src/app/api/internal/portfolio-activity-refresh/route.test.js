import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ schema: vi.fn(), user: vi.fn(), refresh: vi.fn(), sql: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/reportRefresh", () => ({ getReportRefreshUser: mocks.user }));
vi.mock("@/app/api/utils/portfolioActivityRefresh", () => ({ refreshPortfolioActivity: mocks.refresh }));
import { GET } from "./route";
const request = (force = false, secret = "test") => new Request(`https://worker.example.com/api/internal/portfolio-activity-refresh${force ? "?force=1" : ""}`, {
  headers: { authorization: `Bearer ${secret}` },
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T06:00:00Z"));
  vi.stubEnv("CRON_SECRET", "test");
  vi.stubEnv("PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "7");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "allowlist");
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ORIGIN", "https://www.jumgogpt.app");
  vi.stubEnv("VERCEL_ENV", "production");
  mocks.schema.mockReset().mockResolvedValue();
  mocks.user.mockReset().mockResolvedValue({ id: 99, role: "admin" });
  mocks.refresh.mockReset().mockResolvedValue({ status: "complete", calls: 2 });
  mocks.sql.mockReset().mockResolvedValue([{ id: 7, active: true, role: "mgo", has_portfolio: true }]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("rejects public requests before schema or API work", async () => {
  expect((await GET(request(true, "wrong"))).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("uses the explicit pilot and canonical origin, not the incoming host", async () => {
  expect((await GET(request())).status).toBe(200);
  expect(mocks.refresh).toHaveBeenCalledWith({ workspaceIds: ["7"], origin: "https://www.jumgogpt.app", refreshUser: { id: 99, role: "admin" } });
});
it.each([["PORTFOLIO_ACTIVITY_WORKSPACE_IDS", ""], ["PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "all"], ["PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "disabled"], ["PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "all"], ["PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "7,typo"], ["PORTFOLIO_ACTIVITY_ORIGIN", ""], ["VERCEL_ENV", "preview"]])("fails closed when %s is %s", async (key, value) => {
  vi.stubEnv(key, value);
  expect(await (await GET(request(true))).json()).toEqual({ status: "disabled" });
  expect(mocks.schema).not.toHaveBeenCalled();
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("stays out of daytime traffic unless an authorized operator runs a bounded pilot batch", async () => {
  vi.setSystemTime(new Date("2026-09-15T17:00:00Z"));
  expect(await (await GET(request())).json()).toEqual({ status: "outside_window" });
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.sql).not.toHaveBeenCalled();
  await GET(request(true));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it("discovers automatic enrollment anew without changing the canonical origin or worker", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  await GET(request());
  mocks.sql.mockResolvedValue([{ id: 7, active: true, role: "mgo" }, { id: 12, active: true, role: "executive,mgo" }]);
  await GET(request());
  expect(mocks.refresh).toHaveBeenLastCalledWith({ workspaceIds: ["7", "12"], origin: "https://www.jumgogpt.app", refreshUser: { id: 99, role: "admin" } });
});
it.each([null, { id: 99, role: "mgo" }, { id: 99, role: "admin", active: false }])("requires an authorized scheduled account before automatic discovery (%j)", async user => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  mocks.user.mockResolvedValue(user);
  expect(await (await GET(request())).json()).toEqual({ status: "disabled" });
  expect(mocks.sql).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("idles without a worker or NXT calls when no accounts are eligible", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  mocks.sql.mockResolvedValue([]);
  expect(await (await GET(request())).json()).toEqual({ status: "idle", reason: "no_enrolled_workspaces" });
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("pauses rather than silently reverting to the old pilot when discovery fails", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  mocks.sql.mockRejectedValue(new Error("private database details"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "paused", reason: "refresh_unavailable" });
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("returns a safe paused response on a database failure", async () => {
  mocks.schema.mockRejectedValue(new Error("private details"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private details");
});
