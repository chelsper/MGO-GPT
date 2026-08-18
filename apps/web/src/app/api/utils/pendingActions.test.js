import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureAppSchemaMock = vi.fn();

const sqlQueue = [];
function queueSqlResult(value) {
  sqlQueue.push(value);
}
const sqlMockImpl = vi.fn(async () => sqlQueue.shift() ?? []);
function sqlTag(strings, ...values) {
  return sqlMockImpl(strings, ...values);
}

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("pendingActions", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    ensureAppSchemaMock.mockReset();
    ensureAppSchemaMock.mockResolvedValue();
  });

  it("resolves a Blackbaud constituent id before creating a constituent-scoped next step", async () => {
    const { syncPrimaryPendingAction } = await import("./pendingActions.js");

    queueSqlResult([]);
    queueSqlResult([{ id: 88 }]);
    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 903,
        owner_user_id: 44,
        prospect_id: null,
        constituent_id: 88,
        title: "Call before the visit",
        status: "Open",
        is_primary: true,
      },
    ]);

    const result = await syncPrimaryPendingAction({
      ownerUserId: 44,
      prospectId: null,
      constituentId: "436887",
      title: "Call before the visit",
      dueDate: "2026-08-20",
    });

    expect(result).toMatchObject({ id: 903, constituent_id: 88 });

    const insertCall = sqlMockImpl.mock.calls.find(([firstArg]) => {
      const text = Array.isArray(firstArg) ? firstArg.join("") : String(firstArg);
      return text.includes("INSERT INTO pending_actions");
    });

    expect(insertCall).toBeTruthy();
    expect(insertCall.slice(1)).toContain(88);
  });

  it("resolves a Blackbaud constituent id before creating a linked discussion item", async () => {
    const { syncPendingActionDiscussion } = await import("./pendingActions.js");

    queueSqlResult([]);
    queueSqlResult([{ id: 88 }]);
    queueSqlResult([{ id: 501 }]);
    queueSqlResult([]);

    const discussionItemId = await syncPendingActionDiscussion({
      ownerUserId: 44,
      createdByUserId: 44,
      pendingActionId: 901,
      prospectId: null,
      constituentId: "436887",
      title: "Need strategy review",
      dueDate: "2026-08-22",
      needsDiscussion: true,
      discussionNote: "Please review before outreach.",
    });

    expect(discussionItemId).toBe(501);

    const insertCall = sqlMockImpl.mock.calls.find(([firstArg]) => {
      const text = Array.isArray(firstArg) ? firstArg.join("") : String(firstArg);
      return text.includes("INSERT INTO discussion_items");
    });

    expect(insertCall).toBeTruthy();
    expect(insertCall.slice(1)).toContain(88);
  });

  it("fails cleanly when a constituent-scoped next step references an unknown constituent", async () => {
    const { syncPrimaryPendingAction } = await import("./pendingActions.js");

    queueSqlResult([]);
    queueSqlResult([]);

    await expect(
      syncPrimaryPendingAction({
        ownerUserId: 44,
        prospectId: null,
        constituentId: "999999",
        title: "Call before the visit",
      }),
    ).rejects.toThrow("Selected constituent could not be found.");
  });
});
