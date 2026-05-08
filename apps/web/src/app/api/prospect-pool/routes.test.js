import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const resolveConstituentMock = vi.fn();

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

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({
      id: 7,
      name: "Reviewer Person",
      email: "reviewer@example.com",
      role: "reviewer",
    });
  });

  it("creates an app assignment and records manual-required NXT status when direct sync is unavailable", async () => {
    const { POST } = await import("./route.js");

    resolveConstituentMock.mockResolvedValue({
      id: 88,
      blackbaud_constituent_id: "234684",
    });

    queueSqlResult([{ id: 44, name: "Gretchen Picotte", email: "gretchen@example.com" }]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 901,
        assigned_user_id: 44,
        prospect_name: "Pat Prospect",
      },
    ]);
    queueSqlResult([{ id: 7001 }]);
    queueSqlResult([
      {
        id: 901,
        assigned_user_id: 44,
        prospect_name: "Pat Prospect",
        assignment_status: "active",
        nxt_status_sync_state: "manual_required",
        manual_nxt_update_required: true,
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
    expect(payload.nxt_status_sync_state).toBe("manual_required");
    expect(payload.manual_nxt_update_required).toBe(true);
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

  it("records retry attempts without pretending the unsupported NXT update succeeded", async () => {
    const { POST } = await import("./[id]/nxt-status-sync/route.js");

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
        nxt_status_sync_state: "manual_required",
        nxt_status_retry_count: 1,
      },
    ]);

    const request = new Request("https://example.com/api/prospect-pool/901/nxt-status-sync", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "901" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.nxt_status_sync_state).toBe("manual_required");
    expect(payload.nxt_status_retry_count).toBe(1);
  });

  it("exports unresolved NXT assignment updates as CSV", async () => {
    const { GET } = await import("./nxt-status-export/route.js");

    queueSqlResult([
      {
        blackbaud_constituent_id: "234684",
        desired_nxt_prospect_status: "Identification/Re-Engagement",
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
    expect(payload).toContain("Constituent ID / system record ID");
    expect(payload).toContain("234684");
    expect(payload).toContain("Gretchen Picotte");
  });
});
