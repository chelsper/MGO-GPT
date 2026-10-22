// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => Object.fromEntries(["auth", "user", "schema", "access", "read", "refresh", "transport", "metadata"].map(k => [k, vi.fn()])));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: m.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: m.access }));
vi.mock("@/app/api/utils/fyBudgetCash", async original => ({ ...await original(), readBudgetCashState: m.read, refreshBudgetCash: m.refresh }));
vi.mock("@/app/api/utils/fyRevenueGoals", async original => ({ ...await original(), revenueTransport: m.transport }));
import { defaultBudgetFundNames } from "@/utils/fyBudgetCash";
import { GET, POST } from "./route";
const url = "https://app.example/api/reports/fy-revenue-goals/budget-cash";
const request = (body, headers) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const input = { queryId: "31075", queryName: "Budget Cash", mode: "gift", confirmed: true, fundNames: defaultBudgetFundNames(),
  columns: { giftId: "System Record ID", amount: "Gift Amount", fundId: "Fund System Record ID", fundName: "Fund Description" } };
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  m.user.mockResolvedValue({ id: 1, role: "admin", active: true }); m.access.mockResolvedValue({ canView: true });
  m.read.mockResolvedValue({ revision: null, source: null, snapshot: null, updatedBy: 3 });
  m.refresh.mockResolvedValue({ revision: "updated", source: input, snapshot: { receivedCents: 1000 } });
  m.transport.mockResolvedValue({ metadata: m.metadata });
  m.metadata.mockResolvedValue({ id: "31075", name: input.queryName, type: "Gift", select_fields: Object.values(input.columns).map(name => ({ query_field: { selected_field_name: name } })) });
});
it("authenticates both routes before any database or provider access", async () => {
  m.auth.mockResolvedValue(null);
  expect((await GET()).status).toBe(401); expect((await POST(request({}))).status).toBe(401);
  expect(m.schema).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled();
});
it("serves saved aggregates to a shared viewer without executing a query", async () => {
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true });
  const response = await GET(); expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toEqual({ revision: null, source: null, snapshot: null, canManage: false });
  expect(m.transport).not.toHaveBeenCalled();
});
it.each(["mgo", "executive"])("prevents %s from configuring, refreshing or reading source metadata", async role => {
  m.user.mockResolvedValue({ id: 2, role, active: true });
  for (const operation of ["fields", "refresh"]) expect((await POST(request({ operation, input, revision: null }))).status).toBe(403);
  expect(m.transport).not.toHaveBeenCalled();
});
it("rejects inactive and unshared accounts", async () => {
  m.user.mockResolvedValue({ id: 2, role: "admin", active: false }); expect((await GET()).status).toBe(403);
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true }); m.access.mockResolvedValue({ canView: false }); expect((await GET()).status).toBe(403);
  expect(m.read).not.toHaveBeenCalled();
});
it.each(["admin", "advancement_services"])("allows %s to inspect only the cash query metadata", async role => {
  m.user.mockResolvedValue({ id: 3, role, active: true });
  const response = await POST(request({ operation: "fields" }));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ queryId: "31075", suggested: { ...input.columns, splitId: "" } });
  expect(m.transport).toHaveBeenCalledWith("https://app.example", "31075"); expect(m.refresh).not.toHaveBeenCalled();
});
it("validates the cash source and confirmation before provider access", async () => {
  for (const changes of [{ confirmed: false }, { queryId: "31074" }, { userId: 4 }]) {
    expect((await POST(request({ operation: "refresh", input: { ...input, ...changes }, revision: null }))).status).toBe(400);
  }
  expect(m.transport).not.toHaveBeenCalled();
  expect((await POST(request({ operation: "refresh", input, revision: null }))).status).toBe(200);
  expect(m.refresh).toHaveBeenCalledWith(expect.objectContaining({ input, revision: null, user: { id: 1, role: "admin", active: true } }));
});
it("rejects cross-origin, forged-user, oversized and stale request shapes", async () => {
  expect((await POST(request({}, { origin: "https://other.example" }))).status).toBe(403);
  expect((await POST(request({ operation: "fields", userId: 2 }))).status).toBe(400);
  expect((await POST(request({ operation: "delete" }))).status).toBe(400);
  expect((await POST(request({ input: "x".repeat(8001) }))).status).toBe(413);
  expect((await POST(request({ operation: "refresh", input, revision: "bad" }))).status).toBe(409);
  expect(m.transport).not.toHaveBeenCalled();
});
it("redacts unexpected provider or database errors", async () => {
  m.read.mockRejectedValue(new Error("private signed URL")); const response = await GET();
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("private signed URL");
});
