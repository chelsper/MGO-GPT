import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), schema: vi.fn(), sql: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
import * as route from "./route";

const request = (query = "") => new Request(`https://example.test/api/stewardship/gift-follow-ups${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "auth-2", email: "reviewer@example.test" } });
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin", active: true }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  mocks.sql.mockResolvedValue([{ total: 0, page: 1, pages: 1, page_size: 25, items: [], owners: [] }]);
});

it.each(["admin", "advancement_services", "reviewer", "advancement_admin", "mgo,advancement_services"])("permits active real reviewer role %s", async role => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role, active: true }, workspaceUser: { id: 7, role: "mgo" } });
  const response = await route.GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  expect(await response.json()).toMatchObject({ viewerKey: "auth-2", total: 0, items: [], pageSize: 25, asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  expect(mocks.sql).toHaveBeenCalledTimes(1);
});

it.each(["mgo", "executive", "", "made-up"])("denies real role %s even with an admin selected", async role => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role, active: true }, workspaceUser: { id: 1, role: "admin" } });
  const response = await route.GET(request("?workspaceId=1"));
  expect(response.status).toBe(403);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.sql).not.toHaveBeenCalled();
});

it.each([{ id: 2, role: "admin", active: false }, null, { role: "admin" }])("denies inactive or missing real users", async sessionUser => {
  mocks.context.mockResolvedValue({ sessionUser });
  expect((await route.GET(request())).status).toBe(403);
  expect(mocks.sql).not.toHaveBeenCalled();
});

it("does no database work before authentication", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await route.GET(request())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  expect(mocks.context).not.toHaveBeenCalled();
  expect(mocks.sql).not.toHaveBeenCalled();
});

it("uses only a bounded saved-task projection and never selected-workspace authority", async () => {
  await route.GET(request("?search=50%25%20Donor&status=all&owner=8&due=overdue&page=2&workspaceId=999"));
  const [parts, ...values] = mocks.sql.mock.calls[0];
  const statement = parts.join("?");
  expect(values).toEqual(["50% Donor", "all", "8", "overdue", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 2]);
  expect(statement).toContain("WHERE pa.source_gift_id IS NOT NULL");
  expect(statement).toContain("LIMIT 25 OFFSET");
  expect(statement).toContain("pa.source_gift_snapshot->>'constituentId'");
  expect(statement).not.toMatch(/INSERT|UPDATE|DELETE|blackbaud_portfolio|discussion_note|pa.details|u.email|society_letter/i);
  expect(Object.keys(route)).toEqual(["GET"]);
});

it.each(["status=Pending", "due=tomorrow", "owner=-1", "owner=9007199254740992", "owner=2%20OR%201=1", "page=0", "page=1.5", "page=1000001", `search=${"x".repeat(201)}`])("rejects invalid filters: %s", async query => {
  expect((await route.GET(request(`?${query}`))).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});

it("returns a safe error instead of leaking database details or claiming no tasks", async () => {
  mocks.sql.mockRejectedValue(new Error("private connection details"));
  const response = await route.GET(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Gift follow-ups could not be loaded. Please try again." });
});
