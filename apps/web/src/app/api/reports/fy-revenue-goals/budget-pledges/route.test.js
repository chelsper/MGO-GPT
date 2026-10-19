// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => Object.fromEntries(["auth", "user", "schema", "access", "read", "start", "resume", "transport", "metadata", "adjust"].map(k => [k, vi.fn()])));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: m.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: m.access }));
vi.mock("@/app/api/utils/fyBudgetPledges", async original => ({ ...await original(), readBudgetPledgeState: m.read, startBudgetPledgeRefresh: m.start, continueBudgetPledgeRefresh: m.resume, savePledgeAdjustment: m.adjust }));
vi.mock("@/app/api/utils/fyRevenueGoals", async original => ({ ...await original(), revenueTransport: m.transport }));
import { suggestPledgeColumns } from "@/utils/fyBudgetPledges";
import { GET, POST } from "./route";
const url = "https://app.example/api/reports/fy-revenue-goals/budget-pledges";
const get = query => GET(new Request(`${url}${query || ""}`));
const request = (body, headers) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const fields = ["System Record ID", "Name", "Installment Amount Due", "Installment Date Due", "Fund Description"];
const input = { queryId: "31076", queryName: "Pledge installments", confirmed: true, columns: suggestPledgeColumns(fields) };
const state = { revision: null, source: null, snapshot: null, job: null };
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  m.user.mockResolvedValue({ id: 1, role: "admin", active: true }); m.access.mockResolvedValue({ canView: true });
  m.read.mockResolvedValue(state); m.start.mockResolvedValue(state); m.resume.mockResolvedValue(state);
  m.adjust.mockResolvedValue(state);
  m.transport.mockResolvedValue({ metadata: m.metadata });
  m.metadata.mockResolvedValue({ id: "31076", name: input.queryName, type: "Gift", select_fields: fields.map(name => ({ query_field: { selected_field_name: name } })) });
});
it("authenticates before touching donor data or provider connections", async () => {
  m.auth.mockResolvedValue(null);
  expect((await get()).status).toBe(401); expect((await POST(request({}))).status).toBe(401);
  expect(m.read).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled(); expect(m.schema).not.toHaveBeenCalled();
});
it("gives authorized viewers cached, private paginated results, not a running job's private draft", async () => {
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true });
  m.read.mockResolvedValue({ ...state, updatedBy: 1, snapshot: { period: { startsOn: "2026-07-01" }, outstandingCents: 1000, rows: [{ key: "1:1", name: "A", fundName: "Fund", giftId: "1", dueDate: "2026-12-01", outstandingCents: 1000 }] }, job: { pledges: [{ name: "Private draft" }], cursor: 0 } });
  const response = await get("?page=1&search=A");
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const result = await response.json(); expect(result.canManage).toBe(false); expect(result.job).toBeNull(); expect(result.rows).toHaveLength(1);
  expect(result).not.toHaveProperty("updatedBy"); expect(m.transport).not.toHaveBeenCalled();
});
it.each(["mgo", "executive"])("blocks %s from source inspection, start and continuation", async role => {
  m.user.mockResolvedValue({ id: 2, role, active: true });
  for (const operation of ["fields", "refresh", "continue", "adjust", "reset-adjustment"]) expect((await POST(request({ operation, input, revision: null }))).status).toBe(403);
  expect(m.adjust).not.toHaveBeenCalled();
  expect(m.transport).not.toHaveBeenCalled();
});
it("blocks inactive and unshared users and rejects unbounded filters", async () => {
  m.user.mockResolvedValue({ id: 2, role: "admin", active: false }); expect((await get()).status).toBe(403);
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true }); m.access.mockResolvedValue({ canView: false }); expect((await get()).status).toBe(403);
  m.access.mockResolvedValue({ canView: true });
  for (const query of ["?page=-1", "?page=1.5", "?page=999999", "?other=1", `?search=${"a".repeat(151)}`]) expect((await get(query)).status).toBe(400);
  expect(m.read).not.toHaveBeenCalled();
});
it.each(["admin", "advancement_services"])("lets %s inspect, start, and resume only query 31076", async role => {
  m.user.mockResolvedValue({ id: 3, role, active: true });
  expect((await POST(request({ operation: "fields" }))).status).toBe(200);
  expect(m.start).not.toHaveBeenCalled(); expect(m.resume).not.toHaveBeenCalled();
  expect((await POST(request({ operation: "refresh", input, revision: null }))).status).toBe(200);
  expect((await POST(request({ operation: "continue", revision: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }))).status).toBe(200);
  expect(m.transport.mock.calls.every(call => call[1] === "31076")).toBe(true);
  expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ input, user: { id: 3, role, active: true } }));
});
it("validates source, origin, revision, and operation before provider access", async () => {
  for (const changes of [{ confirmed: false }, { queryId: "31075" }, { userId: 4 }]) expect((await POST(request({ operation: "refresh", input: { ...input, ...changes }, revision: null }))).status).toBe(400);
  expect((await POST(request({ operation: "continue", revision: "bad" }))).status).toBe(409);
  expect((await POST(request({ operation: "delete" }))).status).toBe(400);
  expect((await POST(request({ operation: "fields", userId: 2 }))).status).toBe(400);
  expect((await POST(request({ operation: "fields" }, { origin: "https://other.example" }))).status).toBe(403);
  expect(m.transport).not.toHaveBeenCalled();
});
it("redacts private database errors", async () => {
  m.read.mockRejectedValue(new Error("SECRET signed URL")); const response = await get(); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("SECRET");
});
it.each(["admin", "advancement_services"])("saves %s adjustments locally without creating an NXT transport", async role => {
  m.user.mockResolvedValue({ id: 7, role, active: true });
  for (const operation of ["adjust", "reset-adjustment"]) expect((await POST(request({ operation, revision: null, input: { key: "1:1", amount: "100", reason: "Partial" } }))).status).toBe(200);
  expect(m.transport).not.toHaveBeenCalled(); expect(m.adjust).toHaveBeenCalledTimes(2);
});
