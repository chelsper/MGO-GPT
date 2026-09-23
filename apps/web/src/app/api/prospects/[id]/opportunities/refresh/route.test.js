import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), sql: vi.fn(), schema: vi.fn(), config: vi.fn(), refresh: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/blackbaud", () => ({ getBlackbaudConfigIssues: mocks.config }));
vi.mock("@/app/api/utils/prospectOpportunityRefresh", () => ({ refreshLinkedProspectOpportunities: mocks.refresh }));
import { POST } from "./route";
const request = () => new Request("https://example.com/api/prospects/7/opportunities/refresh?force=1", { method: "POST" });
const params = { params: { id: "7" } };
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
  mocks.workspace.mockResolvedValue({ workspaceUser: { id: 44 }, sessionUser: { id: 1 }, isActing: true });
  mocks.sql.mockResolvedValue([{ id: 7, nxt_constituent_id: "123" }]);
  mocks.config.mockReturnValue([]);
  mocks.refresh.mockResolvedValue({ checked: 1, changed: 1, deferred: 0, unavailable: 0, total: 1 });
});
it("authorizes the owning workspace but uses the admin's NXT connection", async () => {
  const response = await POST(request(), params);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ status: "current", changed: 1 });
  expect(mocks.refresh).toHaveBeenCalledWith({ userId: 44, authUserId: 1, origin: "https://example.com", prospectId: 7, constituentId: "123", force: true });
  expect(mocks.sql.mock.calls[0][0].join("")).toContain("p.user_id =");
  expect(mocks.sql.mock.calls[0]).toContain(44);
});
it("rejects unauthenticated and other-workspace requests before refreshing", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await POST(request(), params)).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.sql).not.toHaveBeenCalled();
  mocks.sql.mockResolvedValueOnce([]);
  expect((await POST(request(), params)).status).toBe(404);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("leaves cached details available if NXT is not configured", async () => {
  mocks.config.mockReturnValue(["missing"]);
  expect(await (await POST(request(), params)).json()).toEqual({ status: "unavailable" });
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("distinguishes partial or deferred checks from verified current data", async () => {
  mocks.refresh.mockResolvedValueOnce({ checked: 1, changed: 1, unavailable: 1, deferred: 0 });
  expect(await (await POST(request(), params)).json()).toMatchObject({ status: "unavailable", changed: 1 });
  mocks.refresh.mockResolvedValueOnce({ checked: 0, changed: 0, unavailable: 0, deferred: 1 });
  expect(await (await POST(request(), params)).json()).toMatchObject({ status: "deferred" });
});
it("does not expose provider response details", async () => {
  mocks.refresh.mockRejectedValue(new Error("private provider payload"));
  const response = await POST(request(), params);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("private provider payload");
});
