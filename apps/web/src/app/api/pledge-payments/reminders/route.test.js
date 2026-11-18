import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), cache: vi.fn(), sky: vi.fn() }));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: m.workspace }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: m.sky }));
vi.mock("@/app/api/utils/pledgePaymentStore", () => ({ pledgeScope: (user, origin) => `${user}:${origin}`, readPledgeCache: m.cache }));
vi.mock("@/utils/standingsPeriods", () => ({ getStandingsPeriods: () => ({ asOf: "2026-11-18" }) }));
import { POST } from "./route";
const body = () => ({ operation: "prepare", jobId: "job", view: "pastDue", today: "2026-11-18", pledges: [{ id: "1", refreshedAt: "2026-11-18T12:00:00Z" }] });
const request = (b = body(), origin = "https://ju.test") => new Request("https://ju.test/api/pledge-payments/reminders", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(b) });
const cache = () => ({ source: { queryId: "12033" }, job: { id: "job", discoveryComplete: true, status: "completed" }, records: [{
  id: "1", constituentId: "10", lookupId: "P100", name: "Fictional Avery", stale: false, refreshedAt: "2026-11-18T12:00:00Z",
  totalCents: 10000, balanceCents: 8000, fundDescriptions: ["Scholarships"], payments: [{ amountCents: 2000, date: "2026-11-01" }],
  installments: [{ id: "i1", date: "2026-11-01", amountCents: 10000, balanceCents: 8000 }],
}] });
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: "staff@example.test" } });
  m.workspace.mockResolvedValue({ sessionUser: { id: 7, role: "advancement_services", active: true }, workspaceUser: { id: 99, role: "mgo" } });
  m.cache.mockResolvedValue(cache()); m.sky.mockResolvedValue({ id: "10", name: "Fictional Avery", deceased: false, inactive: false, no_valid_address: false,
    address: { constituent_id: "10", address_lines: "10 Test St", city: "Jacksonville", state: "FL", postal_code: "32211", country: "United States", inactive: false, do_not_mail: false } });
});
describe("pledge reminder preparation boundary", () => {
  it("uses only the authenticated reviewer's cache and one bounded NXT GET", async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).draft.pledge.amountDueCents).toBe(8000);
    expect(m.cache).toHaveBeenCalledWith("7:https://ju.test");
    expect(m.sky).toHaveBeenCalledExactlyOnceWith("/constituent/v1/constituents/10", { userId: 7, authUserId: 7, origin: "https://ju.test", method: "GET", timeoutMs: 15000, maxRetries: 0 });
  });
  it("rechecks cache before export without calling NXT or trusting client amounts", async () => {
    expect((await POST(request({ ...body(), operation: "check", amountDueCents: 1 }))).status).toBe(200);
    expect(m.sky).not.toHaveBeenCalled();
  });
  it("requires active reviewer access, never acting-MGO authority", async () => {
    m.auth.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(401);
    for (const user of [{ id: 7, role: "mgo", active: true }, { id: 7, role: "admin", active: false }]) {
      m.workspace.mockResolvedValue({ sessionUser: user, workspaceUser: { role: "admin", active: true } });
      expect((await POST(request())).status).toBe(403);
    }
    expect(m.cache).not.toHaveBeenCalled(); expect(m.sky).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, invalid IDs, bulk preparation, repeats and excessive requests before NXT", async () => {
    expect((await POST(request(body(), "https://evil.test"))).status).toBe(403);
    for (const b of [{ ...body(), view: "all" }, { ...body(), pledges: [] }, { ...body(), pledges: [{ id: "1/../2", refreshedAt: "now" }] },
      { ...body(), pledges: [...body().pledges, ...body().pledges] }, { ...body(), operation: "check", pledges: Array.from({ length: 201 }, (_, i) => ({ id: String(i + 1), refreshedAt: "now" })) }])
      expect((await POST(request(b))).status).toBe(400);
    expect(m.sky).not.toHaveBeenCalled();
  });
  it.each(["running", "paused", "cancelled"])("holds %s jobs", async status => {
    const data = cache(); data.job.status = status; m.cache.mockResolvedValue(data);
    expect((await POST(request())).status).toBe(409); expect(m.sky).not.toHaveBeenCalled();
  });
  it("rejects stale, absent, changed, legacy, duplicate and wrong-day data", async () => {
    for (const mutate of [d => { d.records[0].stale = true; }, d => { d.records = []; }, d => { d.records[0].refreshedAt = "changed"; },
      d => { d.requiresQueryRefresh = true; }, d => { d.records.push(d.records[0]); }, d => { d.job.discoveryComplete = false; }]) {
      const data = cache(); mutate(data); m.cache.mockResolvedValue(data);
      expect((await POST(request())).status).toBe(409);
    }
    m.cache.mockResolvedValue(cache()); expect((await POST(request({ ...body(), today: "2026-11-17" }))).status).toBe(409);
    expect(m.sky).not.toHaveBeenCalled();
  });
  it("preserves ready pledges in completed-with-errors jobs and holds changed cache after reading", async () => {
    const data = cache(); data.job.status = "completed_with_errors"; m.cache.mockResolvedValue(data);
    expect((await POST(request())).status).toBe(200);
    m.cache.mockResolvedValueOnce(cache()).mockResolvedValueOnce({ ...cache(), job: { ...cache().job, id: "new" } });
    expect((await POST(request())).status).toBe(409);
  });
  it("returns a blocked draft for Do not mail and sanitizes upstream failures", async () => {
    m.sky.mockResolvedValueOnce({ id: "10", address: { constituent_id: "10", do_not_mail: true } });
    expect((await (await POST(request())).json()).draft.blocked).toContain("Do not mail");
    m.sky.mockRejectedValueOnce(new Error("private token donor data")); const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private token");
  });
});
