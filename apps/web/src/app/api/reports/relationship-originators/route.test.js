import { beforeEach, expect, it, vi } from "vitest";
const { user, access, load, refresh, reportUser } = vi.hoisted(() => ({ user: vi.fn(), access: vi.fn(), load: vi.fn(), refresh: vi.fn(), reportUser: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/relationshipOriginator", async importOriginal => ({ ...await importOriginal(), originatorUser: user }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: access, EXECUTIVE_TEAM_STANDINGS_REPORT_KEY: "executive-team-standings" }));
vi.mock("@/app/api/utils/reportCache", () => ({ getCachedReportSnapshot: load }));
vi.mock("@/app/api/utils/reportRefresh", () => ({ getReportRefreshUser: reportUser }));
vi.mock("@/app/api/utils/relationshipOriginatorReport", () => ({ ORIGINATOR_REPORT_KEY: "originators", refreshOriginatorReport: refresh }));
import { GET, POST } from "./route";
import { OriginatorError } from "@/app/api/utils/relationshipOriginatorModel";
const request = () => new Request("https://app.example/api/reports/relationship-originators", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
beforeEach(() => {
  vi.clearAllMocks(); user.mockResolvedValue({ id: 1, role: "mgo" }); access.mockResolvedValue({ canView: true });
  load.mockResolvedValue({ rows: [], issues: [{ constituentId: "200", reason: "Missing date" }] });
  refresh.mockResolvedValue({ rows: [], issues: [] });
  reportUser.mockResolvedValue({ id: 9, role: "admin" });
});
it("does not run NXT reads on a saved report visit or leak Admin issue details", async () => {
  const result = await GET(); expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ issueCount: 1 });
  expect((await (await GET()).json()).issues).toBeUndefined();
  expect(refresh).not.toHaveBeenCalled();
});
it("enforces Team Standings access before exposing or refreshing the report", async () => {
  access.mockResolvedValue({ canView: false });
  expect((await GET()).status).toBe(403); expect((await POST(request())).status).toBe(403);
  expect(load).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
});
it("rejects unauthenticated requests before report reads", async () => {
  user.mockRejectedValue(new OriginatorError("Please sign in", 401));
  expect((await GET()).status).toBe(401); expect(load).not.toHaveBeenCalled();
});
it("refreshes only through an explicit POST", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(refresh).toHaveBeenCalledWith({ user: { id: 9, role: "admin" }, origin: "https://app.example" });
});
it("never replaces team totals using the requester's restricted MGO connection", async () => {
  reportUser.mockResolvedValue({ id: 1, role: "mgo" });
  expect((await POST(request())).status).toBe(409);
  expect(refresh).not.toHaveBeenCalled();
});
