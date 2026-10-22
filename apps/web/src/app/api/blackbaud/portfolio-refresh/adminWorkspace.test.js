import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "test@example.org" } })) }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/reportRefresh", () => ({ isAuthorizedReportRefreshRequest: () => false }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { GET, POST } from "./route";
beforeEach(() => {
  getWorkspaceUser.mockReset().mockResolvedValue({ sessionUser: { id: 7, role: "admin", active: true }, workspaceUser: { id: 7 } });
  sql.mockReset().mockImplementation(async parts => parts.join(" ").includes("SELECT * FROM users") ? [{ id: 9, active: true }] : []);
});
afterEach(() => vi.unstubAllGlobals());
const request = (id = "9", post = false) => new Request(`https://example.org/api/blackbaud/portfolio-refresh?adminWorkspaceId=${id}`,
  post ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", jobId: "1" }) } : {});
it.each(["mgo", "advancement_services", ""])("rejects %s users requesting another workspace for reads or controls", async role => {
  getWorkspaceUser.mockResolvedValue({ sessionUser: { id: 7, role, active: true }, workspaceUser: { id: 7 } });
  expect((await GET(request())).status).toBe(401);
  expect((await POST(request("9", true))).status).toBe(401);
  expect(sql).not.toHaveBeenCalled();
});
it("requires an active admin even if an acting workspace is an admin", async () => {
  getWorkspaceUser.mockResolvedValue({ sessionUser: { id: 7, role: "admin", active: false }, workspaceUser: { id: 9, role: "admin", active: true } });
  expect((await GET(request())).status).toBe(401);
  expect(sql).not.toHaveBeenCalled();
});
it.each(["0", "-1", "invalid", "9%20OR%201=1"])("rejects malformed workspace %s", async id => {
  expect((await GET(request(id))).status).toBe(401);
  expect(sql).not.toHaveBeenCalled();
});
it("reads the selected active workspace without changing acting-as state or NXT", async () => {
  expect((await GET(request())).status).toBe(200);
  expect(sql.mock.calls[0]).toContain(9);
  const jobs = sql.mock.calls.find(([p]) => p.join(" ").includes("FROM portfolio_refresh_jobs"));
  expect(jobs).toContain(9);
  expect(sql.mock.calls.map(([p]) => p.join(" ")).join(" ")).not.toMatch(/UPDATE users|DELETE FROM|INSERT INTO/);
});
it("scopes internal manual summary reads to the selected workspace without setting a browser cookie", async () => {
  sql.mockImplementation(async parts => {
    const query = parts.join(" ");
    if (query.includes("SELECT * FROM users")) return [{ id: 9, active: true }];
    if (query.includes("SELECT * FROM portfolio_refresh_jobs")) return [{ id: 1, workspace_user_id: 9, mode: "full", status: "queued", batch_size: 10 }];
    if (query.includes("WITH next_items")) return [{ id: 1, constituent_id: "123", position: 0 }];
    return [];
  });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "fixture stop" }, { status: 500 })));
  const response = await POST(new Request("https://example.org/api/blackbaud/portfolio-refresh?adminWorkspaceId=9", {
    method: "POST", headers: { "content-type": "application/json", cookie: "auth-session=fixture; workspace_acting_user_id=8" },
    body: JSON.stringify({ action: "process", jobId: "1" }),
  }));
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1].headers.cookie).toBe("auth-session=fixture; workspace_acting_user_id=9");
  expect(response.headers.has("set-cookie")).toBe(false);
});
