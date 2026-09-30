import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "test@example.org" } })) }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn(async () => ({ workspaceUser: { id: 7 }, sessionUser: { id: 7, role: "mgo" } })) }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  isAuthorizedReportRefreshRequest: request => request.headers.get("authorization") === "Bearer test-secret",
  getReportRefreshUser: vi.fn(async () => ({ id: 99, role: "admin" })),
}));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/portfolioMaintenanceStore", () => ({ claimMaintenanceGate: vi.fn(), releaseMaintenanceGate: vi.fn() }));
import sql from "@/app/api/utils/sql";
import { claimMaintenanceGate, releaseMaintenanceGate } from "@/app/api/utils/portfolioMaintenanceStore";
import { POST } from "./route";
let job;
const gate = { origin: "https://example.org", jobId: "1", token: "00000000-0000-4000-8000-000000000001" };
const request = (scheduled = true, body = {}, origin = "https://example.org") => new Request(`${origin}/api/blackbaud/portfolio-refresh?workspaceUserId=7`, {
  method: "POST", headers: { "content-type": "application/json", ...(scheduled ? { authorization: "Bearer test-secret" } : {}) },
  body: JSON.stringify({ action: "process", jobId: "1", ...body }),
});
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED", "true");
  vi.stubEnv("PORTFOLIO_MAINTENANCE_ORIGIN", "https://example.org");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-30T16:00:00Z"));
  job = { id: 1, workspace_user_id: 7, mode: "nightly", status: "queued", batch_size: 10, concurrency: 2 };
  claimMaintenanceGate.mockReset().mockResolvedValue(gate);
  releaseMaintenanceGate.mockReset().mockResolvedValue();
  sql.mockReset().mockImplementation(async parts => {
    const query = parts.join(" ");
    if (query.includes("SELECT * FROM users")) return [{ id: 7 }];
    if (query.includes("SELECT * FROM portfolio_refresh_jobs")) return [job];
    if (query.includes("WITH next_items")) return [{ id: 24, constituent_id: "123", position: 23 }];
    if (query.includes("WITH counts")) return [{ ...job, status: "queued" }];
    return [];
  });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ quotaPaused: true, retryAfterMs: 600000 }, { status: 503 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
it("continues exactly one checkpoint under the durable lease and passes its budget context", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(claimMaintenanceGate).toHaveBeenCalledWith("https://example.org", 1);
  const claim = sql.mock.calls.find(([parts]) => parts.join(" ").includes("WITH next_items"));
  expect(claim.slice(1)).toEqual([1, 1]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1].headers["x-mgogpt-portfolio-continuation"]).toBe(gate.token);
  expect(sql.mock.calls.some(([parts]) => parts.join(" ").includes("UPDATE portfolio_constituent_snapshots"))).toBe(false);
  expect(releaseMaintenanceGate).toHaveBeenCalledWith(gate);
});
it("prevents old browser tabs from processing server-owned nightly jobs", async () => {
  expect(await (await POST(request(false))).json()).toMatchObject({ serverManaged: true });
  expect(fetch).not.toHaveBeenCalled(); expect(claimMaintenanceGate).not.toHaveBeenCalled();
});
it("does no provider work when busy, cooling down, or out of budget", async () => {
  claimMaintenanceGate.mockResolvedValue(null);
  expect(await (await POST(request())).json()).toMatchObject({ deferred: true });
  expect(fetch).not.toHaveBeenCalled(); expect(releaseMaintenanceGate).not.toHaveBeenCalled();
});
it.each(["cancelled", "paused"])("respects a %s job before claiming a continuation lease", async status => {
  job.status = status; job.paused_until = "2026-09-30T18:00:00Z";
  await POST(request());
  expect(claimMaintenanceGate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("rejects forged continuation mode and incorrect origins without NXT reads", async () => {
  expect((await POST(request(true, { backgroundContinuation: true }, "https://wrong.example.org"))).status).toBe(409);
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await POST(request(true, { backgroundContinuation: true }))).status).toBe(409);
  expect(fetch).not.toHaveBeenCalled();
});
it("releases its gate on an unexpected local batch failure", async () => {
  sql.mockImplementation(async parts => {
    const query = parts.join(" ");
    if (query.includes("SELECT * FROM users")) return [{ id: 7 }];
    if (query.includes("SELECT * FROM portfolio_refresh_jobs")) return [job];
    throw Error("fixture database failure");
  });
  await expect(POST(request())).rejects.toThrow("fixture database failure");
  expect(releaseMaintenanceGate).toHaveBeenCalledWith(gate);
  expect(fetch).not.toHaveBeenCalled();
});
