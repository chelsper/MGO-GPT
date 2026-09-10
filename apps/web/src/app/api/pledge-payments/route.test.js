import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), readCache: vi.fn(), acquire: vi.fn(), sky: vi.fn(), batch: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: mocks.sky, downloadBlackbaudQueryResultWithMetadata: vi.fn() }));
vi.mock("@/app/api/utils/pledgePaymentStore", () => ({ pledgeScope: (userId, origin) => `${userId}:${origin}`, readPledgeCache: mocks.readCache, acquirePledgeStore: mocks.acquire }));
vi.mock("@/app/api/utils/pledgePaymentPipeline", async (original) => ({ ...await original(), runPledgeBatch: mocks.batch }));
import { GET, POST } from "./route";
const get = () => new Request("https://app.example/api/pledge-payments");
const post = (body = { action: "start" }, origin = "https://app.example") => new Request(get(), { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const reviewer = { id: 1, role: "advancement_services", active: true };
let store;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "reviewer@example.com" } });
  mocks.workspace.mockResolvedValue({ sessionUser: reviewer, workspaceUser: { id: 99, role: "mgo" } });
  mocks.readCache.mockResolvedValue({ job: null, records: [], issues: [] });
  store = { job: null, saveJob: vi.fn(), retryFailed: vi.fn(), release: vi.fn().mockResolvedValue() };
  mocks.acquire.mockResolvedValue(store);
  mocks.batch.mockResolvedValue();
});

describe("restricted pledge payment route", () => {
  it("requires authentication and restricts both reads and refreshes", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect((await POST(post())).status).toBe(401);
    expect(mocks.schema).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ user: { email: "mgo@example.com" } });
    for (const sessionUser of [{ ...reviewer, role: "mgo" }, { ...reviewer, active: false }]) {
      mocks.workspace.mockResolvedValue({ sessionUser, workspaceUser: reviewer });
      expect((await GET(get())).status).toBe(403);
      expect((await POST(post())).status).toBe(403);
    }
    expect(mocks.readCache).not.toHaveBeenCalled();
    expect(mocks.sky).not.toHaveBeenCalled();
  });
  it("reads only the signed-in reviewer's cache without a SKY call, even in an acting workspace", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.readCache).toHaveBeenCalledWith("1:https://app.example");
    expect(mocks.sky).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
  it("allows admins, starts a bounded batch using the session user's connection, and always releases the lease", async () => {
    mocks.workspace.mockResolvedValue({ sessionUser: { ...reviewer, role: "admin" }, workspaceUser: { id: 99 } });
    expect((await POST(post())).status).toBe(200);
    expect(store.saveJob).toHaveBeenCalledWith(expect.objectContaining({ status: "discovering" }));
    const options = mocks.batch.mock.calls[0][0];
    await options.read("https://api.sky.blackbaud.com/gift/v1/gifts/1");
    expect(mocks.sky).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ userId: 1, authUserId: 1, timeoutMs: 12000, maxRetries: 1 }));
    expect(store.release).toHaveBeenCalledOnce();
  });
  it("rejects concurrent batches, stale job commands, unsafe origins, and invalid actions", async () => {
    expect((await POST(post({ action: "start" }, "https://evil.example"))).status).toBe(403);
    expect((await POST(post({ action: "delete" }))).status).toBe(400);
    mocks.acquire.mockResolvedValueOnce(null);
    expect((await POST(post())).status).toBe(409);
    store.job = { id: "current", status: "running", source: "saved_query", queryId: "12033" };
    expect((await POST(post())).status).toBe(409);
    expect((await POST(post({ action: "resume", jobId: "old" }))).status).toBe(409);
    expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("cancels without SKY calls and retries only failed items without replacing saved results", async () => {
    store.job = { id: "current", status: "running", discoveryComplete: true, source: "saved_query", queryId: "12033" };
    expect((await POST(post({ action: "cancel", jobId: "current" }))).status).toBe(200);
    expect(store.saveJob).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
    expect(mocks.batch).not.toHaveBeenCalled();
    expect((await POST(post({ action: "retry_failed", jobId: "current" }))).status).toBe(200);
    expect(store.retryFailed).toHaveBeenCalledWith("current");
  });
  it("sanitizes failures while releasing the lock for a later resume", async () => {
    mocks.batch.mockRejectedValueOnce(new Error("private database donor payload token"));
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database");
    expect(store.release).toHaveBeenCalledOnce();
  });
  it("requires an explicit switch from legacy discovery, retaining cache rather than resuming the broad scan", async () => {
    store.job = { id: "old", status: "running", discoveryComplete: true };
    expect((await POST(post({ action: "resume", jobId: "old" }))).status).toBe(409);
    expect((await POST(post({ action: "retry_failed", jobId: "old" }))).status).toBe(409);
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(store.retryFailed).not.toHaveBeenCalled();
    expect((await POST(post({ action: "start", jobId: "old" }))).status).toBe(200);
    expect(store.saveJob).toHaveBeenCalledWith(expect.objectContaining({ source: "saved_query", queryId: "12033", discoveryComplete: false }));
    expect(mocks.sky).not.toHaveBeenCalled();
  });
});
