import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), settings: vi.fn(), read: vi.fn(), create: vi.fn(), gifts: vi.fn(), clear: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/organizationSettings", () => ({ getOrganizationSettings: mocks.settings }));
vi.mock("@/app/api/utils/giftFollowUp", () => ({ readGiftFollowUp: mocks.read, createGiftFollowUp: mocks.create }));
vi.mock("@/app/api/utils/dashboardGiftPriorities", () => ({ loadDashboardGifts: mocks.gifts }));
vi.mock("@/app/api/utils/userDataCache", () => ({ clearUserDashboardDataCaches: mocks.clear }));
import { GET, POST } from "./route";
const item = { key: "gift:900", revision: "a".repeat(64), giftId: "900", constituentId: "100", constituentName: "Sample Donor", giftAmount: 2500, dueDate: "2026-09-28" };
const task = { id: 50, owner_user_id: 7, title: "Thank donor", status: "Open" };
const context = { sessionUser: { id: 7, role: "mgo", active: true }, workspaceUser: { id: 7, name: "Example Officer", role: "mgo", active: true } };
const body = { key: item.key, revision: item.revision, title: "Thank donor", details: "Arrange a call", dueDate: "2026-09-30" };
const get = (workspace = 7) => new Request(`https://example.app/api/dashboard-gift-follow-up?workspaceId=${workspace}&key=${item.key}&revision=${item.revision}`);
const post = (data = body, headers = {}, workspace = 7) => new Request(get(workspace), { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "test@example.app" } });
  mocks.workspace.mockResolvedValue(structuredClone(context));
  mocks.settings.mockResolvedValue({ dashboardAssistant: { enabled: true } });
  mocks.gifts.mockResolvedValue({ items: [item] });
  mocks.read.mockResolvedValue(null);
  mocks.create.mockResolvedValue(task);
});
it("reads saved context without creating anything and returns no-store scope", async () => {
  const response = await GET(get());
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ viewerId: "7", workspaceUserId: "7", key: item.key, revision: item.revision, gift: item, task: null, ownerName: "Example Officer" });
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
});
it("checks auth before schema or data work", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(get())).status).toBe(401);
  expect((await POST(post())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it.each([{}, { invalidActingUserId: 8 }, { sessionUser: { ...context.sessionUser, active: false } }, { workspaceUser: { ...context.workspaceUser, active: false } },
  { sessionUser: { ...context.sessionUser, role: "executive" }, workspaceUser: { ...context.workspaceUser, id: 8 }, isActing: true },
  { sessionUser: { ...context.sessionUser, role: "advancement_services" } }])("blocks unavailable/read-only contexts %j", async patch => {
  mocks.workspace.mockResolvedValue(Object.keys(patch).length ? { ...context, ...patch } : {});
  expect((await GET(get())).status).toBe(403);
  expect((await POST(post())).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("supports Admin delegation and derives owner and gift facts only on the server", async () => {
  const delegated = { ...context, sessionUser: { ...context.sessionUser, id: 2, role: "admin" }, isActing: true };
  mocks.workspace.mockResolvedValue(delegated);
  const response = await POST(post());
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ viewerId: "2", workspaceUserId: "7", task });
  expect(mocks.create).toHaveBeenCalledWith({ context: delegated, item, draft: body });
  expect(mocks.clear).toHaveBeenCalledWith(7);
});
it("rejects workspace changes and disabled helper", async () => {
  expect((await GET(get(9))).status).toBe(409);
  expect((await POST(post(body, {}, 9))).status).toBe(409);
  mocks.settings.mockResolvedValue({ dashboardAssistant: { enabled: false } });
  expect((await POST(post())).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ Origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }])("blocks cross-site submission %j", async headers => {
  expect((await POST(post(body, headers))).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled();
});
it.each([null, [], { ...body, ownerId: 99 }, { ...body, constituentId: "999" }, { ...body, giftAmount: 9999 },
  { ...body, key: "gift:../99" }, { ...body, revision: "old" }, { ...body, title: " " }, { ...body, title: "x".repeat(256) },
  { ...body, details: "x".repeat(10001) }, { ...body, dueDate: "2026-02-30" }, { ...body, dueDate: 123 }])("rejects invalid or authoritative client fields %#", async value => {
  expect((await POST(post(value))).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
});
it("bounds the streamed body and requires JSON", async () => {
  expect((await POST(post({ ...body, details: "x".repeat(48000) }))).status).toBe(413);
  expect((await POST(post(body, { "Content-Type": "text/plain" }))).status).toBe(415);
});
it.each([{ items: [] }, { items: [{ ...item, revision: "b".repeat(64) }] }])("blocks stale, removed, or unavailable gift candidates", async ({ items }) => {
  mocks.gifts.mockResolvedValue({ items });
  expect((await POST(post())).status).toBe(409); expect(mocks.create).not.toHaveBeenCalled();
});
it("recovers an existing completed follow-up even after source expiration, without rewriting it", async () => {
  mocks.read.mockResolvedValue({ ...task, status: "Done" });
  for (const response of [await GET(get()), await POST(post())]) {
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ alreadyExists: true, task: { status: "Done" } });
  }
  expect(mocks.read).toHaveBeenCalledWith(7, "900");
  expect(mocks.gifts).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("handles a concurrency winner and refuses a changed link at commit", async () => {
  mocks.create.mockResolvedValue({ ...task, already_exists: true });
  expect((await POST(post())).status).toBe(200);
  mocks.create.mockResolvedValue(null);
  expect((await POST(post())).status).toBe(409);
});
it("never misreports cache invalidation failure as a failed save, or leaks raw errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.clear.mockRejectedValue(new Error("private cache"));
  expect((await POST(post())).status).toBe(201);
  mocks.create.mockRejectedValue(new Error("private SQL"));
  const response = await POST(post());
  expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("private SQL");
  log.mockRestore();
});
