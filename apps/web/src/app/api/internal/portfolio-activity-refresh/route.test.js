import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ schema: vi.fn(), user: vi.fn(), refresh: vi.fn() }));
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
  vi.stubEnv("PORTFOLIO_ACTIVITY_ORIGIN", "https://www.jumgogpt.app");
  vi.stubEnv("VERCEL_ENV", "production");
  mocks.schema.mockReset().mockResolvedValue();
  mocks.user.mockReset().mockResolvedValue({ id: 99, role: "admin" });
  mocks.refresh.mockReset().mockResolvedValue({ status: "complete", calls: 2 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("rejects public requests before schema or API work", async () => {
  expect((await GET(request(true, "wrong"))).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("uses the explicit pilot and canonical origin, not the incoming host", async () => {
  expect((await GET(request())).status).toBe(200);
  expect(mocks.refresh).toHaveBeenCalledWith({ workspaceIds: ["7"], origin: "https://www.jumgogpt.app", refreshUser: { id: 99, role: "admin" } });
});
it.each([["PORTFOLIO_ACTIVITY_WORKSPACE_IDS", ""], ["PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "all"], ["PORTFOLIO_ACTIVITY_ORIGIN", ""], ["VERCEL_ENV", "preview"]])("fails closed when %s is %s", async (key, value) => {
  vi.stubEnv(key, value);
  expect(await (await GET(request(true))).json()).toEqual({ status: "disabled" });
  expect(mocks.schema).not.toHaveBeenCalled();
});
it("stays out of daytime traffic unless an authorized operator runs a bounded pilot batch", async () => {
  vi.setSystemTime(new Date("2026-09-15T17:00:00Z"));
  expect(await (await GET(request())).json()).toEqual({ status: "outside_window" });
  expect(mocks.refresh).not.toHaveBeenCalled();
  await GET(request(true));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it("returns a safe paused response on a database failure", async () => {
  mocks.schema.mockRejectedValue(new Error("private details"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private details");
});
