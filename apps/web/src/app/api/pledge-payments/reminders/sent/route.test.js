import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), sky: vi.fn(), store: {
  read: vi.fn(), list: vi.fn(), receipt: vi.fn(), claim: vi.fn(), checkpoint: vi.fn(), hold: vi.fn(), verify: vi.fn(),
} }));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: m.workspace }));
vi.mock("@/app/api/utils/blackbaud", async importOriginal => ({ ...await importOriginal(), blackbaudApiFetch: m.sky }));
vi.mock("@/app/api/utils/pledgeReminderLogStore", async importOriginal => ({ ...await importOriginal(), createReminderLogStore: () => m.store }));
vi.mock("@/utils/standingsPeriods", () => ({ getStandingsPeriods: () => ({ asOf: "2026-11-20" }) }));
import { GET, POST } from "./route";
import { reminderActionPayload } from "@/app/api/utils/pledgeReminderAction";
const snapshotId = "10000000-0000-4000-8000-000000000001", receiptId = "20000000-0000-4000-8000-000000000001";
const user = { id: 7, name: "Fictional Staff", email: "staff@example.test", role: "advancement_services", active: true };
const snapshot = { id: snapshotId, owner_id: 7, origin: "https://ju.test", event_key: "e".repeat(64), snapshot: {
  pledgeId: "1", constituentId: "10", name: "Avery Example", lookupId: "P100", funds: ["Fictional Scholarship"],
  email: "avery@example.test", preparedOn: "2026-11-19", letterDate: "2026-11-19", dueDate: "2026-11-01", view: "pastDue",
  amountDueCents: 50000, totalCents: 100000, paidToDateCents: 25000, balanceCents: 75000, refreshedAt: "2026-11-19T12:00:00Z",
} };
const payload = reminderActionPayload(snapshot, "2026-11-20", user);
const receipt = { id: receiptId, snapshot_id: snapshotId, owner_id: 7, sent_date: "2026-11-20", state: "processing", action_id: null,
  payload, updated_at: "2026-11-20T12:00:00Z" };
