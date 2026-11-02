import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), schema: vi.fn(), read: vi.fn(), create: vi.fn(), gifts: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/directStewardshipAssistance", async original => ({ ...await original(), readDirectAssistance: mocks.read, createDirectAssistance: mocks.create }));
vi.mock("@/app/api/utils/stewardshipAssistance", () => ({ readAvailableStewardshipGifts: mocks.gifts }));
import { GET, POST } from "./route";

const context = { sessionUser: { id: 2, role: "admin", active: true }, workspaceUser: { id: 7, role: "mgo", active: true }, isActing: true };
const source = { constituentId: "100", opportunityId: null, requestId: null, requestKey: "d1f12d11-5cd3-43e4-8137-d1abaf9e2ed5" };
const params = { viewerId: "2", workspaceId: "7", constituentId: source.constituentId, requestKey: source.requestKey };
const draft = { type: "visit", instructions: "Please arrange a campus visit.", neededBy: "", contextVersion: "a".repeat(32) };
const request = (body, overrides = {}, headers = {}) => new Request(`https://example.test/api/stewardship/direct-request?${new URLSearchParams({ ...params, ...overrides })}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { email: "admin@example.test" } }); mocks.context.mockResolvedValue(context);
  mocks.read.mockResolvedValue({ context: { constituentId: "100", constituentName: "Sample Donor" }, contextVersion: draft.contextVersion, request: null });
  mocks.create.mockResolvedValue({ id: "11", already_exists: false }); mocks.gifts.mockResolvedValue([]);
});
it("loads verified context without writes and sends private no-store responses", async () => {
  const response = await GET(request()); expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ viewerId: "2", workspaceId: "7", contextVersion: draft.contextVersion });
  expect(mocks.read).toHaveBeenCalledWith(context, source); expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["gift", "letter", "recognition", "visit", "leadership", "impact", "guidance"])("creates a %s request in the shared workflow", async type => {
  mocks.read.mockResolvedValue({ context: { constituentId: "100" }, request: { id: "11" } });
  expect((await POST(request({ ...draft, type }))).status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(context, source, { ...draft, type, neededBy: null });
});
it("recovers a retry without creating another request", async () => {
  mocks.create.mockResolvedValue({ id: "11", already_exists: true });
  expect((await POST(request(draft))).status).toBe(200);
});
it.each([{ constituentName: "Forged" }, { ownerId: 99 }, { type: "__proto__" }, { instructions: " " }, { instructions: "x".repeat(4001) },
  { neededBy: "2026-02-30" }, { contextVersion: "bad" }, { giftItemId: "12" }, { giftItemSnapshot: { name: "Forged" } }])("rejects unsafe draft %o", async change => {
  expect((await POST(request({ ...draft, ...change }))).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ constituentId: "bad" }, { opportunityId: "0" }, { requestId: "11" }, { requestKey: "bad" }])("rejects invalid sources %o", async sourceChange => {
  expect((await POST(request(draft, sourceChange))).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ viewerId: "99" }, { workspaceId: "99" }])("rejects stale workspace %o", async change => {
  expect((await POST(request(draft, change))).status).toBe(409); expect(mocks.create).not.toHaveBeenCalled();
});
it.each([
  { ...context, sessionUser: { id: 2, role: "executive" } },
  { ...context, sessionUser: { id: 2, role: "mgo" } },
  { ...context, sessionUser: { id: 2, role: "admin", active: false } },
  { ...context, workspaceUser: { id: 7, role: "mgo", active: false } },
  { ...context, invalidActingUserId: 99 },
])("denies unauthorized contexts for reads and writes", async value => {
  mocks.context.mockResolvedValue(value); expect((await GET(request())).status).toBe(403); expect((await POST(request(draft))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("authenticates before schema access and rejects cross-site writes", async () => {
  expect((await POST(request(draft, {}, { Origin: "https://other.test" }))).status).toBe(403);
  expect((await POST(request(draft, {}, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  mocks.schema.mockClear(); mocks.auth.mockResolvedValue(null);
  expect((await POST(request(draft))).status).toBe(401); expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("reports stale context, unavailable donors and ambiguous saves safely", async () => {
  mocks.create.mockResolvedValue(null); expect((await POST(request(draft))).status).toBe(409);
  mocks.read.mockResolvedValue(null); expect((await GET(request())).status).toBe(404);
  mocks.read.mockRejectedValue(new Error("private database detail")); const response = await GET(request());
  expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("private database");
});
it("does not require an available gift catalog, and reads an existing request by ID", async () => {
  mocks.gifts.mockRejectedValue(new Error("Offline")); expect((await (await GET(request())).json()).giftChoices).toBeNull();
  mocks.gifts.mockClear(); mocks.read.mockResolvedValue({ request: { id: "11" } });
  expect((await GET(request(undefined, { requestId: "11", requestKey: "" }))).status).toBe(200);
  expect(mocks.gifts).not.toHaveBeenCalled();
});
