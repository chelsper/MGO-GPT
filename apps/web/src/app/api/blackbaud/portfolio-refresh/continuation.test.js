import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "test@example.org" } })) }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn(async () => ({ workspaceUser: { id: 7 }, sessionUser: { id: 7, role: "mgo" } })) }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  isAuthorizedReportRefreshRequest: request => request.headers.get("authorization") === "Bearer test-secret",
  getReportRefreshUser: vi.fn(async () => ({ id: 99, role: "admin" })),
}));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/portfolioMaintenanceStore", () => ({ claimMaintenanceGate: vi.fn(), canStartMaintenanceItem: vi.fn(), releaseMaintenanceGate: vi.fn() }));
import sql from "@/app/api/utils/sql";
import { claimMaintenanceGate, canStartMaintenanceItem, releaseMaintenanceGate } from "@/app/api/utils/portfolioMaintenanceStore";
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
  canStartMaintenanceItem.mockReset().mockResolvedValue(true);
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
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ job: { batchSize: 1, concurrency: 1 } });
  expect(claimMaintenanceGate).toHaveBeenCalledWith("https://example.org", 1);
  const claim = sql.mock.calls.find(([parts]) => parts.join(" ").includes("WITH next_items"));
  expect(claim.slice(1)).toEqual([1, 1]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1].headers["x-mgogpt-portfolio-continuation"]).toBe(gate.token);
  expect(sql.mock.calls.some(([parts]) => parts.join(" ").includes("UPDATE portfolio_constituent_snapshots"))).toBe(false);
  expect(releaseMaintenanceGate).toHaveBeenCalledWith(gate);
  expect(canStartMaintenanceItem).not.toHaveBeenCalled();
});
it("allows a larger overnight ceiling only under the durable gate", async () => {
  vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ job: { batchSize: 30, concurrency: 1 } });
  expect(claimMaintenanceGate).toHaveBeenCalledWith("https://example.org", 1);
  const claim = sql.mock.calls.find(([parts]) => parts.join(" ").includes("WITH next_items"));
  expect(claim.slice(1)).toEqual([1, 30]);
  expect(fetch.mock.calls[0][1].headers["x-mgogpt-portfolio-continuation"]).toBe(gate.token);
  expect(releaseMaintenanceGate).toHaveBeenCalledWith(gate);
  expect(canStartMaintenanceItem).toHaveBeenCalledWith(gate, 7);
});

function useCheapItems({ cached = false } = {}) {
  const fallback = sql.getMockImplementation();
  const mapped = { lifetimeGiving: { totalGiving: 100 }, proposalSummary: [] };
  const payload = { mapped, currentFyGiving: { recognizedReceived: 100 } };
  sql.mockImplementation(async (parts, ...values) => {
    const query = parts.join(" ");
    if (query.includes("WITH next_items")) return Array.from({ length: values[1] }, (_, index) => ({
      id: index + 1, constituent_id: String(index + 1), position: index,
    })).reverse();
    if (query.includes("SELECT summary_payload")) return [{ summary_payload: payload, data_complete: true, stale_after: "2026-10-01" }];
    if (cached && query.includes("FROM portfolio_giving_snapshots")) return [{ constituent_id: values[1][0], payload, stale_after: "2026-10-01" }];
    return fallback(parts, ...values);
  });
  fetch.mockImplementation(async () => Response.json(payload));
}

it("finishes more than ten cheap checks in manifest order without rebuilding current summaries", async () => {
  vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
  useCheapItems();
  await POST(request());
  expect(fetch).toHaveBeenCalledTimes(30);
  expect(canStartMaintenanceItem).toHaveBeenCalledTimes(30);
  expect(fetch.mock.calls.every(([url]) => new URL(url).searchParams.get("giving_only") === "1")).toBe(true);
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname.split("/").at(-2)))
    .toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1)));
  expect(sql.mock.calls.filter(call => call.includes("giving_refreshed_summary_current"))).toHaveLength(30);
  expect(releaseMaintenanceGate).toHaveBeenCalledOnce();
});

it("bounds already-current skips without any provider calls", async () => {
  vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
  useCheapItems({ cached: true });
  await POST(request());
  expect(fetch).not.toHaveBeenCalled();
  expect(sql.mock.calls.filter(call => call.includes("recovered_snapshot"))).toHaveLength(30);
  expect(sql.mock.calls.filter(([parts]) => parts.join(" ").includes("WITH next_items"))).toHaveLength(1);
});

it("leaves unstarted records pending when the durable headroom check stops a turn", async () => {
  vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
  useCheapItems();
  canStartMaintenanceItem.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
  await POST(request());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(canStartMaintenanceItem).toHaveBeenCalledTimes(3);
  const releases = sql.mock.calls.filter(([parts]) => parts.join(" ").includes("WHERE id =") &&
    parts.join(" ").includes("SET status = 'pending', updated_at = NOW()"));
  expect(releases.map(call => call[1])).toEqual(Array.from({ length: 28 }, (_, i) => i + 3));
  expect(sql.mock.calls.some(([parts]) => parts.join(" ").includes("retry_count = retry_count + 1"))).toBe(false);
  expect(releaseMaintenanceGate).toHaveBeenCalledWith(gate);
});

it("keeps a scheduled legacy batch at ten when server-managed continuation is disabled", async () => {
  vi.stubEnv("PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED", "false");
  vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
  useCheapItems();
  await POST(request());
  expect(sql.mock.calls.find(([parts]) => parts.join(" ").includes("WITH next_items")).slice(1)).toEqual([1, 10]);
  expect(claimMaintenanceGate).not.toHaveBeenCalled();
  expect(canStartMaintenanceItem).not.toHaveBeenCalled();
});

it("makes no provider calls or failed attempts if capacity disappears before the first record", async () => {
  vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
  useCheapItems();
  canStartMaintenanceItem.mockResolvedValue(false);
  await POST(request());
  expect(fetch).not.toHaveBeenCalled();
  expect(canStartMaintenanceItem).toHaveBeenCalledOnce();
  expect(sql.mock.calls.filter(([parts]) => parts.join(" ").includes("WHERE id =") &&
    parts.join(" ").includes("SET status = 'pending', updated_at = NOW()"))).toHaveLength(30);
  expect(sql.mock.calls.some(([parts]) => parts.join(" ").includes("retry_count = retry_count + 1"))).toBe(false);
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
