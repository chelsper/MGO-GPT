import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const deleteBlackbaudActionMock = vi.fn();

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

vi.mock("@/app/api/utils/blackbaud", () => ({
  deleteBlackbaudAction: deleteBlackbaudActionMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("prospect update route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    deleteBlackbaudActionMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: { id: 44, email: "mgo@example.com" },
      sessionUser: { id: 44, email: "mgo@example.com" },
    });
  });

  it("deletes a local-only activity", async () => {
    const { DELETE } = await import("./route.js");

    queueSqlResult([
      {
        id: 12,
        prospect_id: 7,
        blackbaud_action_id: null,
      },
    ]);
    queueSqlResult([
      {
        id: 12,
        prospect_id: 7,
      },
    ]);
    queueSqlResult([]);

    const response = await DELETE(
      new Request("https://example.com/api/prospects/7/updates/12", {
        method: "DELETE",
      }),
      { params: { prospectId: "7", updateId: "12" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deleted).toBe(true);
    expect(deleteBlackbaudActionMock).not.toHaveBeenCalled();
  });

  it("deletes the synced NXT action before removing the local activity", async () => {
    const { DELETE } = await import("./route.js");

    queueSqlResult([
      {
        id: 13,
        prospect_id: 7,
        blackbaud_action_id: "bb-action-9",
      },
    ]);
    queueSqlResult([
      {
        id: 13,
        prospect_id: 7,
        blackbaud_action_id: "bb-action-9",
      },
    ]);
    queueSqlResult([]);
    deleteBlackbaudActionMock.mockResolvedValue({ ok: true });

    const response = await DELETE(
      new Request("https://example.com/api/prospects/7/updates/13", {
        method: "DELETE",
      }),
      { params: { prospectId: "7", updateId: "13" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deleted).toBe(true);
    expect(payload.blackbaudSync.status).toBe("deleted");
    expect(deleteBlackbaudActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "bb-action-9",
        authUserId: 44,
      }),
    );
  });
});
