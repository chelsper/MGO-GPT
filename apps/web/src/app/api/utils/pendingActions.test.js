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
    const existingQuery = sqlMockImpl.mock.calls.find(([parts]) => parts.join("").includes("FROM pending_actions"));
    expect(existingQuery[0].join("")).toContain("AND status = 'Open'");
  });

  it("preserves completed primary rows when adding the next prospect step", async () => {
    const { syncPrimaryPendingAction } = await import("./pendingActions.js");
    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([{ id: 904, title: "New step", status: "Open" }]);
    const result = await syncPrimaryPendingAction({ ownerUserId: 44, prospectId: 10, title: "New step" });
    expect(result.id).toBe(904);
    const queries = sqlMockImpl.mock.calls.map(([parts]) => parts.join("?"));
    expect(queries[0]).toContain("AND status = 'Open'");
    expect(queries[1]).toContain("SET is_primary = FALSE, updated_at = NOW()");
    expect(queries[1]).not.toContain("status =");
    expect(queries[2]).toContain("INSERT INTO pending_actions");
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

  it.each([true, false])("only reopens a linked discussion when requested: %s", async (reopenExisting) => {
    const { syncPendingActionDiscussion } = await import("./pendingActions.js");
    queueSqlResult([{ id: 501 }]);
    await syncPendingActionDiscussion({ ownerUserId: 44, pendingActionId: 901, title: "Call", needsDiscussion: true, existingDiscussionItemId: 501, reopenExisting });
    const [parts, ...values] = sqlMockImpl.mock.calls[0];
    expect(parts.join("?")).toContain("status = CASE WHEN ? THEN 'Open' ELSE status END");
    expect(values).toContain(reopenExisting);
  });
});
