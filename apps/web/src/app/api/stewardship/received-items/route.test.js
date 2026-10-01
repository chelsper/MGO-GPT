import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  context: vi.fn(),
  schema: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/stewardshipReceipts", () => ({
  readGiftReceipts: mocks.read,
  writeGiftReceipt: mocks.write,
}));
import { GET, POST } from "./route";
const body = {
  operation: "record",
  viewerKey: "2",
  requestId: "22",
  version: 1,
  itemId: "12",
  token: "74512c41-89cd-41be-946e-10a056cae491",
  receivedOn: "2026-09-30",
  note: "Hand delivered",
  confirmed: true,
};
const url = "https://example.test/api/stewardship/received-items";
const post = (change = {}, headers = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...body, ...change }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: "auth-user", email: "staff@example.test" },
  });
  mocks.context.mockResolvedValue({
    sessionUser: { id: 2, role: "advancement_services", active: true },
    workspaceUser: { id: 7, role: "mgo" },
  });
  mocks.read.mockResolvedValue([{ id: "1", constituent_name: "Sample donor" }]);
  mocks.write.mockResolvedValue({
    id: "1",
    request_id: "22",
    request_version: 2,
  });
});
it("uses the actual actor, binds the response and disables caching", async () => {
  const result = await GET(new Request(`${url}?itemId=12&search=Donor`));
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(await result.json()).toMatchObject({
    viewerKey: "2",
    sessionKey: "auth-user",
    canManage: true,
    next: null,
  });
  expect(mocks.read.mock.calls[0][0].id).toBe(2);
  expect(mocks.read.mock.calls[0][1]).toMatchObject({
    itemId: "12",
    search: "Donor",
  });
  expect((await POST(post())).status).toBe(200);
  expect(mocks.write.mock.calls[0][0].id).toBe(2);
});
it("returns 50 records with a continuation cursor", async () => {
  mocks.read.mockResolvedValue(
    Array.from({ length: 51 }, (_, index) => ({ id: String(100 - index) })),
  );
  const result = await (await GET(new Request(url))).json();
  expect(result.items).toHaveLength(50);
  expect(result.next).toBe("51");
});
it("allows an MGO scoped read, not a write or a borrowed reviewer role", async () => {
  mocks.context.mockResolvedValue({
    sessionUser: { id: 7, role: "mgo" },
    workspaceUser: { id: 2, role: "admin" },
  });
  expect((await (await GET(new Request(url))).json()).canManage).toBe(false);
  expect(mocks.read.mock.calls[0][0]).toEqual({ id: 7, role: "mgo" });
  expect((await POST(post({ viewerKey: "7" }))).status).toBe(403);
  expect(mocks.write).not.toHaveBeenCalled();
});
it.each(["executive", "", "unknown"])(
  "denies %s reads and writes",
  async (role) => {
    mocks.context.mockResolvedValue({ sessionUser: { id: 2, role } });
    expect((await GET(new Request(url))).status).toBe(403);
    expect((await POST(post())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  },
);
it("rejects inactive/unauthenticated sessions without disclosing data", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await GET(new Request(url))).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  mocks.context.mockResolvedValue({
    sessionUser: { id: 2, role: "admin", active: false },
  });
  expect((await POST(post())).status).toBe(403);
});
it("rejects cross-site writes, forged payloads and session changes", async () => {
  expect((await POST(post({}, { Origin: "https://evil.test" }))).status).toBe(
    403,
  );
  expect(
    (await POST(post({}, { "Sec-Fetch-Site": "cross-site" }))).status,
  ).toBe(403);
  expect((await POST(post({ constituentId: "forged" }))).status).toBe(400);
  expect((await POST(post({ confirmed: false }))).status).toBe(400);
  expect((await POST(post({ viewerKey: "7" }))).status).toBe(409);
  expect(mocks.write).not.toHaveBeenCalled();
});
it("reports conflicts and uncertain saves rather than claiming success", async () => {
  mocks.write.mockResolvedValueOnce(null);
  expect((await POST(post())).status).toBe(409);
  mocks.write.mockRejectedValueOnce(new Error("private database details"));
  const result = await POST(post());
  expect(result.status).toBe(500);
  expect(await result.text()).not.toContain("private database details");
  expect((await GET(new Request(`${url}?before=bad`))).status).toBe(400);
});
