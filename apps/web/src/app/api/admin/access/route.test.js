import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getOrCreateUserMock = vi.fn();

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

vi.mock("@/app/api/utils/getOrCreateUser", () => ({
  default: getOrCreateUserMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

vi.mock("@/app/api/utils/invitations", () => ({
  assertAssignableRole: vi.fn(),
  getBootstrapAdminEmail: () => "admin@example.com",
  getBootstrapAdminEmails: () => ["admin@example.com"],
  normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
}));

vi.mock("@/utils/workspaceRoles", () => ({
  canManageWorkspaceRole: (role) =>
    ["admin", "advancement_services", "advancement_admin"].includes(role),
  canUseMgoWorkspaceRole: (role) => ["mgo", "executive", "executive_admin"].includes(role),
  normalizeWorkspaceRole: (role) =>
    ({
      admin: "admin",
      advancement_services: "advancement_services",
      advancement_admin: "advancement_services",
      reviewer: "advancement_services",
      executive: "executive",
      executive_admin: "executive",
      mgo: "mgo",
    })[role] || null,
  normalizeWorkspaceRoles: (roles) => {
    if (Array.isArray(roles)) return roles.filter(Boolean);
    if (typeof roles === "string" && roles.trim()) {
      return roles.split(",").map((value) => value.trim()).filter(Boolean);
    }
    return [];
  },
  serializeWorkspaceRoles: (roles) =>
    Array.isArray(roles) ? roles.filter(Boolean).join(",") : String(roles || "").trim(),
}));

describe("admin access deletion", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getOrCreateUserMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "admin@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({
      id: 1,
      email: "admin@example.com",
      role: "advancement_admin",
    });
  });

  it("refuses to delete an active app account", async () => {
    const { DELETE } = await import("./route.js");
    queueSqlResult([
      { id: 12, name: "Test User", email: "test@example.com", active: true },
    ]);

    const response = await DELETE(
      new Request("https://example.com/api/admin/access?userId=12", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Deactivate this app account before deleting it.",
    });
  });

  it("retains inactive accounts with app work or audit history", async () => {
    const { DELETE } = await import("./route.js");
    queueSqlResult([
      { id: 12, name: "Test User", email: "test@example.com", active: false },
    ]);
    queueSqlResult([
      {
        submissions: "1",
        constituents: "0",
        list_requests: "0",
        prospect_pool: "0",
        data_change_requests: "0",
        assignment_audits: "0",
        prospects: "0",
        pending_actions: "0",
        discussion_items: "0",
        discussion_participation: "0",
        opportunity_gift_links: "0",
        import_runs: "0",
        import_rows: "0",
        knowledge_articles: "0",
        knowledge_revisions: "0",
        giving_societies: "0",
        field_mappings: "0",
      },
    ]);

    const response = await DELETE(
      new Request("https://example.com/api/admin/access?userId=12", {
        method: "DELETE",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("cannot be deleted");
    expect(payload.dependencies).toEqual([{ name: "submissions", count: 1 }]);
  });

  it("deletes an inactive test account with no app work", async () => {
    const { DELETE } = await import("./route.js");
    queueSqlResult([
      { id: 12, name: "Test User", email: "test@example.com", active: false },
    ]);
    queueSqlResult([
      {
        constituents: "0",
        submissions: "0",
        list_requests: "0",
        prospect_pool: "0",
        data_change_requests: "0",
        assignment_audits: "0",
        prospects: "0",
        pending_actions: "0",
        discussion_items: "0",
        discussion_participation: "0",
        opportunity_gift_links: "0",
        import_runs: "0",
        import_rows: "0",
        knowledge_articles: "0",
        knowledge_revisions: "0",
        giving_societies: "0",
        field_mappings: "0",
      },
    ]);
    queueSqlResult([]);
    queueSqlResult([{ id: 12, name: "Test User", email: "test@example.com" }]);

    const response = await DELETE(
      new Request("https://example.com/api/admin/access?userId=12", {
        method: "DELETE",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      user: { id: 12, email: "test@example.com" },
    });
    expect(sqlMockImpl.mock.calls.map((call) => call[0].join(" ")).join("\n")).toContain(
      "DELETE FROM users",
    );
  });

  it("updates fundraiser alias ids for a workspace user", async () => {
    const { PATCH } = await import("./route.js");
    queueSqlResult([
      {
        role: "executive,mgo",
        blackbaud_constituent_id: "186057",
        blackbaud_lookup_id: "436887",
        blackbaud_fundraiser_alias_ids: ["152922"],
      },
    ]);
    queueSqlResult([
      {
        id: 12,
        name: "Leslie M. Redd",
        email: "lredd@ju.edu",
        role: "executive,mgo",
        active: true,
        deactivated_at: null,
        blackbaud_constituent_id: "186057",
        blackbaud_lookup_id: "436887",
        blackbaud_fundraiser_alias_ids: ["152922", "172263", "234684"],
      },
    ]);

    const response = await PATCH(
      new Request("https://example.com/api/admin/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: 12,
          blackbaudFundraiserAliasIds: ["152922", "172263", "234684", "152922"],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.user).toEqual(
      expect.objectContaining({
        id: 12,
        blackbaud_fundraiser_alias_ids: ["152922", "172263", "234684"],
      }),
    );
  });
});
