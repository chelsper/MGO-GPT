import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const sendSubmissionEmailMock = vi.fn();
const resolveConstituentMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const saveProspectOpportunityMock = vi.fn();
const syncJointSolicitationOpportunitiesMock = vi.fn();
const buildBlackbaudOpportunityPayloadMock = vi.fn();
const createBlackbaudOpportunityMock = vi.fn();
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

vi.mock("@/app/api/utils/sendSubmissionEmail", () => ({
  sendSubmissionEmail: sendSubmissionEmailMock,
}));

vi.mock("@/app/api/utils/constituents", () => ({
  resolveConstituent: resolveConstituentMock,
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
  saveProspectOpportunity: saveProspectOpportunityMock,
  syncJointSolicitationOpportunities: syncJointSolicitationOpportunitiesMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  buildBlackbaudOpportunityPayload: buildBlackbaudOpportunityPayloadMock,
  createBlackbaudOpportunity: createBlackbaudOpportunityMock,
  updateBlackbaudOpportunity: updateBlackbaudOpportunityMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("opportunity update route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    sendSubmissionEmailMock.mockReset();
    resolveConstituentMock.mockReset();
    getWorkspaceUserMock.mockReset();
    saveProspectOpportunityMock.mockReset();
    syncJointSolicitationOpportunitiesMock.mockReset();
    buildBlackbaudOpportunityPayloadMock.mockReset();
    createBlackbaudOpportunityMock.mockReset();
    updateBlackbaudOpportunityMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 44,
        name: "MGO User",
        email: "mgo@example.com",
      },
      workspaceUser: {
        id: 44,
        name: "MGO User",
        email: "mgo@example.com",
      },
    });
    resolveConstituentMock.mockResolvedValue({
      id: 88,
      blackbaud_constituent_id: "227949",
    });
    buildBlackbaudOpportunityPayloadMock.mockReturnValue({
      constituent_id: "227949",
      name: "Leadership gift",
    });
    saveProspectOpportunityMock.mockResolvedValue({
      prospectId: 901,
      opportunity: {
        id: 7001,
      },
    });
    syncJointSolicitationOpportunitiesMock.mockResolvedValue();
    sendSubmissionEmailMock.mockResolvedValue();
  });

  it("saves the app opportunity when Blackbaud opportunity sync is denied", async () => {
    const { POST } = await import("./route.js");

    createBlackbaudOpportunityMock.mockRejectedValue(
      new Error(
        'Blackbaud 403 Forbidden: [{"message":"The user does not have permission to perform this operation"}]',
      ),
    );

    queueSqlResult([
      {
        id: 1001,
        donor_name: "Pat Prospect",
        submission_type: "opportunity_update",
      },
    ]);
    queueSqlResult([
      {
        id: 1001,
        prospect_id: 901,
        prospect_opportunity_id: 7001,
      },
    ]);

    const response = await POST(
      new Request("https://example.com/api/submissions/opportunity-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorName: "Pat Prospect",
          opportunityTitle: "Leadership gift",
          opportunityStage: "Identification",
          blackbaudConstituentId: "227949",
          linkedProspectId: 901,
          createNewOpportunity: true,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.blackbaudSync).toEqual(
      expect.objectContaining({
        status: "failed",
      }),
    );
    expect(payload.blackbaudSync.error).toMatch(/Could not sync NXT opportunity/i);
    expect(saveProspectOpportunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blackbaudOpportunityId: null,
        prospectId: 901,
        title: "Leadership gift",
      }),
    );
    expect(sendSubmissionEmailMock).toHaveBeenCalled();
  });

  it("maps a funded opportunity update to NXT funded fields", async () => {
    const { POST } = await import("./route.js");

    createBlackbaudOpportunityMock.mockResolvedValue({ id: "bb-opp-900" });

    queueSqlResult([
      {
        id: 1002,
        donor_name: "Pat Prospect",
        submission_type: "opportunity_update",
      },
    ]);
    queueSqlResult([
      {
        id: 1002,
        prospect_id: 901,
        prospect_opportunity_id: 7002,
      },
    ]);

    const response = await POST(
      new Request("https://example.com/api/submissions/opportunity-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorName: "Pat Prospect",
          opportunityTitle: "Leadership gift",
          opportunityStage: "Funded",
          askAmount: 25000,
          blackbaudConstituentId: "227949",
          linkedProspectId: 901,
          createNewOpportunity: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(buildBlackbaudOpportunityPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStage: "Funded",
        opportunityStatus: "Closed – Gift Secured",
        closedAmount: 25000,
      }),
    );
    expect(saveProspectOpportunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStage: "Funded",
        opportunityStatus: "Closed – Gift Secured",
        askAmount: 25000,
      }),
    );
  });
});
