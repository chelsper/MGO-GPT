import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { DEFAULT_EXPORT_COLUMNS, validateExportOptions } from "@/utils/prospectExport";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
import { authorizeExport, exportRoster, loadProspectExport } from "./prospectExportData";
const user = { id: 1, role: "mgo", active: true };
const context = (sessionUser = user, workspaceUser = user) => ({ sessionUser, workspaceUser, origin: "https://app.example" });
const options = (overrides = {}) => validateExportOptions({ scope: "active", format: "xlsx", ownerIds: [1], columns: DEFAULT_EXPORT_COLUMNS, ...overrides });

describe("export authorization and saved data loading", () => {
  beforeEach(() => { sql.mockReset(); });
  it("permits an MGO's own workspace, never an arbitrary owner ID", async () => {
    await expect(authorizeExport(options(), context())).resolves.toEqual([user]);
    await expect(authorizeExport(options({ ownerIds: [2] }), context())).rejects.toMatchObject({ exportStatus: 403 });
    expect(sql).not.toHaveBeenCalled();
  });
  it("allows an existing authorized acting workspace, and rejects invalid acting context", async () => {
    await expect(authorizeExport(options({ ownerIds: [2] }), context({ ...user, role: "executive" }, { id: 2 }))).resolves.toEqual([{ id: 2 }]);
    await expect(authorizeExport(options(), { ...context(), invalidActingUserId: 5 })).rejects.toMatchObject({ exportStatus: 403 });
  });
  it.each(["mgo", "executive"])("denies master export for %s even with forged owners", async (role) => {
    await expect(authorizeExport(options({ scope: "master", ownerIds: [1, 2] }), context({ ...user, role }))).rejects.toMatchObject({ exportStatus: 403 });
    expect(sql).not.toHaveBeenCalled();
  });
  it.each(["advancement_services", "reviewer", "admin"])("permits explicit multiselect for %s using the session role", async (role) => {
    sql.mockResolvedValue([{ id: 1, role: "mgo" }, { id: 2, role: "executive,mgo" }, { id: 3, role: "admin" }]);
    await expect(authorizeExport(options({ scope: "master", ownerIds: [2, 1] }), context({ ...user, role }))).resolves.toEqual([{ id: 2, role: "executive,mgo" }, { id: 1, role: "mgo" }]);
  });
  it("rejects inactive/non-MGO owners and refuses a partial master export", async () => {
    sql.mockResolvedValue([{ id: 1, role: "mgo" }, { id: 3, role: "admin" }]);
    await expect(authorizeExport(options({ scope: "master", ownerIds: [1, 3] }), context({ ...user, role: "admin" }))).rejects.toMatchObject({ exportStatus: 403 });
    expect(sql.mock.calls[0][0].join(" ")).toContain("u.active = TRUE");
  });
  it("denies inactive sessions", async () => {
    await expect(authorizeExport(options(), context({ ...user, active: false }))).rejects.toMatchObject({ exportStatus: 403 });
  });
  it("returns only active MGO roster entries and their saved prospect counts", async () => {
    sql.mockResolvedValue([{ id: 1, role: "mgo", active_count: 301 }, { id: 2, role: "advancement_services" }]);
    await expect(exportRoster()).resolves.toEqual([{ id: 1, role: "mgo", active_count: 301 }]);
  });
  it("preserves selected filter order and stored rank without refreshing NXT", async () => {
    sql.mockResolvedValue([{ id: 1, portfolio_rank: 1 }, { id: 2, portfolio_rank: 2 }]);
    const rows = await loadProspectExport(options({ scope: "filtered", prospectIds: [2, 1] }), context());
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
    expect(rows[0].portfolio_rank).toBe(2);
    expect(sql).toHaveBeenCalledTimes(1);
    const query = sql.mock.calls[0][0].join(" ");
    expect(query).toContain("p.user_id = ANY(");
    expect(query).toContain("p.status = 'Active'");
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
  it("refuses filtered exports containing removed, inactive or unauthorized IDs", async () => {
    sql.mockResolvedValue([{ id: 1 }]);
    await expect(loadProspectExport(options({ scope: "filtered", prospectIds: [1, 999] }), context())).rejects.toMatchObject({ exportStatus: 409 });
  });
  it("does not silently truncate large exports or deliver an empty file", async () => {
    sql.mockResolvedValue(Array.from({ length: 10001 }, (_, id) => ({ id })));
    await expect(loadProspectExport(options(), context())).rejects.toThrow("Too many prospects");
    sql.mockResolvedValue([]);
    await expect(loadProspectExport(options(), context())).rejects.toThrow("No prospects");
  });
  it("queries optional activity by selected workspace, caller's connection and origin-specific key only", async () => {
    const digest = createHash("sha256").update(JSON.stringify(["https://app.example", "123"])).digest("hex");
    sql.mockResolvedValueOnce([{ id: 1, user_id: 1, blackbaud_constituent_id: "123" }]);
    sql.mockResolvedValueOnce([{ workspace_user_id: 1, constituent_id: "123", cache_key: `prospect-activity-v1|gift|${digest}`,
      payload: { version: 1, fetchedAt: "2026-09-08", data: { amount: 12 } } }]);
    const rows = await loadProspectExport(options({ columns: ["latestGiftAmount"] }), context({ id: 5, role: "admin" }));
    const [query, owners, authId, keys] = sql.mock.calls[1];
    expect(query.join(" ")).toContain("auth_user_id =");
    expect(owners).toEqual(["1"]);
    expect(authId).toBe(5);
    expect(keys).toEqual([`prospect-activity-v1|gift|${digest}`]);
    expect(rows[0].cached_gift.data.amount).toBe(12);
  });
});
