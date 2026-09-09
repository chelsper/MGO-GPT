import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), sql: vi.fn(), load: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/prospectRecentActivity", () => ({ loadProspectRecentActivity: mocks.load }));
import { GET } from "./route";
const request = () => GET(new Request("https://example.com/api/prospects/1/recent-activity"), { params: { id: "1" } });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "mgo@example.com" } });
  mocks.workspace.mockResolvedValue({ workspaceUser: { id: 7 }, sessionUser: { id: 2 }, isActing: true });
  mocks.sql.mockResolvedValue([{ constituent_id: "100" }]);
  mocks.load.mockResolvedValue({ action: { data: null }, gift: { data: null } });
});
it("scopes the prospect lookup to its workspace and uses the viewer's NXT connection", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.sql.mock.calls[0].slice(1)).toEqual(["1", 7]);
  expect(mocks.load).toHaveBeenCalledWith({ userId: 7, authUserId: 2, origin: "https://example.com", constituentId: "100" });
});
it("rejects unauthenticated callers without NXT requests", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("rejects prospects outside the selected workspace", async () => {
  mocks.sql.mockResolvedValue([]);
  expect((await request()).status).toBe(404);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("skips NXT when the prospect has no linked constituent", async () => {
  mocks.sql.mockResolvedValue([{ constituent_id: null }]);
  expect(await (await request()).json()).toEqual({ linked: false });
  expect(mocks.load).not.toHaveBeenCalled();
});
