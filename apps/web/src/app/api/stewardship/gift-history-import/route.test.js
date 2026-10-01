import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), read: vi.fn(), advance: vi.fn(), inventory: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/stewardshipInventory", () => ({ readGiftInventory: mocks.inventory }));
vi.mock("@/app/api/utils/stewardshipHistoryImport", () => ({ readHistoryState: mocks.read, advanceHistoryImport: mocks.advance, publicHistoryState: state => state }));
import { GET, POST } from "./route";
const url = "https://example.test/api/stewardship/gift-history-import";
const request = (body = {}, headers = {}) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ operation: "start", queryId: "31053", confirmed: true, version: 1, viewerKey: "2", ...body }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "session", email: "staff@example.test" } });
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin", active: true }, workspaceUser: { id: 7, role: "mgo" } });
  mocks.read.mockResolvedValue({ version: 1, config: {}, job: null });
  mocks.advance.mockResolvedValue({ version: 2, config: { queryId: "31053" }, job: { stage: "query" } });
  mocks.inventory.mockResolvedValue([{ id: "1", name: "Gift", version: 1, archived_at: null, location: "Private" }]);
});
it("GET reads saved state only, binds the actor and omits storage details", async () => {
  const response = await GET(new Request(url));
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({ viewerKey: "2", sessionKey: "session", items: [{ id: "1", name: "Gift" }] });
  expect(mocks.advance).not.toHaveBeenCalled(); expect(mocks.read.mock.calls[0][0].id).toBe(2);
});
it.each(["mgo", "executive", "unknown"])("denies %s access even when viewing an admin workspace", async role => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 7, role }, workspaceUser: { id: 2, role: "admin" } });
  expect((await GET(new Request(url))).status).toBe(403); expect((await POST(request())).status).toBe(403);
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("denies unauthenticated and inactive users", async () => {
  mocks.auth.mockResolvedValueOnce(null); expect((await GET(new Request(url))).status).toBe(401);
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin", active: false } });
  expect((await POST(request())).status).toBe(403);
});
it("rejects cross-site writes and forged payload fields", async () => {
  expect((await POST(request({}, { origin: "https://evil.test" }))).status).toBe(403);
  expect((await POST(request({}, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  expect((await POST(request({ rows: [{ constituentId: "forged" }] }))).status).toBe(400);
  expect((await POST(request({ viewerKey: "7" }))).status).toBe(409);
  expect((await POST(request({ operation: "constructor" }))).status).toBe(400);
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("starts only the requested query through the actual staff actor", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.advance.mock.calls[0].slice(0, 3)).toEqual([{ id: 2, role: "admin", active: true }, { operation: "start", queryId: "31053", confirmed: true, version: 1, viewerKey: "2" }, "https://example.test"]);
});
it("sanitizes provider failures instead of exposing private NXT diagnostics", async () => {
  mocks.advance.mockRejectedValue(new Error("private token and SQL"));
  const response = await POST(request()); expect(response.status).toBe(409);
  expect(await response.text()).not.toContain("private token");
});
