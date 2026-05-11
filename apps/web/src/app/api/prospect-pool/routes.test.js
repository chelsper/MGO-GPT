import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const resolveConstituentMock = vi.fn();
const listBlackbaudConstituentCustomFieldsMock = vi.fn();
const createBlackbaudConstituentCustomFieldMock = vi.fn();
const updateBlackbaudConstituentCustomFieldMock = vi.fn();
const listBlackbaudFundraiserAssignmentsMock = vi.fn();
const createBlackbaudFundraiserAssignmentMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const getBlackbaudFundraiserByIdMock = vi.fn();
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

vi.mock("@/app/api/utils/getOrCreateUser", () => ({
  default: getOrCreateUserMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/constituents", () => ({
  resolveConstituent: resolveConstituentMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  listBlackbaudConstituentCustomFields: listBlackbaudConstituentCustomFieldsMock,
  createBlackbaudConstituentCustomField: createBlackbaudConstituentCustomFieldMock,
  updateBlackbaudConstituentCustomField: updateBlackbaudConstituentCustomFieldMock,
  listBlackbaudFundraiserAssignments: listBlackbaudFundraiserAssignmentsMock,
  createBlackbaudFundraiserAssignment: createBlackbaudFundraiserAssignmentMock,
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudFundraiserById: getBlackbaudFundraiserByIdMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("prospect pool routes", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getOrCreateUserMock.mockReset();
    getWorkspaceUserMock.mockReset();
    resolveConstituentMock.mockReset();
    listBlackbaudConstituentCustomFieldsMock.mockReset();
    createBlackbaudConstituentCustomFieldMock.mockReset();
    updateBlackbaudConstituentCustomFieldMock.mockReset();
    listBlackbaudFundraiserAssignmentsMock.mockReset();
    createBlackbaudFundraiserAssignmentMock.mockReset();
    findBlackbaudConstituentByEmailMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    getBlackbaudFundraiserByIdMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({
      id: 7,
      name: "Reviewer Person",
      email: "reviewer@example.com",
      role: "reviewer",
    });
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 44,
        name: "Gretchen Picotte",
        email: "gretchen@example.com",
        role: "mgo",
        blackbaud_constituent_id: "234684",
      },
    });
    findBlackbaudConstituentByEmailMock.mockResolvedValue(null);
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue(null);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    getBlackbaudFundraiserByIdMock.mockResolvedValue({
      fundraiserId: "234684",
      constituentId: "234684",
      name: "Gretchen Picotte",
    });
  });

  it("creates an app assignment and writes the MGOGPT constituent custom field when missing", async () => {
    const { POST } = await import("./route.js");

    resolveConstituentMock.mockResolvedValue({
      id: 88,
      blackbaud_constituent_id: "234684",
    });
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([]);
    createBlackbaudConstituentCustomFieldMock.mockResolvedValue({ id: "cf-1" });

    queueSqlResult([{ id: 44, name: "Gretchen Picotte", email: "gretchen@example.com" }]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 901,
        assigned_user_id: 44,
        prospect_name: "Pat Prospect",
        assignment_status: "active",
        nxt_status_sync_state: "success",
        manual_nxt_update_required: false,
        nxt_status_retry_count: 0,
      },
    ]);
    queueSqlResult([{ id: 7001 }]);
    queueSqlResult([
      {
        id: 901,
        assigned_user_id: 44,
        prospect_name: "Pat Prospect",
        assignment_status: "active",
        nxt_status_sync_state: "success",
        manual_nxt_update_required: false,
        nxt_status_retry_count: 0,
      },
    ]);

    const request = new Request("https://example.com/api/prospect-pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectName: "Pat Prospect",
        assignedUserId: 44,
        note: "Pool entry",
        blackbaudConstituentId: "234684",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.assignment_status).toBe("active");
    expect(payload.nxt_status_sync_state).toBe("success");
    expect(payload.manual_nxt_update_required).toBe(false);
    expect(createBlackbaudConstituentCustomFieldMock).toHaveBeenCalled();
  });

  it("rejects assignment creation when the MGO selection is missing", async () => {
    const { POST } = await import("./route.js");

    const request = new Request("https://example.com/api/prospect-pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectName: "Pat Prospect",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/assigned mgo is required/i);
  });

  it("prevents duplicate active assignments for the same MGO", async () => {
    const { POST } = await import("./route.js");

    resolveConstituentMock.mockResolvedValue({
      id: 88,
      blackbaud_constituent_id: "234684",
    });

    queueSqlResult([{ id: 44, name: "Gretchen Picotte", email: "gretchen@example.com" }]);
    queueSqlResult([{ id: 123, prospect_name: "Pat Prospect" }]);

    const request = new Request("https://example.com/api/prospect-pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectName: "Pat Prospect",
        assignedUserId: 44,
        blackbaudConstituentId: "234684",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toMatch(/already assigned/i);
  });

  it("records retry attempts and succeeds when the MGOGPT value already exists", async () => {
    const { POST } = await import("./[id]/nxt-status-sync/route.js");
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([
      { category: "MGOGPT", value: "Identification/Re-Qualification" },
    ]);

    queueSqlResult([
      {
        id: 901,
        assigned_user_id: 44,
        assigned_user_name: "Gretchen Picotte",
        assigned_user_email: "gretchen@example.com",
        constituent_id: 88,
        blackbaud_constituent_id: "234684",
        prospect_name: "Pat Prospect",
        normalized_name: "pat prospect",
        note: null,
        email: null,
        phone: null,
        assigned_at: "2026-05-08T14:00:00.000Z",
        assignment_source: "Advancement Services",
        nxt_status_retry_count: 0,
      },
    ]);
    queueSqlResult([{ id: 7002 }]);
    queueSqlResult([
      {
        id: 901,
        prospect_name: "Pat Prospect",
        nxt_status_sync_state: "success",
        nxt_status_retry_count: 1,
      },
    ]);

    const request = new Request("https://example.com/api/prospect-pool/901/nxt-status-sync", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "901" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.nxt_status_sync_state).toBe("success");
    expect(payload.nxt_status_retry_count).toBe(1);
  });

  it("lets the assigned workspace MGO add themselves as Lead Solicitor in NXT", async () => {
    const { PATCH } = await import("./[id]/route.js");

    getOrCreateUserMock.mockResolvedValue({
      id: 44,
      name: "Gretchen Picotte",
      email: "gretchen@example.com",
      role: "mgo",
      blackbaud_constituent_id: "234684",
    });
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([]);
    createBlackbaudFundraiserAssignmentMock.mockResolvedValue({ id: "assign-1" });

    queueSqlResult([
      {
        id: 901,
        assigned_user_id: 44,
        constituent_id: 88,
        blackbaud_constituent_id: "555123",
        prospect_name: "Pat Prospect",
        needs_contact_info: false,
        contact_info_request_note: null,
        solicitor_requested: false,
        solicitor_assignment_sync_state: null,
      },
    ]);
    queueSqlResult([
      {
        id: 901,
        assigned_user_id: 44,
        prospect_name: "Pat Prospect",
        solicitor_requested: true,
        solicitor_assignment_sync_state: "success",
      },
    ]);

    const request = new Request("https://example.com/api/prospect-pool/901", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solicitorRequested: true,
      }),
    });

    const response = await PATCH(request, { params: { id: "901" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.solicitor_assignment_sync_state).toBe("success");
    expect(createBlackbaudFundraiserAssignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          fundraiser_id: "234684",
          constituent_id: "555123",
          type: "Lead Solicitor",
          value: 0,
        }),
      }),
    );
  });

  it("creates a second MGOGPT custom field entry when the MGO selects an outcome and comment", async () => {
    const { PATCH } = await import("./[id]/route.js");

    getOrCreateUserMock.mockResolvedValue({
      id: 44,
      name: "Gretchen Picotte",
      email: "gretchen@example.com",
      role: "mgo",
      blackbaud_constituent_id: "234684",
    });
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([
      {
        id: "cf-existing",
        category: "MGOGPT",
        value: "Identification/Re-Qualification",
        comment: "Assigned by Advancement Services",
        date: "2026-05-11",
      },
    ]);
    createBlackbaudConstituentCustomFieldMock.mockResolvedValue({ id: "cf-22" });

    queueSqlResult([
      {
        id: 903,
        assigned_user_id: 44,
        constituent_id: 88,
        blackbaud_constituent_id: "555321",
        prospect_name: "Jordan Prospect",
        needs_contact_info: false,
        contact_info_request_note: null,
        solicitor_requested: false,
        solicitor_assignment_sync_state: null,
        mgogpt_disposition_value: null,
        mgogpt_disposition_comment: null,
        mgogpt_disposition_sync_state: null,
      },
    ]);
    queueSqlResult([
      {
        id: 903,
        assigned_user_id: 44,
        prospect_name: "Jordan Prospect",
        solicitor_requested: false,
        mgogpt_disposition_value: "Qualified - Major Gifts",
        mgogpt_disposition_comment: "Ready for qualification outreach.",
        mgogpt_disposition_sync_state: "success",
      },
    ]);

    const request = new Request("https://example.com/api/prospect-pool/903", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mgogptDispositionValue: "Qualified - Major Gifts",
        mgogptDispositionComment: "Ready for qualification outreach.",
      }),
    });

    const response = await PATCH(request, { params: { id: "903" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mgogpt_disposition_sync_state).toBe("success");
    expect(listBlackbaudConstituentCustomFieldsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 44,
        authUserId: 44,
        constituentId: "555321",
      }),
    );
    expect(createBlackbaudConstituentCustomFieldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 44,
        authUserId: 44,
        payload: expect.objectContaining({
          parent_id: "555321",
          category: "MGOGPT",
          value: "Qualified - Major Gifts",
          codetableentry_value: "Qualified - Major Gifts",
          comment: "Ready for qualification outreach.",
        }),
      }),
    );
  });

  it("resolves fundraiser identity from alternate Blackbaud matches before creating the assignment", async () => {
    const { PATCH } = await import("./[id]/route.js");

    getOrCreateUserMock.mockResolvedValue({
      id: 44,
      name: "Leslie M. Redd",
      email: "leslie@example.com",
      role: "mgo",
      blackbaud_constituent_id: "186057",
    });
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "leslie@example.com",
        role: "mgo",
        blackbaud_constituent_id: "186057",
        blackbaud_lookup_id: "436887",
      },
    });
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "172263",
    });
    getBlackbaudFundraiserByIdMock
      .mockRejectedValueOnce(new Error("Blackbaud 404 Resource Not Found"))
      .mockResolvedValueOnce({
        fundraiserId: "172263",
        constituentId: "186057",
        name: "Leslie M. Redd",
      });
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([]);
    createBlackbaudFundraiserAssignmentMock.mockResolvedValue({ id: "assign-2" });

    queueSqlResult([
      {
        id: 902,
        assigned_user_id: 44,
        constituent_id: 89,
        blackbaud_constituent_id: "555999",
        prospect_name: "Robin Prospect",
        needs_contact_info: false,
        contact_info_request_note: null,
        solicitor_requested: false,
        solicitor_assignment_sync_state: null,
      },
    ]);
    queueSqlResult([
      {
        id: 902,
        assigned_user_id: 44,
        prospect_name: "Robin Prospect",
        solicitor_requested: true,
        solicitor_assignment_sync_state: "success",
      },
    ]);

    const request = new Request("https://example.com/api/prospect-pool/902", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solicitorRequested: true,
      }),
    });

    const response = await PATCH(request, { params: { id: "902" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.solicitor_assignment_sync_state).toBe("success");
    expect(createBlackbaudFundraiserAssignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          fundraiser_id: "172263",
          constituent_id: "555999",
          type: "Lead Solicitor",
        }),
      }),
    );
  });

  it("exports unresolved MGOGPT assignment updates as CSV", async () => {
    const { GET } = await import("./nxt-status-export/route.js");

    queueSqlResult([
      {
        blackbaud_constituent_id: "234684",
        desired_nxt_custom_field_category: "MGOGPT",
        desired_nxt_custom_field_value: "Identification/Re-Qualification",
        desired_nxt_start_date: "2026-05-08",
        desired_nxt_comment: "Assigned by Advancement Services",
        assigned_to_name: "Gretchen Picotte",
        assigned_by_name: "Reviewer Person",
        assigned_at: "2026-05-08T14:00:00.000Z",
        nxt_sync_status: "manual_required",
        nxt_sync_error: "Manual NXT update required",
      },
    ]);

    const response = await GET();
    const payload = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(payload).toContain("Custom field category");
    expect(payload).toContain("MGOGPT");
    expect(payload).toContain("Identification/Re-Qualification");
    expect(payload).toContain("234684");
    expect(payload).toContain("Gretchen Picotte");
  });
});
