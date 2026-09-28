import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), schema: vi.fn(), update: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/stewardshipAssistance", () => ({ updateAssistance: mocks.update }));
import { POST } from "./route";
const body = { id: "11", viewerKey: "2", version: 1, status: "In Progress", note: "Reviewing gift options" };
const request = (change = {}) => new Request("https://example.test/api/stewardship/assistance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...change }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "auth-id", email: "reviewer@example.test" } });
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "advancement_services", active: true }, workspaceUser: { id: 7, role: "mgo" } });
  mocks.update.mockResolvedValue({ id: 11, request_version: 2, status: "In Progress" });
});
it("updates the original request using the real reviewer and an expected version", async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 11, request_viewer_id: "2", request_version: 2 });
  expect(mocks.update.mock.calls[0][0].id).toBe(2);
});
it.each(["mgo", "executive", ""])("denies %s even with a reviewer selected", async role => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role }, workspaceUser: { id: 7, role: "admin" } });
  expect((await POST(request())).status).toBe(403); expect(mocks.update).not.toHaveBeenCalled();
});
it.each([{ version: 0 }, { note: "" }, { note: "x".repeat(2001) }, { status: "Sent" }, { id: "-1" }, { appealId: "33" }])("validates %o", async change => {
  expect((await POST(request(change))).status).toBe(400); expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects a changed session and stale version", async () => {
  expect((await POST(request({ viewerKey: "7" }))).status).toBe(409);
  mocks.update.mockResolvedValue(null); expect((await POST(request())).status).toBe(409);
});
it("denies unauthenticated and inactive users", async () => {
  mocks.auth.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin", active: false } });
  expect((await POST(request())).status).toBe(403);
});
