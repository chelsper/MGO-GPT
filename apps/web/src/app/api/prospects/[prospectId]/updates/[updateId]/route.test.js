import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const deleteBlackbaudActionMock = vi.fn();
const getBlackbaudActionMock = vi.fn();
const updateBlackbaudActionMock = vi.fn();

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
  getBlackbaudAction: getBlackbaudActionMock,
  updateBlackbaudAction: updateBlackbaudActionMock,
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
    getBlackbaudActionMock.mockReset();
    updateBlackbaudActionMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: { id: 44, email: "mgo@example.com" },
      sessionUser: { id: 44, email: "mgo@example.com" },
    });
  });

  it("updates a local-only activity without calling Blackbaud", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 17,
        prospect_id: 7,
        blackbaud_action_id: null,
      },
    ]);
    queueSqlResult([
      {
        id: 17,
        prospect_id: 7,
        update_notes: "Edited notes",
      },
    ]);
    queueSqlResult([]);

    const response = await PUT(
      new Request("https://example.com/api/prospects/7/updates/17", {
        method: "PUT",
        body: JSON.stringify({
          updateDate: "2026-06-17",
          updateNotes: "Edited notes",
        }),
      }),
      { params: { prospectId: "7", updateId: "17" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.blackbaudSync.status).toBe("local-only");
    expect(updateBlackbaudActionMock).not.toHaveBeenCalled();
  });

  it("updates the synced NXT action before saving local activity edits", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 18,
        prospect_id: 7,
        update_title: "Lunch meeting",
        blackbaud_action_id: "bb-action-18",
      },
    ]);
    queueSqlResult([
      {
        id: 18,
        prospect_id: 7,
        update_notes: "Edited synced notes",
        blackbaud_action_id: "bb-action-18",
      },
    ]);
    queueSqlResult([]);
    updateBlackbaudActionMock.mockResolvedValue({ ok: true });

    const response = await PUT(
      new Request("https://example.com/api/prospects/7/updates/18", {
        method: "PUT",
        body: JSON.stringify({
          updateDate: "2026-06-17",
          updateNotes: "Edited synced notes",
        }),
      }),
      { params: { prospectId: "7", updateId: "18" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.blackbaudSync.status).toBe("synced");
    expect(updateBlackbaudActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "bb-action-18",
        authUserId: 44,
        payload: expect.objectContaining({
          date: "2026-06-17T00:00:00Z",
          completed: true,
          completed_date: "2026-06-17",
          summary: "Lunch meeting",
          description: "Edited synced notes",
        }),
      }),
    );
  });

  it("does not save local activity edits when the synced NXT action update fails", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 19,
        prospect_id: 7,
        update_title: "Lunch meeting",
        blackbaud_action_id: "bb-action-19",
      },
    ]);
    updateBlackbaudActionMock.mockRejectedValue(new Error("NXT unavailable"));

    const response = await PUT(
      new Request("https://example.com/api/prospects/7/updates/19", {
        method: "PUT",
        body: JSON.stringify({
          updateDate: "2026-06-17",
          updateNotes: "Edited synced notes",
        }),
      }),
      { params: { prospectId: "7", updateId: "19" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toMatch(/Could not update the synced NXT activity/i);
    expect(sqlMockImpl).toHaveBeenCalledTimes(1);
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
    getBlackbaudActionMock.mockRejectedValue(new Error("Blackbaud 404 Not Found"));

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

  it("stops local cleanup if the linked NXT action still exists after delete", async () => {
    const { DELETE } = await import("./route.js");

    queueSqlResult([
      {
        id: 14,
        prospect_id: 7,
        blackbaud_action_id: "bb-action-10",
      },
    ]);
    deleteBlackbaudActionMock.mockResolvedValue({ ok: true });
    getBlackbaudActionMock.mockResolvedValue({ id: "bb-action-10" });

    const response = await DELETE(
      new Request("https://example.com/api/prospects/7/updates/14", {
        method: "DELETE",
      }),
      { params: { prospectId: "7", updateId: "14" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toMatch(/still appears to exist/i);
  });

  it("removes a synced activity from the app only when requested", async () => {
    const { DELETE } = await import("./route.js");

    queueSqlResult([
      {
        id: 15,
        prospect_id: 7,
        blackbaud_action_id: "bb-action-11",
      },
    ]);
    queueSqlResult([
      {
        id: 15,
        prospect_id: 7,
        blackbaud_action_id: "bb-action-11",
      },
    ]);
    queueSqlResult([]);

    const response = await DELETE(
      new Request("https://example.com/api/prospects/7/updates/15?localOnly=1", {
        method: "DELETE",
      }),
      { params: { prospectId: "7", updateId: "15" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deleted).toBe(true);
    expect(payload.blackbaudSync.status).toBe("local-only");
    expect(deleteBlackbaudActionMock).not.toHaveBeenCalled();
    expect(getBlackbaudActionMock).not.toHaveBeenCalled();
  });

  it("returns a clear error when the connection lacks the Blackbaud delete scope", async () => {
    const { DELETE } = await import("./route.js");

    queueSqlResult([
      {
        id: 16,
        prospect_id: 7,
        blackbaud_action_id: "bb-action-12",
      },
    ]);
    deleteBlackbaudActionMock.mockRejectedValue(
      new Error(
        "Blackbaud 403 Forbidden: Required scope access for this SKY API operation: 'rnxt.d'. Current scope access: rnxt.r,rnxt.w.",
      ),
    );

    const response = await DELETE(
      new Request("https://example.com/api/prospects/7/updates/16", {
        method: "DELETE",
      }),
      { params: { prospectId: "7", updateId: "16" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/rnxt\.d delete scope/i);
    expect(payload.error).toMatch(/Reconnect Blackbaud/i);
  });
});
