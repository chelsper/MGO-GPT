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

function listRequest() {
  return new Request("https://example.com/api/discussion-items?status=Open");
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

  it("links a Blackbaud constituent discussion to the owner's local prospect", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([]);
    queueSqlResult([{ id: 333 }]);
    queueSqlResult([{ id: 98 }]);
    queueSqlResult([
      {
        id: 13,
        owner_user_id: 44,
        created_by: 44,
        assigned_user_id: null,
        prospect_id: 98,
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
    const insertCall = sqlMockImpl.mock.calls[3];
    expect(insertCall[4]).toBe(98);
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

  it("creates one discussion linked to multiple selected NXT constituents", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      { id: 501, name: "Anna Arribas", blackbaud_constituent_id: "242718" },
    ]);
    queueSqlResult([]);
    queueSqlResult([
      { id: 502, name: "Rafael Arribas", blackbaud_constituent_id: "227337" },
    ]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 15,
        owner_user_id: 44,
        constituent_id: 501,
        subject: "PPC strategy",
        status: "Open",
      },
    ]);
    queueSqlResult([]);
    queueSqlResult([]);

    const response = await POST(
      createRequest({
        subject: "PPC strategy",
        linkedConstituents: [
          { blackbaudConstituentId: "242718", name: "Anna Arribas" },
          { blackbaudConstituentId: "227337", name: "Rafael Arribas" },
          { blackbaudConstituentId: "242718", name: "Duplicate" },
        ],
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.linked_constituents).toEqual([
      {
        constituent_id: 501,
        blackbaudConstituentId: "242718",
        name: "Anna Arribas",
      },
      {
        constituent_id: 502,
        blackbaudConstituentId: "227337",
        name: "Rafael Arribas",
      },
    ]);
    expect(String(sqlMockImpl.mock.calls[6][0])).toContain(
      "INSERT INTO discussion_item_constituents",
    );
    expect(sqlMockImpl.mock.calls[6][1]).toEqual([15, 501, 0, 502, 1]);
  });

  it("returns every constituent topic in saved order", async () => {
    const { GET } = await import("./route.js");

    queueSqlResult([
      {
        id: 16,
        owner_user_id: 44,
        prospect_id: 88,
        constituent_id: 501,
        constituent_name: "Anna Arribas",
        blackbaud_constituent_id: "242718",
        subject: "PPC strategy",
      },
    ]);
    queueSqlResult([]);
    queueSqlResult([
      {
        discussion_item_id: 16,
        constituent_id: 501,
        blackbaud_constituent_id: "242718",
        name: "Anna Arribas",
      },
      {
        discussion_item_id: 16,
        constituent_id: 502,
        blackbaud_constituent_id: "227337",
        name: "Rafael Arribas",
      },
    ]);

    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload[0].linked_constituents.map((entry) => entry.name)).toEqual([
      "Anna Arribas",
      "Rafael Arribas",
    ]);
    expect(payload[0].linked_constituents[0].isPrimaryAnchor).toBe(true);
  });
});
