import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const syncProspectAskAmountMock = vi.fn();
const buildBlackbaudOpportunityPayloadMock = vi.fn();
const updateBlackbaudOpportunityMock = vi.fn();

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

vi.mock("@/app/api/utils/prospectOpportunities", () => ({
  syncProspectAskAmount: syncProspectAskAmountMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  buildBlackbaudOpportunityPayload: buildBlackbaudOpportunityPayloadMock,
  updateBlackbaudOpportunity: updateBlackbaudOpportunityMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("prospect opportunity update route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    syncProspectAskAmountMock.mockReset();
    buildBlackbaudOpportunityPayloadMock.mockReset();
    updateBlackbaudOpportunityMock.mockReset();

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
    syncProspectAskAmountMock.mockResolvedValue();
    buildBlackbaudOpportunityPayloadMock.mockReturnValue({});
  });

  it("updates a local-only opportunity and syncs the prospect ask amount", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        title: "Leadership Ask",
        purpose: null,
        current_stage: "Cultivation",
        estimated_amount: 50000,
        ask_date: null,
        expected_date: null,
        latest_notes: "Initial note",
        opportunity_status: "Active",
        closed_amount: null,
        close_date: null,
        decline_reason: null,
        blackbaud_opportunity_id: null,
      },
    ]);
    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        title: "Leadership Ask Revised",
        opportunity_status: "Active",
      },
    ]);

    const request = new Request("https://example.com/api/prospects/opportunities/301", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Leadership Ask Revised",
        estimatedAmount: 75000,
      }),
    });

    const response = await PUT(request, { params: { id: "301" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.id).toBe(301);
    expect(payload.blackbaudSync).toEqual({ status: "local-only" });
    expect(syncProspectAskAmountMock).toHaveBeenCalledWith(7);
    expect(updateBlackbaudOpportunityMock).not.toHaveBeenCalled();
  });

  it("returns 502 when NXT opportunity update fails", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        title: "Leadership Ask",
        purpose: null,
        current_stage: "Cultivation",
        estimated_amount: 50000,
        ask_date: null,
        expected_date: null,
        latest_notes: "Initial note",
        opportunity_status: "Active",
        closed_amount: null,
        close_date: null,
        decline_reason: null,
        blackbaud_opportunity_id: "bb-opp-1",
      },
    ]);

    buildBlackbaudOpportunityPayloadMock.mockReturnValue({ stage: "Solicitation" });
    updateBlackbaudOpportunityMock.mockRejectedValue(new Error("NXT unavailable"));

    const request = new Request("https://example.com/api/prospects/opportunities/301", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentStage: "Solicitation",
      }),
    });

    const response = await PUT(request, { params: { id: "301" } });
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toMatch(/could not update nxt opportunity/i);
    expect(syncProspectAskAmountMock).not.toHaveBeenCalled();
  });
});
