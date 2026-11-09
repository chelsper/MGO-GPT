import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), schema: vi.fn(), load: vi.fn(), list: vi.fn(), link: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/existingOpportunityLink", async original => ({ ...await original(), loadLinkProspect: mocks.load, listLinkCandidates: mocks.list, linkExistingOpportunity: mocks.link }));
import { GET, POST } from "./route";
const params = { params: { id: "7" } };
const context = { sessionUser: { id: 1, role: "admin" }, workspaceUser: { id: 44, role: "mgo" }, isActing: true };
const request = (saving = false, body = {}, headers = {}) => new Request("https://example.com/api/prospects/7/opportunities/link-existing?scope=1%3A44", {
  method: saving ? "POST" : "GET", headers,
  ...(saving ? { body: JSON.stringify({ scope: "1:44", opportunityId: "900", ...body }) } : {}),
});
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } }); mocks.workspace.mockResolvedValue(context);
  mocks.load.mockResolvedValue({ id: 7 }); mocks.list.mockResolvedValue([]); mocks.link.mockResolvedValue({ opportunityId: 91 });
});
it("allows Admin acting for an MGO and binds the selected opportunity to that workspace", async () => {
  const result = await POST(request(true, { estimatedAmount: 999, constituentId: "evil" }), params);
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.load).toHaveBeenCalledWith(44, "7");
  expect(mocks.link).toHaveBeenCalledWith({ userId: 44, authUserId: 1, origin: "https://example.com" }, { id: 7 }, "900");
});
it("allows an MGO in their own workspace", async () => {
  mocks.workspace.mockResolvedValue({ sessionUser: { id: 44, role: "mgo" }, workspaceUser: { id: 44, role: "mgo" } });
  expect((await POST(request(true, { scope: "44:44" }), params)).status).toBe(200);
});
it.each([GET, POST])("requires authentication", async handler => {
  mocks.auth.mockResolvedValue(null);
  expect((await handler(request(handler === POST), params)).status).toBe(401); expect(mocks.schema).not.toHaveBeenCalled();
});
it.each(["executive", "mgo", "advancement_services"])('rejects delegated editing by %s', async role => {
  mocks.workspace.mockResolvedValue({ ...context, sessionUser: { id: 1, role } });
  expect((await POST(request(true), params)).status).toBe(403); expect(mocks.load).not.toHaveBeenCalled();
});
it("rejects changed workspace, invalid IDs and cross-origin requests before provider calls", async () => {
  expect((await POST(request(true, { scope: "1:45" }), params)).status).toBe(409);
  expect((await POST(request(true, { opportunityId: "invalid" }), params)).status).toBe(400);
  expect((await POST(request(true, {}, { origin: "https://other.example" }), params)).status).toBe(403);
  expect((await GET(request(false, {}, { "sec-fetch-site": "cross-site" }), params)).status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.link).not.toHaveBeenCalled();
});
it("listing does not link anything and errors do not expose provider details", async () => {
  expect((await GET(request(), params)).status).toBe(200); expect(mocks.link).not.toHaveBeenCalled();
  mocks.list.mockRejectedValue(new Error("secret provider response"));
  const response = await GET(request(), params); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
