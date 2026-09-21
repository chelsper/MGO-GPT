import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn(), save: vi.fn(), read: vi.fn() }));
vi.mock("@/app/api/utils/dashboardAuth", () => ({ requireDashboardUser: mocks.user }));
vi.mock("@/app/api/utils/reportMetricLibrary", () => ({ listMetricLibrary: mocks.list, saveMetricLibraryEntry: mocks.save, readMetricLibraryResult: mocks.read }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
import { GET, POST, PATCH } from "./route";
import { GET as detail } from "./[metricId]/route";

const request = (method = "GET", body, headers = {}, query = "") => new Request(`https://example.test/api/reports/metrics${query}`, { method, ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}), headers });
const user = { id: 1, active: true, role: "admin" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(user);
  mocks.list.mockResolvedValue({ entries: [], sources: [] });
  mocks.save.mockResolvedValue({ id: "saved" });
  mocks.read.mockResolvedValue({ metric: { id: "saved" }, result: null });
});

it.each([401, 403])("requires an active signed-in account (%s)", async (status) => {
  mocks.user.mockRejectedValue(Object.assign(new Error("No access"), { status }));
  for (const handler of [GET, POST, PATCH]) {
    const response = await handler(request(handler === GET ? "GET" : "POST", handler === GET ? undefined : {}));
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});

it("requires manager role for source discovery, edits, creation and preview", async () => {
  mocks.user.mockResolvedValue({ ...user, role: "mgo" });
  expect((await GET(request("GET", undefined, {}, "?manage=1"))).status).toBe(403);
  expect((await POST(request("POST", {}))).status).toBe(403);
  expect((await PATCH(request("PATCH", {}))).status).toBe(403);
  expect((await detail(request("GET", undefined, {}, "?preview=1"), { params: { metricId: "saved" } })).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});

it.each(["admin", "advancement_services"])("allows %s managers to configure metadata", async (role) => {
  mocks.user.mockResolvedValue({ ...user, role });
  expect((await POST(request("POST", { title: "New metric" }, { origin: "https://example.test" }))).status).toBe(201);
  expect(mocks.save).toHaveBeenCalledWith({ ...user, role }, { title: "New metric" }, true);
  expect((await PATCH(request("PATCH", { title: "Update" }))).status).toBe(200);
  expect(mocks.save).toHaveBeenLastCalledWith({ ...user, role }, { title: "Update" }, false);
});

it.each([{ origin: "https://other.test" }, { "sec-fetch-site": "cross-site" }])("rejects cross-origin edits: %j", async (headers) => {
  expect((await POST(request("POST", {}, headers))).status).toBe(403);
  expect((await PATCH(request("PATCH", {}, headers))).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("rejects malformed and oversized bodies before calling the store", async () => {
  expect((await POST(request("POST", "{"))).status).toBe(400);
  expect((await POST(request("POST", { description: "a".repeat(16001) }))).status).toBe(413);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("keeps all reads snapshot-only even with refresh flags or scheduling headers", async () => {
  const response = await GET(request("GET", undefined, { "x-mgogpt-refresh": "true" }, "?refresh=1"));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith(user, false);
  await detail(request("GET", undefined, { "x-mgogpt-refresh": "1" }, "?refresh=1"), { params: Promise.resolve({ metricId: "saved" }) });
  expect(mocks.read).toHaveBeenCalledWith(user, "saved", false);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("uses explicit manager preview and keeps every response private", async () => {
  const response = await detail(request("GET", undefined, {}, "?preview=1"), { params: { metricId: "saved" } });
  expect(mocks.read).toHaveBeenCalledWith(user, "saved", true);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("does not leak database/provider failures", async () => {
  mocks.list.mockRejectedValue(new Error("private DB credentials"));
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("credentials");
});
