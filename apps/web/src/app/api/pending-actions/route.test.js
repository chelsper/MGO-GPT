import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const syncPrimaryPendingActionMock = vi.fn();
const syncPendingActionDiscussionMock = vi.fn();

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

vi.mock("@/app/api/utils/pendingActions", () => ({
  syncPrimaryPendingAction: syncPrimaryPendingActionMock,
  syncPendingActionDiscussion: syncPendingActionDiscussionMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("pending actions route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    syncPrimaryPendingActionMock.mockReset();
    syncPendingActionDiscussionMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
      },
      sessionUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
      },
    });
    syncPendingActionDiscussionMock.mockResolvedValue(null);
  });

  it("updates prospect next-step summary fields when creating a primary pending action", async () => {
    const { POST } = await import("./route.js");

    syncPrimaryPendingActionMock.mockResolvedValue({
      id: 901,
      prospect_id: 7,
      constituent_id: 88,
      title: "Schedule visit",
      due_date: "2026-06-18",
      status: "Open",
      is_primary: true,
      needs_discussion: false,
      discussion_note: null,
      discussion_item_id: null,
    });
    queueSqlResult([]);

    const request = new Request("https://example.com/api/pending-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectId: 7,
        constituentId: 88,
        title: "Schedule visit",
        dueDate: "2026-06-18",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.id).toBe(901);

    const updateCall = sqlMockImpl.mock.calls.find(([firstArg]) => {
      const text = Array.isArray(firstArg) ? firstArg.join("") : String(firstArg);
      return text.includes("UPDATE prospects");
    });

    expect(updateCall).toBeTruthy();
  });
});
