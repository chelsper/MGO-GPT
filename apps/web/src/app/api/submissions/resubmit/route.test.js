import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const sendAdvancementServicesNotificationMock = vi.fn();

const sqlQueue = [];
function queueSqlResult(value) {
  sqlQueue.push(value);
}
const sqlMockImpl = vi.fn(async () => sqlQueue.shift() ?? []);
function sqlTag(strings, ...values) {
  return sqlMockImpl(strings, ...values);
}

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getOrCreateUser", () => ({
  default: getOrCreateUserMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

vi.mock("@/app/api/utils/sendSubmissionEmail", () => ({
  sendAdvancementServicesNotification: sendAdvancementServicesNotificationMock,
}));

describe("submission resubmit route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getOrCreateUserMock.mockReset();
    sendAdvancementServicesNotificationMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({
      id: 44,
      name: "MGO User",
      email: "mgo@example.com",
      role: "mgo",
    });
    sendAdvancementServicesNotificationMock.mockResolvedValue({ status: "sent" });
  });

  it("notifies Advancement Services after a clarification response is saved", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([{ id: 12, notes: "Please verify the gift amount." }]);
    queueSqlResult([{ id: 12, status: "Pending", notes: "Updated notes" }]);

    const response = await POST(
      new Request("https://example.com/api/submissions/resubmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 12,
          clarificationResponse: "The amount should be $5,000.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ id: 12, status: "Pending" }),
    );
    expect(sendAdvancementServicesNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Submission clarification answered" }),
    );
  });
});
