import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), sql: vi.fn(), action: vi.fn(), opportunity: vi.fn() }));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: m.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: m.sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({ getBlackbaudAction: m.action, getBlackbaudOpportunity: m.opportunity }));
import { GET, POST } from "./route";
const payload = { constituent_id: "123", summary: "Call", date: "2026-09-21", category: "Phone Call", completed: true, description: "Notes: hello", fundraisers: ["99"] };
let row;
const req = (body = {}, headers = {}) => new Request("https://example.org/api/nxt-write-recovery", { method: "POST",
  headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ workspaceId: 7, receiptId: "1", remoteId: "456", ...body }) });
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  m.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin", active: true }, workspaceUser: { id: 7, name: "MGO", role: "mgo", active: true }, isActing: true });
  row = { id: "1", kind: "action", constituent_id: "123", remote_id: "456", state: "created", payload, updated_at: "2026-09-01T00:00:00Z" };
  m.sql.mockImplementation(async parts => parts.join("").includes("UPDATE") ? [{ ...row, state: "verified" }] : [row]);
  m.action.mockResolvedValue({ id: "456", ...payload });
});
it("GET reads only owner-scoped receipts with no NXT calls and omits private notes", async () => {
  const response = await GET(new Request("https://example.org/api/nxt-write-recovery?workspaceId=999"));
  expect(response.status).toBe(200);
  expect(m.sql.mock.calls[0].slice(1)).toContain(7);
  expect(await response.text()).not.toContain("Notes: hello");
  expect(m.action).not.toHaveBeenCalled(); expect(m.opportunity).not.toHaveBeenCalled();
});
it("verifies the existing action with the actor's credentials without touching local activity or reminders", async () => {
  const response = await POST(req());
  expect(response.status).toBe(200);
  expect((await response.json()).receipt.state).toBe("verified");
  expect(m.action).toHaveBeenCalledExactlyOnceWith({ userId: 7, authUserId: 2, origin: "https://example.org", actionId: "456" });
  const text = m.sql.mock.calls.map(([parts]) => parts.join(" ")).join(" ");
  expect(text).not.toMatch(/prospect_updates|pending_actions|INSERT|DELETE/);
  expect(text).toContain("updated_at ="); expect(text).toContain("verified_by_user_id");
});
it.each([{ constituent_id: "999" }, { id: "999" }, { summary: "Wrong" }, { description: "Other" }, { completed: false }, { date: "2020-01-01" }, { fundraisers: [] }])("does not unlock a mismatched action %j", async changes => {
  m.action.mockResolvedValue({ id: "456", ...payload, ...changes });
  expect((await POST(req())).status).toBe(409);
  expect(m.sql).toHaveBeenCalledTimes(1);
});
it("does not accept another ID when an NXT ID was already saved", async () => {
  expect((await POST(req({ remoteId: "999" }))).status).toBe(409); expect(m.action).not.toHaveBeenCalled();
});
it("can verify a user-identified existing record after an ID-less uncertain response", async () => {
  row.remote_id = null; row.state = "review";
  expect((await POST(req())).status).toBe(200); expect(m.action).toHaveBeenCalledOnce();
});
it("does not unlock on 404, provider failure, or concurrent state change", async () => {
  m.action.mockRejectedValue(new Error("private provider body"));
  const response = await POST(req()); expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private provider body"); expect(m.sql).toHaveBeenCalledTimes(1);
  m.action.mockResolvedValue({ id: "456", ...payload });
  m.sql.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
  expect((await POST(req())).status).toBe(409);
});
it.each(["complete", "verified"])("never replays local work for a %s receipt", async state => {
  row.state = state; expect((await POST(req())).status).toBe(200);
  expect(m.action).not.toHaveBeenCalled(); expect(m.sql).toHaveBeenCalledTimes(1);
});
it("refuses verification while a fresh create could still be running", async () => {
  row.state = "processing"; row.updated_at = new Date().toISOString();
  expect((await POST(req())).status).toBe(409); expect(m.action).not.toHaveBeenCalled();
});
it("verifies opportunity identity and amounts with a read only", async () => {
  row.kind = "opportunity"; row.payload = { constituent_id: "123", name: "Scholarship", status: "Cultivation", expected_amount: { value: 5000 }, expected_date: "2027-06-30" };
  m.opportunity.mockResolvedValue({ id: "456", ...row.payload });
  expect((await POST(req())).status).toBe(200); expect(m.action).not.toHaveBeenCalled();
  m.opportunity.mockResolvedValue({ id: "456", ...row.payload, expected_amount: { value: 6000 } });
  expect((await POST(req())).status).toBe(409);
});
it("blocks unauthenticated, inactive, cross-site, wrong-workspace and foreign receipts", async () => {
  m.auth.mockResolvedValueOnce(null); expect((await POST(req())).status).toBe(401);
  m.context.mockResolvedValueOnce({ sessionUser: { active: false }, workspaceUser: { id: 7 } });
  expect((await POST(req())).status).toBe(403);
  expect((await POST(req({}, { origin: "https://foreign.example" }))).status).toBe(403);
  expect((await POST(req({ workspaceId: 99 }))).status).toBe(400);
  m.sql.mockResolvedValueOnce([]); expect((await POST(req())).status).toBe(404);
  expect(m.action).not.toHaveBeenCalled();
});
it("denies an executive editing another fundraiser's receipts", async () => {
  m.context.mockResolvedValue({ sessionUser: { id: 2, role: "executive" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  expect((await POST(req())).status).toBe(403); expect(m.sql).not.toHaveBeenCalled();
});
