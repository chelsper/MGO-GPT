import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), schema: vi.fn(), read: vi.fn(), create: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/stewardshipAssistance", () => ({ readTaskAssistance: mocks.read, createTaskAssistance: mocks.create }));
import { GET, POST } from "./route";

const context = { sessionUser: { id: 2, role: "admin", active: true }, workspaceUser: { id: 7, role: "mgo", active: true }, isActing: true };
const draft = { type: "gift", instructions: "A gift for the donor's retirement", neededBy: "2026-10-01", expectedUpdatedAt: "2026-09-28 10:00:00.123456+00" };
const request = (body, query = "viewerId=2&workspaceId=7", headers = {}) => new Request(`https://example.test/api/pending-actions/50/stewardship-request?${query}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const params = { params: { id: "50" } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { email: "admin@example.test" } });
  mocks.context.mockResolvedValue(context); mocks.read.mockResolvedValue({ id: 50, status: "Open", request: null });
  mocks.create.mockResolvedValue({ id: "11", already_exists: false });
});
it("loads saved context only and binds both workspace and actor", async () => {
  const response = await GET(request(), params);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  expect(await response.json()).toMatchObject({ viewerId: "2", workspaceId: "7", task: { id: 50 } });
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["gift", "letter", "recognition", "guidance"])("creates %s only with verified saved task context", async type => {
  mocks.read.mockResolvedValue({ id: 50, request: { id: "11", status: "Open" } });
  expect((await POST(request({ ...draft, type }), params)).status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(context, "50", { ...draft, type });
});
it("recovers an existing request instead of creating another", async () => {
  mocks.create.mockResolvedValue({ id: "11", already_exists: true });
  expect((await POST(request(draft), params)).status).toBe(200);
});
it.each([{ type: "__proto__" }, { instructions: " " }, { instructions: "x".repeat(4001) }, { neededBy: "2026-02-30" },
  { neededBy: "no date" }, { expectedUpdatedAt: "bad" }, { constituentId: "999" }, { ownerId: 99 }, { requestId: 11 }])("rejects invalid or forged fields %o", async change => {
  expect((await POST(request({ ...draft, ...change }), params)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["viewerId=2&workspaceId=8", "viewerId=9&workspaceId=7", ""])("rejects stale scope %s", async query => {
  expect((await POST(request(draft, query), params)).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it.each([
  { ...context, sessionUser: { id: 2, role: "executive" } },
  { ...context, sessionUser: { id: 2, role: "admin", active: false } },
  { ...context, workspaceUser: { id: 7, role: "mgo", active: false } },
  { ...context, invalidActingUserId: 99 },
])("denies read-only or inactive contexts", async value => {
  mocks.context.mockResolvedValue(value);
  expect((await POST(request(draft), params)).status).toBe(403);
  expect((await GET(request(), params)).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("authenticates before schema or task reads", async () => {
  mocks.auth.mockResolvedValue(null); expect((await POST(request(draft), params)).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
});
it("rejects cross-site submissions", async () => {
  expect((await POST(request(draft, undefined, { Origin: "https://other.test" }), params)).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("reports stale tasks and safe errors without leaking internals", async () => {
  mocks.create.mockResolvedValue(null); expect((await POST(request(draft), params)).status).toBe(409);
  mocks.read.mockRejectedValue(new Error("secret"));
  const response = await GET(request(), params); expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("secret");
});
