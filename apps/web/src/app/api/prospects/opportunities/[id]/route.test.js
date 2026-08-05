import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const syncProspectAskAmountMock = vi.fn();
const buildBlackbaudOpportunityPayloadMock = vi.fn();
const updateBlackbaudOpportunityMock = vi.fn();
const ACTIVE_OPPORTUNITY_STATUS = "Active";
const FUNDED_OPPORTUNITY_STATUS = "Closed – Gift Secured";
const DECLINED_OPPORTUNITY_STATUS = "Closed – Declined";

function normalizeOpportunityLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\s*[–—-]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getOpportunityStageForStatus(status, fallbackStage = "Identification") {
  const normalized = normalizeOpportunityLabel(status);
  if (normalized === "funded" || normalized === "closed - gift secured") {
    return "Funded";
  }
  if (normalized === "declined" || normalized === "closed - declined") {
    return "Declined";
  }
  return fallbackStage || "Identification";
}

function getOpportunityStatusForStage(stage) {
  const normalized = normalizeOpportunityLabel(stage);
  if (normalized === "funded" || normalized === "closed - gift secured") {
    return FUNDED_OPPORTUNITY_STATUS;
  }
  if (normalized === "declined" || normalized === "closed - declined") {
    return DECLINED_OPPORTUNITY_STATUS;
  }
  return ACTIVE_OPPORTUNITY_STATUS;
}

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
  ACTIVE_OPPORTUNITY_STATUS,
  FUNDED_OPPORTUNITY_STATUS,
  DECLINED_OPPORTUNITY_STATUS,
  getOpportunityStageForStatus,
  getOpportunityStatusForStage,
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

  it("preserves an existing funded status when editing non-status fields", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 303,
        prospect_id: 7,
        title: "Funded Ask",
        purpose: "Future. Made. Campaign",
        current_stage: "Solicitation",
        estimated_amount: 50000,
        ask_date: null,
        expected_date: null,
        latest_notes: "Initial note",
        opportunity_status: "Closed – Gift Secured",
        closed_amount: 50000,
        close_date: "2026-07-01",
        decline_reason: null,
        blackbaud_opportunity_id: null,
      },
    ]);
    queueSqlResult([
      {
        id: 303,
        prospect_id: 7,
        title: "Funded Ask Revised",
        current_stage: "Funded",
        opportunity_status: "Closed – Gift Secured",
      },
    ]);

    const request = new Request("https://example.com/api/prospects/opportunities/303", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Funded Ask Revised",
      }),
    });

    const response = await PUT(request, { params: { id: "303" } });

    expect(response.status).toBe(200);
    const updateCall = sqlMockImpl.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE prospect_opportunities"),
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall.slice(1)).toContain("Funded");
    expect(updateCall.slice(1)).toContain("Closed – Gift Secured");
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

  it("maps the declined status to the NXT declined status and purpose", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        title: "Leadership Ask",
        purpose: "Future. Made. Campaign",
        current_stage: "Solicitation",
        estimated_amount: 50000,
        ask_date: null,
        expected_date: "2026-12-31",
        latest_notes: "Initial note",
        opportunity_status: "Active",
        closed_amount: null,
        close_date: null,
        decline_reason: null,
        blackbaud_opportunity_id: "bb-opp-1",
      },
    ]);
    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        title: "Leadership Ask",
        purpose: "Completed -- Not Fulfilled",
        current_stage: "Declined",
        opportunity_status: "Closed – Declined",
      },
    ]);

    buildBlackbaudOpportunityPayloadMock.mockReturnValue({
      status: "Declined",
      purpose: "Completed -- Not Fulfilled",
    });
    updateBlackbaudOpportunityMock.mockResolvedValue({});

    const request = new Request("https://example.com/api/prospects/opportunities/301", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "Future. Made. Campaign",
        currentStage: "Declined",
      }),
    });

    const response = await PUT(request, { params: { id: "301" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.blackbaudSync).toEqual({
      status: "synced",
      opportunityId: "bb-opp-1",
    });
    expect(buildBlackbaudOpportunityPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityStatus: "Closed – Declined",
        purpose: "Completed -- Not Fulfilled",
        currentStage: "Declined",
        closedAmount: 0,
      }),
    );
    expect(updateBlackbaudOpportunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: "bb-opp-1",
        payload: {
          status: "Declined",
          purpose: "Completed -- Not Fulfilled",
        },
      }),
    );
    expect(syncProspectAskAmountMock).toHaveBeenCalledWith(7);
  });

  it("maps the funded status to the NXT funded status and funded fields", async () => {
    const { PUT } = await import("./route.js");

    queueSqlResult([
      {
        id: 302,
        prospect_id: 7,
        title: "Scholarship Ask",
        purpose: "Future. Made. Campaign",
        current_stage: "Solicitation",
        estimated_amount: 75000,
        ask_date: "2026-07-01",
        expected_date: "2026-12-31",
        latest_notes: "Initial note",
        opportunity_status: "Active",
        closed_amount: null,
        close_date: null,
        decline_reason: null,
        blackbaud_opportunity_id: "bb-opp-2",
      },
    ]);
    queueSqlResult([
      {
        id: 302,
        prospect_id: 7,
        title: "Scholarship Ask",
        current_stage: "Funded",
        opportunity_status: "Closed – Gift Secured",
        closed_amount: 80000,
      },
    ]);

    buildBlackbaudOpportunityPayloadMock.mockReturnValue({
      status: "Funded",
      funded_amount: { value: 80000 },
    });
    updateBlackbaudOpportunityMock.mockResolvedValue({});

    const request = new Request("https://example.com/api/prospects/opportunities/302", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentStage: "Funded",
        closedAmount: 80000,
        closeDate: "2026-08-05",
      }),
    });

    const response = await PUT(request, { params: { id: "302" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.blackbaudSync).toEqual({
      status: "synced",
      opportunityId: "bb-opp-2",
    });
    expect(buildBlackbaudOpportunityPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityStatus: "Closed – Gift Secured",
        currentStage: "Funded",
        closedAmount: 80000,
        closeDate: "2026-08-05",
      }),
    );
    expect(updateBlackbaudOpportunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: "bb-opp-2",
        payload: {
          status: "Funded",
          funded_amount: { value: 80000 },
        },
      }),
    );
    expect(syncProspectAskAmountMock).toHaveBeenCalledWith(7);
  });
});
