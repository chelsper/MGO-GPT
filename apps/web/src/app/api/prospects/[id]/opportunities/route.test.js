import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const saveProspectOpportunityMock = vi.fn();
const buildBlackbaudOpportunityPayloadMock = vi.fn();
const createBlackbaudOpportunityMock = vi.fn();

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
  saveProspectOpportunity: saveProspectOpportunityMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  buildBlackbaudOpportunityPayload: buildBlackbaudOpportunityPayloadMock,
  createBlackbaudOpportunity: createBlackbaudOpportunityMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("prospect opportunity create route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    saveProspectOpportunityMock.mockReset();
    buildBlackbaudOpportunityPayloadMock.mockReset();
    createBlackbaudOpportunityMock.mockReset();

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
    buildBlackbaudOpportunityPayloadMock.mockReturnValue({ payload: "opportunity" });
  });

  it("creates a local opportunity when no Blackbaud linkage exists", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        constituent_id: 88,
        blackbaud_constituent_id: null,
        linked_blackbaud_constituent_id: null,
      },
    ]);
    saveProspectOpportunityMock.mockResolvedValue({
      opportunity: {
        id: 901,
        title: "Leadership Ask",
      },
    });

    const request = new Request("https://example.com/api/prospects/7/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Leadership Ask",
        currentStage: "Cultivation",
        estimatedAmount: 50000,
      }),
    });

    const response = await POST(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.id).toBe(901);
    expect(payload.blackbaudSync).toEqual({ status: "local-only" });
    expect(createBlackbaudOpportunityMock).not.toHaveBeenCalled();
  });
});
