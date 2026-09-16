import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), schema: vi.fn(), sql: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "viewer@example.com" } });
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 7, name: "Selected MGO", role: "mgo" }, isActing: true });
  mocks.sql.mockResolvedValue([]);
});
const request = (query = "") => new Request(`https://example.com/api/follow-ups${query}`);

it("returns the complete saved list with constituent names and keeps all joins workspace-scoped", async () => {
  const items = Array.from({ length: 40 }, (_, id) => ({ id, title: "Call", prospect_id: null, constituent_name: `Person ${id}`, category: "Stewardship" }));
  mocks.sql.mockResolvedValue(items);
  const response = await GET(request("?workspaceId=999"));
  const payload = await response.json();
  expect(payload.items).toEqual(items);
  expect(payload.workspace).toEqual({ id: 7, name: "Selected MGO", canEdit: true, isActing: true });
  expect(payload.viewerId).toBe(2);
  expect(payload.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.sql).toHaveBeenCalledTimes(1);
  const [parts, ...values] = mocks.sql.mock.calls[0];
  const sql = parts.join("?");
  expect(sql).toContain("LEFT JOIN prospects");
  expect(sql).toContain("pa.updated_at::text AS updated_at");
  expect(sql).toContain("p.user_id = pa.owner_user_id");
  expect(sql).toContain("c.user_id = pa.owner_user_id");
  expect(sql).toContain("WHERE pa.owner_user_id = ? AND pa.status = ?");
  expect(sql).toContain("discussion_item_participants");
  expect(sql).not.toMatch(/p.status|LIMIT|blackbaud_portfolio_cache/);
  expect(values).not.toContain(999);
  expect(values.slice(-2)).toEqual([7, "Open"]);
});

it("serves completed history without limiting it to active top prospects", async () => {
  await GET(request("?status=Done"));
  expect(mocks.sql.mock.calls[0].at(-1)).toBe("Done");
});

it("keeps executive views read-only while allowing an MGO to edit their own work", async () => {
  mocks.context.mockResolvedValueOnce({ sessionUser: { id: 2, role: "executive" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  expect((await (await GET(request())).json()).workspace.canEdit).toBe(false);
  mocks.context.mockResolvedValueOnce({ sessionUser: { id: 7, role: "mgo" }, workspaceUser: { id: 7, role: "mgo" }, isActing: false });
  expect((await (await GET(request())).json()).workspace.canEdit).toBe(true);
});

it("rejects unauthenticated reads before doing database work", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  expect(mocks.sql).not.toHaveBeenCalled();
});

it("fails closed on an invalid selected workspace", async () => {
  mocks.context.mockResolvedValue({ workspaceUser: { id: 2 }, invalidActingUserId: 999 });
  expect((await GET(request())).status).toBe(403);
  expect(mocks.sql).not.toHaveBeenCalled();
});

it("rejects invalid status rather than broadening the result", async () => {
  expect((await GET(request("?status=all"))).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});
