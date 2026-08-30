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

describe("list request response route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getOrCreateUserMock.mockReset();
    sendAdvancementServicesNotificationMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    sendAdvancementServicesNotificationMock.mockResolvedValue({ status: "sent" });
    getOrCreateUserMock.mockResolvedValue({
      id: 44,
      name: "MGO User",
      email: "mgo@example.com",
      role: "mgo",
    });
  });

  it("saves an MGO clarification response and moves the request back to pending", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([{ id: 12, status: "Needs Clarification" }]);
    queueSqlResult([
      {
        id: 12,
        user_id: 44,
        status: "Pending",
        requester_response: "Please include FY25 and FY26 donors.",
        reviewer_name: "Advancement Reviewer",
      },
    ]);

    const response = await POST(
      new Request("https://example.com/api/list-requests/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 12,
          clarificationResponse: "  Please include FY25 and FY26 donors.  ",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Pending");
    expect(payload.requester_response).toBe("Please include FY25 and FY26 donors.");
    expect(sqlMockImpl).toHaveBeenCalledTimes(2);
    expect(sqlMockImpl.mock.calls[0][1]).toEqual(12);
    expect(sqlMockImpl.mock.calls[0][2]).toEqual(44);
    expect(sqlMockImpl.mock.calls[1][1]).toEqual("Please include FY25 and FY26 donors.");
    expect(sqlMockImpl.mock.calls[1][2]).toEqual(12);
    expect(sqlMockImpl.mock.calls[1][3]).toEqual(44);
    expect(sendAdvancementServicesNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "List request clarification answered" }),
    );
  });

  it("rejects a blank clarification response", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      new Request("https://example.com/api/list-requests/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 12,
          clarificationResponse: "   ",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Clarification response is required");
    expect(sqlMockImpl).not.toHaveBeenCalled();
  });

  it("does not let an MGO answer another user's list request", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([]);

    const response = await POST(
      new Request("https://example.com/api/list-requests/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 12,
          clarificationResponse: "Here is the clarification.",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("List request not found");
    expect(sqlMockImpl).toHaveBeenCalledTimes(1);
  });

  it("only accepts responses for requests waiting on clarification", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([{ id: 12, status: "Pending" }]);

    const response = await POST(
      new Request("https://example.com/api/list-requests/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 12,
          clarificationResponse: "Here is the clarification.",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("This list request is not waiting on clarification.");
    expect(sqlMockImpl).toHaveBeenCalledTimes(1);
  });
});
