import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();

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

function createRequest(body) {
  return new Request("https://example.com/api/discussion-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("discussion items route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
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

  it("uses the prospect's local constituent id when present", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([{ id: 98, constituent_id: 777 }]);
    queueSqlResult([
      {
        id: 12,
        owner_user_id: 44,
        created_by: 44,
        assigned_user_id: null,
        prospect_id: 98,
        constituent_id: 777,
        subject: "Prep for visit",
        status: "Open",
      },
    ]);

    const response = await POST(
      createRequest({
        prospectId: 98,
        constituentId: "999999",
        subject: "Prep for visit",
      }),
    );

    expect(response.status).toBe(201);
    const insertCall = sqlMockImpl.mock.calls[1];
    expect(insertCall[4]).toBe(98);
    expect(insertCall[5]).toBe(777);
  });

  it("maps a Blackbaud constituent id to the local constituent id before insert", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([]);
    queueSqlResult([{ id: 333 }]);
    queueSqlResult([
      {
        id: 13,
        owner_user_id: 44,
        created_by: 44,
        assigned_user_id: null,
        prospect_id: null,
        constituent_id: 333,
        subject: "Need strategy input",
        status: "Open",
      },
    ]);

    const response = await POST(
      createRequest({
        constituentId: "436887",
        subject: "Need strategy input",
      }),
    );

    expect(response.status).toBe(201);
    const insertCall = sqlMockImpl.mock.calls[2];
    expect(insertCall[5]).toBe(333);
  });

  it("stores a null constituent id when no local match exists", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 14,
        owner_user_id: 44,
        created_by: 44,
        assigned_user_id: null,
        prospect_id: null,
        constituent_id: null,
        subject: "General planning",
        status: "Open",
      },
    ]);

    const response = await POST(
      createRequest({
        constituentId: "999999",
        subject: "General planning",
      }),
    );

    expect(response.status).toBe(201);
    const insertCall = sqlMockImpl.mock.calls[2];
    expect(insertCall[5]).toBeNull();
  });
});
