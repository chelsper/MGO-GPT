import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), load: vi.fn(), create: vi.fn(), clear: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/discussionNextStep", () => ({ loadDiscussionNextStep: mocks.load, createDiscussionNextStep: mocks.create }));
vi.mock("@/app/api/utils/userDataCache", () => ({ clearUserDashboardDataCaches: mocks.clear }));
import { GET, POST } from "./route";

let data, context;
const version = "2026-09-16 12:00:00.123456+00";
const params = { params: { id: "9" } };
const request = (body, workspaceId = 7) => new Request(`https://example.com/api/discussion-items/9/next-step?workspaceId=${workspaceId}`, body === undefined ? {} : {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const draft = () => ({ expectedWorkspaceId: 7, expectedUpdatedAt: version, ownerId: 7, topicKey: "nxt:123", title: "Call donor", details: "Prepare", dueDate: "2026-09-20" });
beforeEach(() => {
  vi.clearAllMocks();
  context = { sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true };
  data = { discussion: { id: 9, subject: "Plan visit", body: "Notes", version },
    topics: [{ key: "nxt:123", name: "Donor", constituent_id: 10, blackbaud_constituent_id: "123", user_id: 7 }],
    owners: [{ id: 7, name: "Selected MGO", role: "mgo" }], tasks: [] };
  mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
  mocks.context.mockImplementation(async () => context);
  mocks.load.mockImplementation(async () => data);
  mocks.create.mockResolvedValue({ id: 50, owner_user_id: 7, status: "Open", already_exists: false });
  mocks.clear.mockResolvedValue(undefined);
});
it("loads saved context without creating a task and does not expose private task notes", async () => {
  const response = await GET(request(), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(expect.objectContaining({ workspaceId: 7, viewerId: 2,
    topics: [{ key: "nxt:123", name: "Donor", ownerId: null }], owners: [{ id: 7, name: "Selected MGO" }] }));
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("creates an additional task for the selected owner with the signed-in author context", async () => {
  const response = await POST(request(draft()), params);
  expect(response.status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ context, owner: data.owners[0], topic: data.topics[0], draft: draft() }));
  expect(mocks.clear).toHaveBeenCalledWith(7);
});
it.each(["GET", "POST"])("requires authentication for %s", async method => {
  mocks.auth.mockResolvedValue(null);
  expect((await (method === "GET" ? GET(request(), params) : POST(request(draft()), params))).status).toBe(401);
  expect(mocks.load).not.toHaveBeenCalled();
});
it.each(["GET", "POST"])("blocks read-only acting workspaces for %s", async method => {
  context.sessionUser.role = "executive";
  expect((await (method === "GET" ? GET(request(), params) : POST(request(draft()), params))).status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("rejects an invalid acting workspace", async () => {
  context.invalidActingUserId = 90;
  expect((await POST(request(draft()), params)).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects a switched workspace before reading the discussion", async () => {
  expect((await POST(request({ ...draft(), expectedWorkspaceId: 99 }), params)).status).toBe(409);
  expect((await GET(request(undefined, 99), params)).status).toBe(409);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("does not expose a discussion outside the workspace", async () => {
  data = null;
  expect((await POST(request(draft()), params)).status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("requires an exact discussion version", async () => {
  expect((await POST(request({ ...draft(), expectedUpdatedAt: "2026-09-16T12:00:00.123Z" }), params)).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ ownerId: 99 }, { topicKey: "nxt:unknown" }, { topicKey: "" }, { topicKey: "general" }])("rejects a forged or missing owner/topic: %j", async changes => {
  expect((await POST(request({ ...draft(), ...changes }), params)).status).toBe(changes.ownerId ? 403 : 400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("does not attach a foreign local-only constituent to a new owner", async () => {
  data.topics = [{ key: "local:10", name: "Local donor", constituent_id: 10, user_id: 8 }];
  expect((await POST(request({ ...draft(), topicKey: "local:10" }), params)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ title: " " }, { title: "x".repeat(256) }, { details: "x".repeat(10001) }, { dueDate: "2026-02-30" }, { dueDate: undefined }, { isPrimary: true }, { needsDiscussion: true }, { status: "Done" }])("validates fields before writing: %j", async changes => {
  expect((await POST(request({ ...draft(), ...changes }), params)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("allows a no-date general follow-up", async () => {
  data.topics = [{ key: "general", name: "General follow-up (no constituent)" }];
  expect((await POST(request({ ...draft(), topicKey: "general", dueDate: null }), params)).status).toBe(201);
});
it("returns the existing task on a repeat submission, including completed history", async () => {
  mocks.create.mockResolvedValue({ id: 50, owner_user_id: 7, status: "Done", already_exists: true });
  const response = await POST(request(draft()), params);
  expect(response.status).toBe(200);
  expect((await response.json()).message).toContain("No duplicate");
});
it("rejects changes detected at the transactional write boundary", async () => {
  mocks.create.mockResolvedValue(null);
  expect((await POST(request(draft()), params)).status).toBe(409);
  expect(mocks.clear).not.toHaveBeenCalled();
});
it("preserves a committed success if cache invalidation fails", async () => {
  mocks.clear.mockRejectedValue(new Error("Cache unavailable"));
  expect((await POST(request(draft()), params)).status).toBe(201);
});
