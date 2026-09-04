import { beforeEach, expect, it, vi } from "vitest";
const { auth, access, sql } = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), sql: vi.fn() }));
vi.mock("@/app/api/utils/dashboardAuth", () => ({ requireDashboardUser: auth }));
vi.mock("@/app/api/utils/reportAccess", () => ({ EXECUTIVE_TEAM_STANDINGS_REPORT_KEY: "executive-team-standings", getReportAccessForUser: access }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
import { GET, PUT, validateGoal } from "./route";
const request = (body) => new Request("https://example.org/api/reports/executive-team-standings/goals", { method: "PUT", body: JSON.stringify(body) });
const input = { fiscalYearStart: "2026", userId: 8, raisedGoal: "250000.50", actionsGoal: "100" };
beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue({ id: 7, role: "admin" }); access.mockResolvedValue({ canView: true }); sql.mockResolvedValue([]); });
it("reads FY-scoped goals for an authorized viewer without NXT", async () => {
  auth.mockResolvedValue({ id: 7, role: "executive" });
  sql.mockResolvedValue([{ user_id: 8, raised_goal: "250000.50", actions_goal: 100 }]);
  const response = await GET(new Request("https://example.org/goals?fiscalYearStart=2026"));
  expect(await response.json()).toMatchObject({ canEdit: false, goals: [{ user_id: 8 }] });
  expect(sql.mock.calls[0].slice(1)).toEqual([2026]);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("allows only admins to save active MGO goals, without changing report snapshots", async () => {
  sql.mockResolvedValueOnce([{ id: 8, role: "mgo" }]).mockResolvedValueOnce([{ user_id: 8, raised_goal: "250000.50", actions_goal: 100 }]);
  const response = await PUT(request(input));
  expect(response.status).toBe(200);
  expect(sql).toHaveBeenCalledTimes(2);
  expect(sql.mock.calls[1].slice(1)).toEqual([8, 2026, 250000.5, 100, 7]);
});
it("rejects non-admin writes even when the user can view standings", async () => {
  auth.mockResolvedValue({ id: 7, role: "executive" });
  expect((await PUT(request(input))).status).toBe(403);
  expect(sql).not.toHaveBeenCalled();
});
it("enforces report access and authentication", async () => {
  access.mockResolvedValue({ canView: false });
  expect((await GET(new Request("https://example.org/goals?fiscalYearStart=2026"))).status).toBe(403);
  auth.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
  expect((await PUT(request(input))).status).toBe(401);
  expect(sql).not.toHaveBeenCalled();
});
it.each([0, -1, "NaN", "Infinity", true, {}, "1e5", "1.234", " "])("rejects unsafe goal %j", (value) => {
  expect(() => validateGoal(value)).toThrow();
});
it("allows clearing goals but not fractional action counts", () => {
  expect(validateGoal("")).toBeNull(); expect(validateGoal(null)).toBeNull();
  expect(() => validateGoal("1.5", true)).toThrow();
});
it("does not set goals for inactive or non-MGO users", async () => {
  sql.mockResolvedValueOnce([{ id: 8, role: "executive" }]);
  expect((await PUT(request(input))).status).toBe(400);
  expect(sql).toHaveBeenCalledTimes(1);
});
it("returns a safe error for database failures", async () => {
  sql.mockRejectedValue(new Error("private connection string"));
  const response = await GET(new Request("https://example.org/goals?fiscalYearStart=2026"));
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("private connection");
});
