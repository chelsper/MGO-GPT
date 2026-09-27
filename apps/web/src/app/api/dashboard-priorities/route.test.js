import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), settings: vi.fn(), read: vi.fn(), candidates: vi.fn(), save: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/organizationSettings", () => ({ getOrganizationSettings: mocks.settings }));
vi.mock("@/app/api/utils/dashboardPriorities", () => ({ readDashboardPriorities: mocks.read, readPriorityCandidates: mocks.candidates, savePriorityPreference: mocks.save }));
import { GET, PUT } from "./route";
const item = { key: "follow-up:1", revision: "a".repeat(64) };
const context = { sessionUser: { id: 7, role: "mgo", active: true }, workspaceUser: { id: 7, name: "Test", role: "mgo", active: true } };
const get = (query = "workspaceId=7") => new Request(`https://example.app/api/dashboard-priorities?${query}`);
const put = (body = { ...item, action: "dismiss" }, headers = {}, query = "workspaceId=7") => new Request(get(query), { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "test@example.app" } });
  mocks.workspace.mockResolvedValue(structuredClone(context));
  mocks.settings.mockResolvedValue({ dashboardAssistant: { enabled: true } });
  mocks.read.mockResolvedValue({ items: [item], hidden: [], asOf: "2026-09-27", truncated: false });
  mocks.candidates.mockResolvedValue({ candidates: [item] });
});
it("authenticates before schema work and never exposes data without a session", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(get())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("returns explicit no-store viewer/workspace identity and saved data", async () => {
  const response = await GET(get());
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ viewerId: "7", workspaceUserId: "7", workspaceName: "Test", items: [item] });
  expect(mocks.read).toHaveBeenCalledWith(7, 7);
});
it.each([{}, { sessionUser: { ...context.sessionUser, active: false } }, { workspaceUser: { ...context.workspaceUser, active: false } }, { invalidActingUserId: 10 }, { sessionUser: { ...context.sessionUser, role: "advancement_services" } }])("fails closed for invalid authorization %j", async patch => {
  mocks.workspace.mockResolvedValue(Object.keys(patch).length ? { ...context, ...patch } : {});
  expect((await GET(get())).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
it("rejects stale workspace cookies/client scope and disabled helpers", async () => {
  expect((await GET(get("workspaceId=99"))).status).toBe(409);
  expect((await PUT(put(undefined, {}, "workspaceId=99"))).status).toBe(409);
  mocks.settings.mockResolvedValue({ dashboardAssistant: { enabled: false } });
  expect((await GET(get())).status).toBe(403); expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps delegated preferences private to the viewer, including a read-only executive", async () => {
  mocks.workspace.mockResolvedValue({ ...context, sessionUser: { ...context.sessionUser, role: "executive" }, workspaceUser: { ...context.workspaceUser, id: 10 }, isActing: true });
  expect((await PUT(put(undefined, {}, "workspaceId=10"))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ viewerId: 7, workspaceId: 10, item, action: "dismiss" }));
});
it.each([{ Origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }])("rejects cross-site writes before reading data", async headers => {
  expect((await PUT(put(undefined, headers))).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it.each([null, { ...item, action: "delete" }, { ...item, action: "dismiss", userId: 10 }, { ...item, action: "snooze", days: 365 }, { ...item, revision: "old", action: "dismiss" }])("rejects unsupported payloads %j", async body => {
  expect((await PUT(put(body))).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled();
});
it("bounds request size and requires current record facts from the authorized workspace", async () => {
  expect((await PUT(put({ text: "x".repeat(5000) }))).status).toBe(413);
  mocks.candidates.mockResolvedValue({ candidates: [{ ...item, revision: "b".repeat(64) }] });
  expect((await PUT(put())).status).toBe(409); expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["dismiss", "snooze", "restore"])("persists only the %s preference", async action => {
  expect((await PUT(put({ ...item, action, ...(action === "snooze" ? { days: 1 } : {}) }))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("does not leak database errors or claim a failed write succeeded", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.save.mockRejectedValue(Object.assign(new Error("secret database detail"), { status: 502 }));
  const response = await PUT(put());
  expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("secret");
  log.mockRestore();
});