const body = () => ({ operation: "record", snapshotId, sentDate: "2026-11-20", confirm: true });
const request = (data = body(), origin = "https://ju.test") => new Request("https://ju.test/api/pledge-payments/reminders/sent", {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(data),
});
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: user.email } }); m.schema.mockResolvedValue();
  m.workspace.mockResolvedValue({ sessionUser: user, workspaceUser: { id: 99, role: "mgo" } });
  m.store.read.mockResolvedValue(structuredClone(snapshot)); m.store.list.mockResolvedValue([snapshot]);
  m.store.receipt.mockResolvedValue(null); m.store.claim.mockResolvedValue(structuredClone(receipt));
  m.store.checkpoint.mockResolvedValue(); m.store.hold.mockResolvedValue();
  m.store.verify.mockResolvedValue({ ...receipt, action_id: "90", state: "saved" });
  m.sky.mockImplementation(async (path, options) => path.endsWith("constituents/10") ? { id: "10" }
    : options.method === "POST" ? { id: "90" } : { ...payload, id: "90" });
});
describe("staff-confirmed pledge reminder actions", () => {
  it("reads only the actor's local saved history and receipt, with no NXT calls", async () => {
    const response = await GET(new Request("https://ju.test/api/pledge-payments/reminders/sent"));
    expect(response.status).toBe(200); expect(m.store.list).toHaveBeenCalledWith(7, "https://ju.test");
    const one = await GET(new Request(`https://ju.test/api/pledge-payments/reminders/sent?snapshotId=${snapshotId}`));
    expect((await one.json()).reminder.snapshotId).toBe(snapshotId); expect(m.sky).not.toHaveBeenCalled();
    expect(one.headers.get("cache-control")).toBe("private, no-store");
  });
  it("requires active reviewer authority, not an acting admin workspace", async () => {
    m.auth.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(401);
    for (const actor of [{ ...user, role: "mgo" }, { ...user, active: false }]) {
      m.workspace.mockResolvedValue({ sessionUser: actor, workspaceUser: { id: 99, role: "admin", active: true } });
      expect((await POST(request())).status).toBe(403); expect((await GET(new Request("https://ju.test/api/pledge-payments/reminders/sent"))).status).toBe(403);
    }
    expect(m.store.read).not.toHaveBeenCalled(); expect(m.sky).not.toHaveBeenCalled();
  });
  it("requires same origin, explicit confirmation and a real nonfuture sending date", async () => {
    expect((await POST(request(body(), "https://other.test"))).status).toBe(403);
    for (const change of [{ confirm: false }, { sentDate: "2026-11-21" }, { sentDate: "2026-11-18" }, { sentDate: "2026-02-30" }, { constituentId: "999" }, { amountDueCents: 1 }, { snapshotId: "../bad" }]) {
      expect((await POST(request({ ...body(), ...change }))).status).toBe(400);
    }
    expect(m.sky).not.toHaveBeenCalled(); expect(m.store.claim).not.toHaveBeenCalled();
  });
  it("does not access another owner's snapshot", async () => {
    m.store.read.mockResolvedValue(null); expect((await POST(request())).status).toBe(404);
    expect(m.store.read).toHaveBeenCalledWith(snapshotId, 7, "https://ju.test"); expect(m.sky).not.toHaveBeenCalled();
  });
  it("claims before a single nonretried create and verifies completed Email/Stewardship fields", async () => {
    m.store.receipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...receipt, action_id: "90" });
    const response = await POST(request()); expect(response.status).toBe(200);
    expect((await response.json()).receipt).toMatchObject({ state: "saved", actionId: "90", sentDate: "2026-11-20" });
    expect(m.store.claim.mock.invocationCallOrder[0]).toBeLessThan(m.sky.mock.invocationCallOrder[1]);
    expect(m.sky.mock.calls.map(([, o]) => o.method)).toEqual(["GET", "POST", "GET", "PATCH", "GET"]);
    expect(m.sky.mock.calls.every(([, o]) => o.maxRetries === 0 && o.userId === 7 && o.authUserId === 7)).toBe(true);
    expect(m.sky.mock.calls[1][1].body).toMatchObject({ constituent_id: "10", category: "Email", type: "Stewardship", completed: true });
    expect(m.sky.mock.calls[1][1].body.description).toContain("not verified by the app");
    expect(m.sky.mock.calls[1][1].body.description).toContain("$500.00");
  });
  it.each(["saved", "review", "processing"])("never repeats a %s attempt, even with a changed sending date", async state => {
    m.store.receipt.mockResolvedValue({ ...receipt, state, action_id: "90" });
    const response = await POST(request({ ...body(), sentDate: "2026-11-19" }));
    expect((await response.json()).receipt.state).toBe(state); expect(m.sky).not.toHaveBeenCalled(); expect(m.store.claim).not.toHaveBeenCalled();
  });
  it("holds concurrent or other-staff claims without exposing their receipt ID", async () => {
    m.store.claim.mockResolvedValue(null);
    m.store.receipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...receipt, owner_id: 8, action_id: "90" });
    const response = await POST(request()); expect((await response.json()).receipt).toMatchObject({ otherStaff: true, id: null, actionId: null });
    expect(m.sky.mock.calls.map(([, o]) => o.method)).toEqual(["GET"]);
  });
  it("holds a timed-out create and never automatically retries it", async () => {
    m.sky.mockResolvedValueOnce({ id: "10" }).mockRejectedValueOnce(new Error("private provider body"));
    const response = await POST(request()); expect(response.status).toBe(202);
    expect(await response.text()).not.toContain("private provider"); expect(m.store.hold).toHaveBeenCalledWith(receiptId);
    expect(m.sky.mock.calls.filter(([, o]) => o.method === "POST")).toHaveLength(1);
  });
  it("does not patch an action with a mismatched constituent identity", async () => {
    m.sky.mockResolvedValueOnce({ id: "10" }).mockResolvedValueOnce({ id: "90" }).mockResolvedValueOnce({ id: "90", constituent_id: "11" });
    expect((await POST(request())).status).toBe(202); expect(m.sky.mock.calls.some(([, o]) => o.method === "PATCH")).toBe(false);
  });
  it("records an actual earlier sending after balances change without rereading gifts or refreshing the worklist", async () => {
    m.store.receipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...receipt, action_id: "90" });
    expect((await POST(request())).status).toBe(200);
    expect(m.sky.mock.calls.every(([path]) => path.includes("constituents/") || path.includes("actions"))).toBe(true);
  });
  it("recovers an unknown returned ID by reading exactly one staff-supplied action, never POSTing or PATCHing NXT", async () => {
    m.store.receipt.mockResolvedValue({ ...receipt, state: "review" });
    const response = await POST(request({ operation: "verify", snapshotId, actionId: "90" }));
    expect(response.status).toBe(200); expect(m.sky).toHaveBeenCalledExactlyOnceWith("/constituent/v1/actions/90", expect.objectContaining({ method: "GET", maxRetries: 0 }));
    expect(m.store.claim).not.toHaveBeenCalled();
  });
  it.each(["summary", "type", "description", "completed", "completed_date", "constituent_id", "direction"])("does not verify an incorrect %s", async field => {
    m.store.receipt.mockResolvedValue({ ...receipt, state: "review", action_id: "90" });
    m.sky.mockResolvedValue({ ...payload, id: "90", [field]: "wrong" });
    expect((await POST(request({ operation: "verify", snapshotId }))).status).toBe(409); expect(m.store.verify).not.toHaveBeenCalled();
  });
  it("holds recent processing and saved-ID mismatch before calling NXT", async () => {
    m.store.receipt.mockResolvedValueOnce({ ...receipt, updated_at: new Date().toISOString() });
    expect((await POST(request({ operation: "verify", snapshotId, actionId: "90" }))).status).toBe(409);
    m.store.receipt.mockResolvedValue({ ...receipt, state: "review", action_id: "90" });
    expect((await POST(request({ operation: "verify", snapshotId, actionId: "91" }))).status).toBe(400);
    expect(m.sky).not.toHaveBeenCalled();
  });
});
