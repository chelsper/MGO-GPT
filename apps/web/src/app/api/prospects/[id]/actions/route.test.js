import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const syncPrimaryPendingActionMock = vi.fn();
const createBlackbaudActionMock = vi.fn();
const getBlackbaudActionMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const getBlackbaudFundraiserByIdMock = vi.fn();
const updateBlackbaudActionMock = vi.fn();
const buildBlackbaudActionPayloadMock = vi.fn();
const buildBlackbaudActionMetadataPayloadMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();

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

vi.mock("@/app/api/utils/pendingActions", () => ({
  syncPrimaryPendingAction: syncPrimaryPendingActionMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  buildBlackbaudActionPayload: buildBlackbaudActionPayloadMock,
  buildBlackbaudActionMetadataPayload: buildBlackbaudActionMetadataPayloadMock,
  createBlackbaudAction: createBlackbaudActionMock,
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudAction: getBlackbaudActionMock,
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  getBlackbaudFundraiserById: getBlackbaudFundraiserByIdMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
  updateBlackbaudAction: updateBlackbaudActionMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("prospect action route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    syncPrimaryPendingActionMock.mockReset();
    createBlackbaudActionMock.mockReset();
    getBlackbaudActionMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    getBlackbaudFundraiserByIdMock.mockReset();
    updateBlackbaudActionMock.mockReset();
    buildBlackbaudActionPayloadMock.mockReset();
    buildBlackbaudActionMetadataPayloadMock.mockReset();
    findBlackbaudConstituentByEmailMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
        blackbaud_constituent_id: "234684",
        blackbaud_lookup_id: "LREDD",
      },
      sessionUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
      },
    });
    syncPrimaryPendingActionMock.mockResolvedValue(null);
    buildBlackbaudActionPayloadMock.mockReturnValue({ payload: "action" });
    buildBlackbaudActionMetadataPayloadMock.mockReturnValue({ payload: "metadata" });
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "234684",
    });
    findBlackbaudConstituentByEmailMock.mockResolvedValue({
      blackbaudConstituentId: "234684",
    });
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "234684",
      lookupId: "LREDD",
      name: "Leslie M. Redd",
    });
    getBlackbaudFundraiserByIdMock.mockResolvedValue({
      fundraiserId: "234684",
    });
  });

  it("logs a local action and syncs the primary next step", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        prospect_name: "Pat Prospect",
        constituent_id: 88,
        linked_blackbaud_constituent_id: null,
        blackbaud_constituent_id: null,
        next_action_completed_at: null,
      },
    ]);
    queueSqlResult([
      {
        id: 901,
        prospect_id: 7,
        update_title: "Sent email",
      },
    ]);
    queueSqlResult([]);

    const request = new Request("https://example.com/api/prospects/7/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionDate: "2026-06-09",
        actionCategory: "Email",
        interactionType: "Cultivation",
        summary: "Sent email",
        notes: "Shared an update.",
        nextStep: "Call next week",
        nextActionDueDate: "2026-06-16",
      }),
    });

    const response = await POST(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.update.id).toBe(901);
    expect(payload.blackbaudAction).toBeNull();
    expect(syncPrimaryPendingActionMock).toHaveBeenCalledWith({
      ownerUserId: 44,
      prospectId: 7,
      constituentId: 88,
      prospectOpportunityId: null,
      title: "Call next week",
      dueDate: "2026-06-16",
      completedAt: null,
    });
  });

  it("saves locally and returns the NXT sync error when action creation fails", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        prospect_name: "Pat Prospect",
        constituent_id: 88,
        linked_blackbaud_constituent_id: "234684",
        blackbaud_constituent_id: "234684",
        next_action_completed_at: null,
      },
    ]);
    queueSqlResult([
      {
        id: 902,
        prospect_id: 7,
        update_title: "Left voicemail",
      },
    ]);
    queueSqlResult([]);

    createBlackbaudActionMock.mockRejectedValue(new Error("Blackbaud unavailable"));

    const request = new Request("https://example.com/api/prospects/7/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionDate: "2026-06-09",
        summary: "Left voicemail",
      }),
    });

    const response = await POST(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.update.id).toBe(902);
    expect(payload.blackbaudAction.error).toMatch(/Blackbaud unavailable/i);
    expect(syncPrimaryPendingActionMock).toHaveBeenCalled();
  });

  it("retries through narrower create payload variants on Blackbaud RequestNotFulfilled 404 errors", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        prospect_name: "Pat Prospect",
        constituent_id: 88,
        linked_blackbaud_constituent_id: "234684",
        blackbaud_constituent_id: "234684",
        next_action_completed_at: null,
      },
    ]);
    queueSqlResult([
      {
        id: 903,
        prospect_id: 7,
        update_title: "Visit note",
      },
    ]);
    queueSqlResult([]);

    buildBlackbaudActionPayloadMock.mockReturnValue({
      constituent_id: "234684",
      date: "2026-06-11",
      category: "Meeting",
      direction: "Outbound",
      summary: "Visit note",
      description: "Notes: Good meeting",
    });
    createBlackbaudActionMock
      .mockRejectedValueOnce(
        new Error(
          'Blackbaud 404 Not Found: [{"message":"The requested operation could not be fulfilled","error_name":"RequestNotFulfilled","error_code":404}]',
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          'Blackbaud 404 Not Found: [{"message":"The requested operation could not be fulfilled","error_name":"RequestNotFulfilled","error_code":404}]',
        ),
      )
      .mockResolvedValueOnce({
        id: "bb-action-1",
      });
    getBlackbaudActionMock.mockResolvedValue({
      id: "bb-action-1",
      constituent_id: "234684",
    });

    const request = new Request("https://example.com/api/prospects/7/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionDate: "2026-06-11",
        actionCategory: "Meeting",
        interactionType: "Cultivation",
        summary: "Visit note",
        notes: "Good meeting",
      }),
    });

    const response = await POST(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.update.id).toBe(903);
    expect(payload.blackbaudAction.syncVariant).toBe(
      "fallback-core-action-payload-no-direction",
    );
    expect(createBlackbaudActionMock).toHaveBeenCalledTimes(3);
    expect(createBlackbaudActionMock.mock.calls[1][0].payload).toEqual({
      constituent_id: "234684",
      date: "2026-06-11",
      category: "Meeting",
      direction: "Outbound",
      summary: "Visit note",
      description: "Notes: Good meeting",
    });
    expect(createBlackbaudActionMock.mock.calls[2][0].payload).toEqual({
      constituent_id: "234684",
      date: "2026-06-11",
      category: "Meeting",
      summary: "Visit note",
      description: "Notes: Good meeting",
    });
  });

  it("preserves the linked NXT opportunity through action create fallbacks", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        prospect_name: "Pat Prospect",
        constituent_id: 88,
        linked_blackbaud_constituent_id: "234684",
        blackbaud_constituent_id: "234684",
        next_action_completed_at: null,
      },
    ]);
    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        blackbaud_opportunity_id: "bb-opp-301",
      },
    ]);
    queueSqlResult([
      {
        id: 906,
        prospect_id: 7,
        update_title: "Visit note",
      },
    ]);
    queueSqlResult([]);

    buildBlackbaudActionPayloadMock.mockReturnValue({
      constituent_id: "234684",
      date: "2026-06-18",
      category: "Meeting",
      direction: "Outbound",
      summary: "Visit note",
      description: "Notes: Good meeting",
      opportunity_id: "bb-opp-301",
    });
    createBlackbaudActionMock
      .mockRejectedValueOnce(
        new Error(
          'Blackbaud 404 Not Found: [{"message":"The requested operation could not be fulfilled","error_name":"RequestNotFulfilled","error_code":404}]',
        ),
      )
      .mockResolvedValueOnce({
        id: "bb-action-301",
      });
    getBlackbaudActionMock.mockResolvedValue({
      id: "bb-action-301",
      constituent_id: "234684",
    });
    updateBlackbaudActionMock.mockResolvedValue({ ok: true });

    const request = new Request("https://example.com/api/prospects/7/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionDate: "2026-06-18",
        actionCategory: "Meeting",
        interactionType: "Cultivation",
        summary: "Visit note",
        notes: "Good meeting",
        linkedOpportunityId: 301,
      }),
    });

    const response = await POST(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.update.id).toBe(906);
    expect(buildBlackbaudActionPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: "bb-opp-301",
      }),
    );
    expect(createBlackbaudActionMock.mock.calls[1][0].payload).toEqual(
      expect.objectContaining({
        opportunity_id: "bb-opp-301",
      }),
    );
    expect(buildBlackbaudActionMetadataPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: "bb-opp-301",
      }),
    );
  });

  it("includes an additional fundraiser when another MGO is selected on the action form", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        prospect_name: "Pat Prospect",
        constituent_id: 88,
        linked_blackbaud_constituent_id: "234684",
        blackbaud_constituent_id: "234684",
        next_action_completed_at: null,
      },
    ]);
    queueSqlResult([
      {
        id: 55,
        name: "Christopher P. Corbo",
        email: "ccorbo@example.com",
        blackbaud_constituent_id: "172263",
        blackbaud_lookup_id: "CCORBO",
      },
    ]);
    queueSqlResult([
      {
        id: 904,
        prospect_id: 7,
        update_title: "Joint visit",
      },
    ]);
    queueSqlResult([]);

    getBlackbaudFundraiserByIdMock.mockImplementation(async ({ fundraiserId }) => ({
      fundraiserId: String(fundraiserId),
    }));
    createBlackbaudActionMock.mockResolvedValue({ id: "bb-action-2" });
    getBlackbaudActionMock.mockResolvedValue({
      id: "bb-action-2",
      constituent_id: "234684",
    });
    updateBlackbaudActionMock.mockResolvedValue({ ok: true });

    const request = new Request("https://example.com/api/prospects/7/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionDate: "2026-06-12",
        actionCategory: "Meeting",
        interactionType: "Cultivation",
        summary: "Joint visit",
        notes: "Met together with the donor.",
        additionalFundraiserUserId: "55",
      }),
    });

    const response = await POST(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.update.id).toBe(904);
    expect(buildBlackbaudActionPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Joint visit",
      }),
    );
    expect(buildBlackbaudActionMetadataPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fundraiserIds: ["234684", "172263"],
      }),
    );
  });

  it("repairs a stale linked Blackbaud constituent id before creating the action", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 7,
        prospect_name: "Hilary Brooks Campbell",
        constituent_id: 88,
        email: "hcampbell@example.com",
        linked_blackbaud_constituent_id: "436887",
        blackbaud_constituent_id: "436887",
        next_action_completed_at: null,
      },
    ]);
    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 905,
        prospect_id: 7,
        update_title: "Quick check-in",
      },
    ]);
    queueSqlResult([]);

    getBlackbaudConstituentByIdMock.mockRejectedValue(
      new Error(
        'Blackbaud 404 Not Found: [{"message":"The requested operation could not be fulfilled","error_name":"RequestNotFulfilled","error_code":404}]',
      ),
    );
    findBlackbaudConstituentByEmailMock.mockImplementation(async ({ email }) => {
      if (email === "hcampbell@example.com") {
        return {
          blackbaudConstituentId: "227949",
          name: "Hilary Brooks Campbell",
          lookupId: "HCAMPBELL",
        };
      }

      return {
        blackbaudConstituentId: "234684",
      };
    });
    buildBlackbaudActionPayloadMock.mockImplementation(({ blackbaudConstituentId }) => ({
      constituent_id: blackbaudConstituentId,
      date: "2026-06-16T00:00:00.000Z",
      category: "Meeting",
      summary: "Quick check-in",
    }));
    createBlackbaudActionMock.mockResolvedValue({ id: "bb-action-3" });
    getBlackbaudActionMock.mockResolvedValue({
      id: "bb-action-3",
      constituent_id: "227949",
    });
    updateBlackbaudActionMock.mockResolvedValue({ ok: true });

    const request = new Request("https://example.com/api/prospects/7/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionDate: "2026-06-16",
        actionCategory: "Meeting",
        interactionType: "Cultivation",
        summary: "Quick check-in",
      }),
    });

    const response = await POST(request, { params: { id: "7" } });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.update.id).toBe(905);
    expect(createBlackbaudActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          constituent_id: "227949",
        }),
      }),
    );
  });
});
