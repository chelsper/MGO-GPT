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
sqlTag.transaction = vi.fn(async (queries) => queries);

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

describe("prospect reorder route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    sqlTag.transaction.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
      },
    });
  });

  it("swaps active prospect ranks upward", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      { id: 10 },
      { id: 11 },
      { id: 12 },
    ]);
    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([{ id: 12, priority_order: 3 }]);
    queueSqlResult([{ id: 11, priority_order: 2 }]);
    queueSqlResult([]);
    queueSqlResult([]);

    const request = new Request("https://example.com/api/prospects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectId: 12,
        direction: "up",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true });
    expect(sqlTag.transaction).toHaveBeenCalledTimes(2);
  });

  it("returns a boundary message when the prospect is already first", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([{ id: 10 }]);
    queueSqlResult([]);
    queueSqlResult([{ id: 10, priority_order: 1 }]);
    queueSqlResult([]);

    const request = new Request("https://example.com/api/prospects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectId: 10,
        direction: "up",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ message: "Already at boundary" });
  });
});
