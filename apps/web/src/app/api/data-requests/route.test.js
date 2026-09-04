import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
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

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

vi.mock("@/app/api/utils/sendSubmissionEmail", () => ({
  sendAdvancementServicesNotification: sendAdvancementServicesNotificationMock,
}));

describe("data requests route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sendAdvancementServicesNotificationMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    sendAdvancementServicesNotificationMock.mockResolvedValue({ status: "sent" });
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 44,
        name: "MGO User",
        email: "mgo@example.com",
        role: "mgo",
      },
      workspaceUser: {
        id: 44,
        name: "MGO User",
        email: "mgo@example.com",
        role: "mgo",
      },
      isActing: false,
    });
  });

  it("creates a data request from a constituent record", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([]);
    queueSqlResult([
      {
        id: 12,
        requester_user_id: 44,
        owner_user_id: 44,
        blackbaud_constituent_id: "572405",
        constituent_name: "Megan Piggott",
        request_type: "Contact info update",
        request_note: "Please update phone number.",
        status: "Open",
      },
    ]);

    const response = await POST(
      new Request("https://example.com/api/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituentName: "Megan Piggott",
          blackbaudConstituentId: "572405",
          requestType: "Contact info update",
          requestNote: "Please update phone number.",
          sourceContext: "prospect_detail",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.status).toBe("Open");
    expect(payload.constituent_name).toBe("Megan Piggott");
    expect(sendAdvancementServicesNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New data request" }),
    );
  });

  it("creates a research request from a constituent record", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([]);
    queueSqlResult([
      {
        id: 13,
        requester_user_id: 44,
        owner_user_id: 44,
        blackbaud_constituent_id: "572405",
        constituent_name: "Megan Piggott",
        request_type: "Research request",
        request_note: "Please research capacity and employment.",
        status: "Open",
      },
    ]);

    const response = await POST(
      new Request("https://example.com/api/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituentName: "Megan Piggott",
          blackbaudConstituentId: "572405",
          requestType: "Research request",
          requestNote: "Please research capacity and employment.",
          sourceContext: "prospect_detail",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.request_type).toBe("Research request");
  });

  it("uses the actual reviewer in reviewer view even with an acting-MGO workspace", async () => {
    const { GET } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValue({ sessionUser: { id: 7, role: "admin" }, workspaceUser: { id: 44, role: "mgo" } });
    const response = await GET(new Request("https://example.com/api/data-requests?view=reviewer"));
    expect(response.status).toBe(200);
    expect(sqlMockImpl.mock.calls[0][0].join(" ")).not.toContain("dcr.requester_user_id =");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("ignores a forged reviewer view from an MGO", async () => {
    const { GET } = await import("./route.js");
    await GET(new Request("https://example.com/api/data-requests?view=reviewer"));
    expect(sqlMockImpl.mock.calls[0][0].join(" ")).toContain("dcr.requester_user_id =");
    expect(sqlMockImpl.mock.calls[0].slice(1)).toContain(44);
  });

  it("lets Advancement Services view the shared queue", async () => {
    const { GET } = await import("./route.js");

    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
      workspaceUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
      isActing: false,
    });
    queueSqlResult([
      {
        id: 12,
        constituent_name: "Megan Piggott",
        status: "Open",
      },
    ]);

    const response = await GET(new Request("https://example.com/api/data-requests"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(sqlMockImpl.mock.calls[0][0].join(" ")).toContain("FROM data_change_requests");
  });
});
