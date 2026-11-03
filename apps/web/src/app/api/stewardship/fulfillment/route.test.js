import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  workspace: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  ack: vi.fn(),
  action: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: mocks.workspace,
}));
vi.mock("@/app/api/utils/stewardshipFulfillment", () => ({
  readFulfillmentRequest: mocks.read,
  saveFulfillment: mocks.save,
  acknowledgeFulfillment: mocks.ack,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudAction: mocks.action,
}));
const body = {
  requestId: "12",
  viewerKey: "2",
  version: 1,
  token: "91512c41-89cd-41be-946e-10a056cae491",
  stage: "received",
  date: "2000-10-01",
  note: "Handed to donor",
  confirmed: true,
  stockQuantity: 0,
  itemId: "4",
  actionId: null,
  followUp: null,
};
const request = (value = body, headers = {}) =>
  new Request("https://example.org/api/stewardship/fulfillment", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "staff@example.org" } });
  mocks.workspace.mockResolvedValue({
    sessionUser: { id: 2, role: "admin", active: true },
    workspaceUser: { id: 7, role: "mgo" },
  });
  mocks.read.mockResolvedValue({
    id: 12,
    request_version: 1,
    blackbaud_constituent_id: "100",
  });
  mocks.save.mockResolvedValue({ id: "12" });
  mocks.ack.mockResolvedValue({ request_id: 12 });
  mocks.action.mockResolvedValue({
    id: "501",
    constituent_id: "100",
    completed: true,
    completed_date: "2000-10-01",
  });
});
it("completes locally without any NXT call when no action is linked", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.action).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledOnce();
});
it("uses read-only verification for an existing action and never borrows the selected MGO connection", async () => {
  expect((await POST(request({ ...body, actionId: "501" }))).status).toBe(200);
  expect(mocks.action).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 2,
      authUserId: 2,
      actionId: "501",
      maxRetries: 0,
    }),
  );
  expect(mocks.save.mock.calls[0][2]).toEqual({
    actionId: "501",
    constituentId: "100",
    date: "2000-10-01",
  });
});
it.each([
  { id: "502" },
  { constituent_id: "999" },
  { completed: false },
  { completed_date: "2000-10-02" },
])("blocks mismatched existing actions %o", async (delta) => {
  mocks.action.mockResolvedValue({
    id: "501",
    constituent_id: "100",
    completed: true,
    completed_date: "2000-10-01",
    ...delta,
  });
  expect((await POST(request({ ...body, actionId: "501" }))).status).toBe(409);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps fulfillment unchanged when NXT is unavailable", async () => {
  mocks.action.mockRejectedValue(new Error("private provider body"));
  const response = await POST(request({ ...body, actionId: "501" }));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private provider");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not authorize staff writes through an MGO's selected workspace", async () => {
  mocks.workspace.mockResolvedValue({
    sessionUser: { id: 2, role: "mgo" },
    workspaceUser: { id: 7, role: "admin" },
  });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each([
  { origin: "https://evil.example" },
  { "sec-fetch-site": "cross-site" },
  { "content-type": "text/plain" },
])("rejects cross-site or non-JSON writes %o", async (headers) => {
  expect((await POST(request(body, headers))).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("checks identity, input limits, request version conflict, and ambiguous save recovery", async () => {
  expect((await POST(request({ ...body, viewerKey: "7" }))).status).toBe(409);
  expect(
    (await POST(request({ ...body, note: "x".repeat(17000) }))).status,
  ).toBe(413);
  mocks.save.mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(409);
  mocks.save.mockRejectedValueOnce(new Error("private db details"));
  const failed = await POST(request());
  expect(failed.status).toBe(500);
  expect(await failed.text()).not.toContain("private db");
});
it("GET only reads authorized saved status and never calls NXT", async () => {
  expect(
    (
      await GET(
        new Request(
          "https://example.org/api/stewardship/fulfillment?requestId=12&viewerKey=2",
        ),
      )
    ).status,
  ).toBe(200);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.action).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue(null);
  expect(
    (
      await GET(
        new Request(
          "https://example.org/api/stewardship/fulfillment?requestId=12&viewerKey=2",
        ),
      )
    ).status,
  ).toBe(404);
});
it("allows an MGO to acknowledge only their own versioned update", async () => {
  mocks.workspace.mockResolvedValue({ sessionUser: { id: 2, role: "mgo" } });
  expect(
    (
      await POST(
        request({
          operation: "acknowledge",
          requestId: "12",
          viewerKey: "2",
          version: 2,
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.ack).toHaveBeenCalledWith(
    expect.objectContaining({ id: 2 }),
    "12",
    2,
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
