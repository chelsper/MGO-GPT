import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), save: vi.fn(), detail: vi.fn() }));
vi.mock("@/app/api/utils/dashboardAuth", () => ({ requireDashboardUser: mocks.user }));
vi.mock("@/app/api/utils/personalDashboards", () => ({ readPersonalWorkspace: mocks.read, savePersonalWorkspace: mocks.save, readPersonalDashboard: mocks.detail }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
import { GET, PUT } from "./route";
import { GET as detail } from "./[dashboardId]/route";
const user = { id: 7, active: true, role: "mgo" };
const request = (body, headers = {}, query = "") => new Request(`https://example.test/api/reports/personal-dashboards${query}`, { method: body === undefined ? "GET" : "PUT", headers, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(user); mocks.read.mockResolvedValue({ dashboards: [] }); mocks.save.mockResolvedValue({ dashboards: [] }); mocks.detail.mockResolvedValue({ dashboard: {}, cards: [] }); });
it.each([401, 403])("requires an active login for every endpoint (%s)", async (status) => {
  mocks.user.mockRejectedValue(Object.assign(new Error("No access"), { status }));
  for (const response of [await GET(), await PUT(request({})), await detail(request(), { params: { dashboardId: "id" } })]) {
    expect(response.status).toBe(status); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled();
});
it("binds reads to the actor and ignores workspace, preview and refresh flags", async () => {
  const response = await GET(request(undefined, {}, "?userId=99&workspaceId=99&refresh=1"));
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(user);
  await detail(request(undefined, {}, "?preview=1&refresh=1&userId=99"), { params: Promise.resolve({ dashboardId: "mine" }) });
  expect(mocks.detail).toHaveBeenCalledExactlyOnceWith(user, "mine"); expect(mocks.save).not.toHaveBeenCalled();
});
it("allows ordinary active users to save only through the owner-scoped store", async () => {
  expect((await PUT(request({ revision: "0" }, { origin: "https://example.test" }))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(user, { revision: "0" });
});
it.each([{ origin: "https://foreign.test" }, { "sec-fetch-site": "cross-site" }])("rejects cross-site edits %j", async (headers) => {
  expect((await PUT(request({}, headers))).status).toBe(403); expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects malformed and oversized bodies and strips unexpected errors", async () => {
  expect((await PUT(request("{"))).status).toBe(400);
  expect((await PUT(request({ data: "a".repeat(24001) }))).status).toBe(413);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.read.mockRejectedValue(new Error("secret connection string"));
  const response = await GET(); expect(response.status).toBe(500); expect(await response.text()).not.toContain("secret");
});
