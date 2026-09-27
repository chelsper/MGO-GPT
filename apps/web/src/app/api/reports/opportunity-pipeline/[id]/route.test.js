import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), user: vi.fn(), access: vi.fn(), get: vi.fn(), save: vi.fn(), verify: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: mocks.access }));
vi.mock("@/app/api/utils/pipelineOpportunityChange", () => ({ getPipelineEditor: mocks.get, savePipelineChange: mocks.save, verifyPipelineChange: mocks.verify }));
import { GET, PATCH, POST } from "./route";
const request = (method = "GET", body = {}, headers = {}) => new Request("https://example.test/api/reports/opportunity-pipeline/1", {
  method, headers: { "content-type": "application/json", ...headers }, ...(method === "PATCH" ? { body: JSON.stringify(body) } : {}),
});
const context = { params: { id: "1" } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { email: "owner@example.test" } });
  mocks.user.mockResolvedValue({ id: 10, role: "mgo", active: true }); mocks.access.mockResolvedValue({ canView: true });
  mocks.get.mockResolvedValue({ state: "ready" }); mocks.save.mockResolvedValue({ state: "pending" }); mocks.verify.mockResolvedValue({ state: "complete" });
});
it("rejects anonymous, inactive and denied report users before operations", async () => {
  mocks.auth.mockResolvedValue(null); expect((await GET(request(), context)).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({ user: { email: "user@example.test" } }); mocks.user.mockResolvedValue({ id: 1, active: false });
  expect((await PATCH(request("PATCH"), context)).status).toBe(403);
  mocks.user.mockResolvedValue({ id: 1, active: true }); mocks.access.mockResolvedValue({ canView: false });
  expect((await POST(request("POST"), context)).status).toBe(403);
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled();
});
it("rejects cross-origin requests and invalid IDs", async () => {
  expect((await PATCH(request("PATCH", {}, { origin: "https://attacker.test" }), context)).status).toBe(403);
  expect((await POST(request("POST", {}, { "sec-fetch-site": "cross-site" }), context)).status).toBe(403);
  expect((await GET(request(), { params: { id: "1 OR 1=1" } })).status).toBe(400);
  expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("uses the real authenticated actor, ignores impersonation as authority, and returns private pending responses", async () => {
  const response = await PATCH(request("PATCH", { actor: { id: 1, role: "admin" } }, { cookie: "workspace_acting_user_id=20" }), context);
  expect(response.status).toBe(202); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ actor: { id: 10, role: "mgo", active: true }, id: "1" }));
});
it("separates read, save and read-only verification paths", async () => {
  expect((await GET(request(), context)).status).toBe(200);
  expect((await POST(request("POST"), context)).status).toBe(200);
  expect(mocks.get).toHaveBeenCalledOnce(); expect(mocks.verify).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled();
});
it("does not disclose raw database/provider errors", async () => {
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.get.mockRejectedValue(new Error("secret provider data"));
  const response = await GET(request(), context);
  expect(response.status).toBe(502); expect(await response.text()).not.toContain("secret"); logger.mockRestore();
});
