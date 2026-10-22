// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => Object.fromEntries(["auth", "user", "schema", "access", "read", "save"].map(key => [key, vi.fn()])));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: m.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: m.access }));
vi.mock("@/app/api/utils/fyRevenueAdjustments", () => ({ readManualGoalConfig: m.read, saveManualGoalEntry: m.save }));
import { GET, POST } from "./route";
const url = "https://app.example/api/reports/fy-revenue-goals/manual-cash";
const request = (body, origin = "https://app.example") => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  m.user.mockResolvedValue({ id: 7, role: "admin", active: true }); m.access.mockResolvedValue({ canView: true });
  m.read.mockResolvedValue({ manual: { entries: [{ label: "Private receipt" }] } }); m.save.mockResolvedValue({ manual: { entries: [] } });
});
it("checks authentication and sharing before reading private entries", async () => {
  m.auth.mockResolvedValue(null); expect((await GET()).status).toBe(401); expect((await POST(request({}))).status).toBe(401);
  expect(m.read).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
  m.auth.mockResolvedValue({ user: { email: "test@example.org" } }); m.user.mockResolvedValue({ role: "mgo", active: true }); m.access.mockResolvedValue({ canView: false });
  expect((await GET()).status).toBe(403); expect(m.read).not.toHaveBeenCalled();
});
it.each(["mgo", "executive"])("allows shared %s viewers to read but not mutate", async role => {
  m.user.mockResolvedValue({ id: 7, role, active: true }); const result = await GET();
  expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await result.json()).canManage).toBe(false);
  for (const operation of ["save", "archive", "restore"]) expect((await POST(request({ operation, revision: null, input: {} }))).status).toBe(403);
  expect(m.save).not.toHaveBeenCalled();
});
it.each(["admin", "advancement_services"])("uses the server-verified %s identity for mutations", async role => {
  m.user.mockResolvedValue({ id: 7, role, active: true });
  for (const operation of ["save", "archive", "restore"]) expect((await POST(request({ operation, revision: null, input: {} }))).status).toBe(200);
  expect(m.save).toHaveBeenLastCalledWith({ operation: "restore", revision: null, input: {}, user: { id: 7, role, active: true } });
});
it("rejects cross-origin, forged identity and malformed version before writes", async () => {
  expect((await POST(request({ operation: "save", revision: null, input: {} }, "https://other.example"))).status).toBe(403);
  expect((await POST(request({ operation: "save", revision: null, userId: 5 }))).status).toBe(400);
  expect((await POST(request({ operation: "save", revision: "old" }))).status).toBe(409);
  expect((await POST(request({ operation: "delete", revision: null }))).status).toBe(400);
  expect(m.save).not.toHaveBeenCalled();
});
it("hides unexpected storage details and blocks inactive users", async () => {
  m.read.mockRejectedValue(new Error("SECRET database")); const response = await GET();
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("SECRET");
  m.user.mockResolvedValue({ role: "admin", active: false }); expect((await POST(request({ operation: "save", revision: null }))).status).toBe(403);
});
