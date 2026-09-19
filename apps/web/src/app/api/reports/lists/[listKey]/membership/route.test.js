import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  record: vi.fn(),
  add: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/listConfigurations", async (original) => ({
  ...(await original()),
  getListRecord: mocks.record,
}));
vi.mock("@/app/api/utils/constituentListMembership", () => ({
  addListMember: mocks.add,
}));
import { POST } from "./route";
const record = {
  report_key: "list-demo",
  title: "Demo",
  active: true,
  specific_user_ids: [1],
  revision: "1",
  data_configuration: {
    version: 1,
    source: "custom_field",
    fieldCategory: "Interests",
    fieldDescription: "Golf",
  },
};
const body = { action: "add", constituentId: "123", revision: "1" };
const params = { params: { listKey: "list-demo" } };
const req = (data = body, headers = {}) =>
  new Request("https://example.test/api/reports/lists/list-demo/membership", {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "test@example.test" } });
  mocks.user.mockResolvedValue({ id: 1, active: true, role: "admin" });
  mocks.record.mockResolvedValue(record);
  mocks.add.mockImplementation(async ({ beforeWrite }) => {
    await beforeWrite();
    return { status: "added" };
  });
});
it("uses only server-side source and rechecks permissions before writing", async () => {
  expect((await POST(req(), params)).status).toBe(200);
  expect(mocks.record).toHaveBeenCalledTimes(3);
  expect(mocks.add).toHaveBeenCalledWith(
    expect.objectContaining({
      source: record.data_configuration,
      constituentId: "123",
    }),
  );
});
it("requires active, explicitly selected managers, not just report viewers", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await POST(req(), params)).status).toBe(401);
  for (const user of [
    { id: 1, active: false, role: "admin" },
    { id: 2, active: true, role: "admin" },
    { id: 1, active: true, role: "mgo" },
  ]) {
    mocks.user.mockResolvedValueOnce(user);
    expect((await POST(req(), params)).status).toBe(403);
  }
  expect(mocks.add).not.toHaveBeenCalled();
});
it("rejects cross-origin, stale revisions, arbitrary category and malformed IDs", async () => {
  expect(
    (await POST(req(body, { origin: "https://elsewhere.test" }), params))
      .status,
  ).toBe(403);
  expect((await POST(req({ ...body, revision: "0" }), params)).status).toBe(
    409,
  );
  expect((await POST(req({ ...body, source: {} }), params)).status).toBe(400);
  expect(
    (await POST(req({ ...body, constituentId: "../123" }), params)).status,
  ).toBe(400);
  expect(mocks.add).not.toHaveBeenCalled();
});
it("stops when configuration changes before write", async () => {
  mocks.record
    .mockResolvedValueOnce(record)
    .mockResolvedValueOnce({ ...record, revision: "2" });
  expect((await POST(req(), params)).status).toBe(409);
});
