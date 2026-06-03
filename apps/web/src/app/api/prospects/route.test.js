import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const resolveConstituentMock = vi.fn();
const syncPrimaryPendingActionMock = vi.fn();
const getBlackbaudActionMock = vi.fn();
const getBlackbaudOpportunityMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();

const sqlQueue = [];
function queueSqlResult(value) {
  sqlQueue.push(value);
}
const sqlMockImpl = vi.fn(async () => sqlQueue.shift() ?? []);
function sqlTag(strings, ...values) {
  return sqlMockImpl(strings, ...values);
}
sqlTag.transaction = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/constituents", () => ({
  resolveConstituent: resolveConstituentMock,
}));

vi.mock("@/app/api/utils/pendingActions", () => ({
  syncPrimaryPendingAction: syncPrimaryPendingActionMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudAction: getBlackbaudActionMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudOpportunity: getBlackbaudOpportunityMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("prospects route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    resolveConstituentMock.mockReset();
    syncPrimaryPendingActionMock.mockReset();
    getBlackbaudActionMock.mockReset();
    getBlackbaudOpportunityMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();

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
  });

  it("merges linked NXT action and opportunity activity into latest_activity_at", async () => {
    const { GET } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        prospect_name: "Pat Prospect",
        latest_activity_at: "2026-05-01T12:00:00.000Z",
      },
    ]);
    queueSqlResult([
      {
        prospect_id: 7,
        blackbaud_action_id: "bb-action-1",
      },
    ]);
    queueSqlResult([
      {
        prospect_id: 7,
        blackbaud_opportunity_id: "bb-opp-1",
      },
    ]);

    getBlackbaudActionMock.mockResolvedValue({
      id: "bb-action-1",
      date: "2026-05-15T12:00:00.000Z",
    });
    getBlackbaudOpportunityMock.mockResolvedValue({
      id: "bb-opp-1",
      updated_at: "2026-05-20T09:30:00.000Z",
    });

    const request = new Request("https://example.com/api/prospects");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0].latest_blackbaud_activity_at).toBe("2026-05-20T09:30:00.000Z");
    expect(payload[0].latest_activity_at).toBe("2026-05-20T09:30:00.000Z");
  });
});
