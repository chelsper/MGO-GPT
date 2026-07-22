import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getProspectOpportunitiesMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const getPendingActionsForProspectMock = vi.fn();
const syncPrimaryPendingActionMock = vi.fn();

const sqlQueue = [];
function queueSqlResult(value) {
  sqlQueue.push(value);
}
const sqlMockImpl = vi.fn(async () => sqlQueue.shift() ?? []);
function sqlTag(stringsOrQuery, ...values) {
  return sqlMockImpl(stringsOrQuery, ...values);
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

vi.mock("@/app/api/utils/prospectOpportunities", () => ({
  getProspectOpportunities: getProspectOpportunitiesMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
}));

vi.mock("@/app/api/utils/pendingActions", () => ({
  getPendingActionsForProspect: getPendingActionsForProspectMock,
  syncPrimaryPendingAction: syncPrimaryPendingActionMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("prospect detail route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    getProspectOpportunitiesMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    getPendingActionsForProspectMock.mockReset();
    syncPrimaryPendingActionMock.mockReset();

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
      isActing: false,
    });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getProspectOpportunitiesMock.mockResolvedValue([]);
    getPendingActionsForProspectMock.mockResolvedValue([]);
    syncPrimaryPendingActionMock.mockResolvedValue(null);
  });

  it("refreshes imported opportunities without bumping updated_at on read", async () => {
    const { GET } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        user_id: 44,
        constituent_id: 88,
        linked_blackbaud_constituent_id: "234684",
      },
    ]);
    queueSqlResult([
      {
        id: 301,
        blackbaud_opportunity_id: "bb-opp-1",
        opportunity_status: "Active",
        ask_date: null,
        expected_date: null,
        closed_amount: null,
        close_date: null,
      },
    ]);
    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([]);

    blackbaudApiFetchMock.mockResolvedValue({
      id: "bb-opp-1",
      ask_date: "2026-05-01",
      expected_date: "2026-06-01",
      status: "Active",
    });

    const request = new Request("https://example.com/api/prospects/7");
    const response = await GET(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.prospect.id).toBe(7);

    const updateCall = sqlMockImpl.mock.calls.find(([firstArg]) => {
      const text = Array.isArray(firstArg) ? firstArg.join("") : String(firstArg);
      return text.includes("UPDATE prospect_opportunities");
    });

    expect(updateCall).toBeTruthy();
    const updateSql = Array.isArray(updateCall[0]) ? updateCall[0].join("") : String(updateCall[0]);
    expect(updateSql).not.toMatch(/updated_at\s*=/i);
  });

  it("syncs the primary pending action when next step fields are updated", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        status: "Active",
        constituent_id: 88,
        next_action_text: null,
        next_action_due_date: null,
        next_action_completed_at: null,
      },
    ]);
    queueSqlResult([
      {
        id: 7,
        constituent_id: 88,
        next_action_text: "Schedule visit",
        next_action_due_date: "2026-06-15",
        next_action_completed_at: null,
      },
    ]);

    const request = new Request("https://example.com/api/prospects/7", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nextActionText: "Schedule visit",
        nextActionDueDate: "2026-06-15",
      }),
    });

    const response = await PUT(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.id).toBe(7);
    expect(syncPrimaryPendingActionMock).toHaveBeenCalledWith({
      ownerUserId: 44,
      prospectId: 7,
      constituentId: 88,
      title: "Schedule visit",
      dueDate: "2026-06-15",
      completedAt: null,
    });
  });

  it("archives duplicate active top prospect rows for the same linked constituent", async () => {
    const { DELETE } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        constituent_id: 88,
        linked_blackbaud_constituent_id: "40126",
      },
    ]);
    queueSqlResult([
      {
        id: 7,
        status: "Archived",
        constituent_id: 88,
        blackbaud_constituent_id: "40126",
      },
      {
        id: 8,
        status: "Archived",
        constituent_id: 88,
        blackbaud_constituent_id: "40126",
      },
    ]);

    const response = await DELETE(
      new Request("https://example.com/api/prospects/7", {
        method: "DELETE",
      }),
      { params: { id: "7" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.archivedProspectIds).toEqual([7, 8]);
    expect(payload.archivedConstituentId).toBe(88);
    expect(payload.linkedBlackbaudConstituentId).toBe("40126");

    const updateCall = sqlMockImpl.mock.calls.find(([firstArg]) => {
      const text = Array.isArray(firstArg) ? firstArg.join("") : String(firstArg);
      return text.includes("matching_active_prospects");
    });

    expect(updateCall).toBeTruthy();
  });
});
