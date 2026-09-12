import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), sql: vi.fn(), transaction: vi.fn(), clear: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: Object.assign(mocks.sql, { transaction: mocks.transaction }) }));
vi.mock("@/app/api/utils/userDataCache", () => ({ clearUserDashboardDataCaches: mocks.clear }));
import { GET, PUT } from "./route";

const version = "a".repeat(32);
const body = { workspaceId: "44", orderedIds: ["12", "10", "11"], version };
const request = (data = body) => new Request("https://example.com/api/prospects/reorder", { method: "PUT", body: JSON.stringify(data) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
  mocks.workspace.mockResolvedValue({ sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 44, role: "mgo" }, isActing: true });
  mocks.sql.mockResolvedValue([{ version, prospects: [{ id: "10", prospect_name: "Alex" }] }]);
  mocks.transaction.mockResolvedValue([[{ allowed: true, saved_count: 3 }]]);
  mocks.clear.mockResolvedValue();
});

describe("complete prospect ranking", () => {
  it("loads a local-only versioned active list for the selected workspace", async () => {
    const response = await GET(new Request("https://example.com/api/prospects/reorder?workspaceId=44"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ workspaceId: "44", version, prospects: [{ id: "10", name: "Alex", askType: null }] });
    expect(mocks.sql.mock.calls[0][0].join("?")).toContain("p.status = 'Active'");
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([44]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("saves the exact full order in one serializable transaction", async () => {
    const response = await PUT(request());
    expect(await response.json()).toEqual({ success: true, workspaceId: "44", orderedIds: body.orderedIds });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: "Serializable" });
    const [strings, ...values] = mocks.sql.mock.calls[0];
    expect(strings.join("?")).toContain("FOR UPDATE");
    expect(strings.join("?")).toContain("AND NOT EXISTS");
    expect(strings.join("?")).toContain("UPDATE prospects p SET priority_order = r.rank");
    expect(values).toEqual([44, JSON.stringify(body.orderedIds), version, 3, 44]);
    expect(mocks.clear).toHaveBeenCalledWith(44);
  });
  it("uses the same saved name resolution as the main cards", async () => {
    mocks.sql.mockResolvedValue([{ version, prospects: [{ id: "10", prospect_name: "NXT constituent 123", cached_constituent_name: "Alex Example" }] }]);
    const response = await GET(new Request("https://example.com/api/prospects/reorder?workspaceId=44"));
    expect((await response.json()).prospects[0].name).toBe("Alex Example");
  });
  it("does not claim success for an incomplete save result", async () => {
    mocks.transaction.mockResolvedValue([[{ allowed: true, saved_count: 2 }]]);
    expect((await PUT(request())).status).toBe(500);
  });
  it("allows an MGO to rank their own workspace", async () => {
    mocks.workspace.mockResolvedValue({ sessionUser: { id: 44, role: "mgo" }, workspaceUser: { id: 44, role: "mgo" } });
    expect((await PUT(request())).status).toBe(200);
  });
  it.each(["executive", "mgo", "advancement_services"])("rejects delegated %s writes before ranking access", async (role) => {
    mocks.workspace.mockResolvedValue({ sessionUser: { id: 2, role }, workspaceUser: { id: 44, role: "mgo" }, isActing: true });
    expect((await PUT(request())).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("requires sign-in", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await PUT(request())).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("rejects a changed workspace instead of writing to a different MGO", async () => {
    expect((await PUT(request({ ...body, workspaceId: "55" }))).status).toBe(409);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each([
    { orderedIds: [] }, { orderedIds: ["10", "10"] }, { orderedIds: ["0"] },
    { orderedIds: [1] }, { orderedIds: ["1 OR TRUE"] }, { orderedIds: ["01"] },
    { orderedIds: null }, { version: "stale" }, { version: [version] }, { orderedIds: Array(10001).fill("10") },
  ])("rejects invalid ranking input %j", async (change) => {
    expect((await PUT(request({ ...body, ...change }))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("holds stale orders or changed active membership without invalidating caches", async () => {
    mocks.transaction.mockResolvedValue([[{ allowed: false, saved_count: 0 }]]);
    const response = await PUT(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("draft was not saved");
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it.each(["40001", "40P01"])("reports concurrent database conflict %s without retry", async (code) => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error("conflict"), { code }));
    expect((await PUT(request())).status).toBe(409);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("does not report failure after a committed save if cache cleanup fails", async () => {
    mocks.clear.mockRejectedValue(new Error("cache unavailable"));
    expect((await PUT(request())).status).toBe(200);
  });
});
