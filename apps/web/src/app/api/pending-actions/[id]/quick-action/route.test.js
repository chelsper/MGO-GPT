import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), auth: vi.fn(), context: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
import { POST } from "./route";

const token = "2026-09-15 12:30:10.123456+00";
const request = body => new Request("https://example.com/api/pending-actions/40/quick-action", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "complete", expectedWorkspaceId: 7, expectedUpdatedAt: token, ...body }),
});
const call = body => POST(request(body), { params: { id: "40" } });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  mocks.sql.mockResolvedValue([{ found: true, item: { id: 40, status: "Done" } }]);
});

it.each(["complete", "reopen", "reschedule"])("applies %s with one atomic scoped query, without touching discussions or provider caches", async action => {
  const response = await call({ action, ...(action === "reschedule" ? { dueDate: "2026-09-20" } : {}) });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.sql).toHaveBeenCalledOnce();
  const [parts, ...values] = mocks.sql.mock.calls[0];
  const query = parts.join("?");
  expect(query).toContain("pa.updated_at = ?::timestamptz");
  expect(query).toContain("pa.owner_user_id = ?");
  expect(query).toContain("p.user_id = ?");
  expect(query).toContain("FOR UPDATE");
  expect(query).toContain("next_action_text IS NOT DISTINCT FROM t.title");
  expect(query).toContain("is_primary = CASE WHEN ? THEN FALSE ELSE pa.is_primary END");
  expect(query).not.toContain("discussion_items");
  expect(query).not.toContain("blackbaud_portfolio_cache");
  expect(values).toContain(token);
  expect(values).toContain(action === "reopen" ? "Done" : "Open");
  expect(values).not.toContain(2);
});

it("allows an MGO to manage their own reminders", async () => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 7, role: "mgo" }, workspaceUser: { id: 7, role: "mgo" }, isActing: false });
  expect((await call()).status).toBe(200);
});
it("requires authentication", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await call()).status).toBe(401);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("keeps acting executive views read-only", async () => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "executive" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  expect((await call()).status).toBe(403);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("requires the exact selected workspace", async () => {
  expect((await call({ expectedWorkspaceId: 99 })).status).toBe(409);
  expect((await call({ expectedWorkspaceId: undefined })).status).toBe(409);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it.each([null, undefined, "", "not a timestamp", "2026-09-15"])("rejects missing or invalid version %s", async expectedUpdatedAt => {
  expect((await call({ expectedUpdatedAt })).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it.each(["2026-02-30", "2026-13-01", "2026-9-1", "", undefined, 12, "0000-01-01"])("rejects invalid date %s", async dueDate => {
  expect((await call({ action: "reschedule", dueDate })).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it.each([null, "2028-02-29"])("allows a cleared date and valid leap day: %s", async dueDate => {
  expect((await call({ action: "reschedule", dueDate })).status).toBe(200);
});
it.each([{ action: "delete" }, { title: "Overwrite" }, { status: "Done" }, { discussion_item_id: 99 }, { dueDate: "2026-10-01" }])("rejects unapproved mutations %j", async body => {
  expect((await call(body)).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("returns not found without exposing another owner's record", async () => {
  mocks.sql.mockResolvedValue([{ found: false, item: null }]);
  expect((await call()).status).toBe(404);
});
it("returns a conflict for a stale version, wrong state, or changed primary plan", async () => {
  mocks.sql.mockResolvedValue([{ found: true, item: null }]);
  expect((await call()).status).toBe(409);
  expect(mocks.sql).toHaveBeenCalledOnce();
});
