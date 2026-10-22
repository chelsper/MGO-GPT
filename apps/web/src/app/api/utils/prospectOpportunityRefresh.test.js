import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { sql, fetchNxt, clearCaches } = vi.hoisted(() => ({ sql: vi.fn(), fetchNxt: vi.fn(), clearCaches: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: fetchNxt }));
vi.mock("./userDataCache", () => ({ clearUserDashboardDataCaches: clearCaches }));
import { normalizeLinkedOpportunity, opportunityRefreshDue, refreshLinkedProspectOpportunities } from "./prospectOpportunityRefresh";
import { FUNDED_OPPORTUNITY_STATUS, DECLINED_OPPORTUNITY_STATUS } from "./prospectOpportunities";

const saved = {
  id: 301, blackbaud_opportunity_id: "900", title: "Old title", current_stage: "Cultivation",
  opportunity_status: "Active", estimated_amount: "10000", ask_date: "2026-08-01",
  expected_date: "2027-06-30", closed_amount: null, close_date: null, purpose: "Campaign",
  latest_notes: "Local context", revision: "2026-09-20T12:00:00Z", checked_revision: null,
};
const remote = { id: "900", constituent_id: "123", name: "Updated title", status: "Solicitation",
  ask_amount: { value: 25000 }, ask_date: "2026-09-01T00:00:00Z", expected_date: "2027-05-31T00:00:00Z" };
const context = { userId: 44, authUserId: 1, origin: "https://example.com", prospectId: 7, constituentId: "123" };
const queryText = (call) => call[0].join("");
const writes = () => sql.mock.calls.filter((call) => queryText(call).includes("SET title ="));

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
  sql.mockReset().mockResolvedValue([{ id: 301 }]);
  fetchNxt.mockReset().mockResolvedValue(remote); clearCaches.mockReset().mockResolvedValue();
});
afterEach(() => vi.useRealTimers());

describe("NXT opportunity field normalization", () => {
  it("refreshes populated title, stage, amounts, and dates without importing local notes", () => {
    const next = normalizeLinkedOpportunity(remote, saved, "123");
    expect(next).toMatchObject({ title: "Updated title", current_stage: "Solicitation", estimated_amount: 25000,
      ask_date: "2026-09-01", expected_date: "2027-05-31", opportunity_status: "Active" });
    expect(next).not.toHaveProperty("latest_notes");
  });
  it("retains zero and distinguishes explicitly cleared fields from omitted fields", () => {
    const next = normalizeLinkedOpportunity({ ...remote, ask_amount: { value: 0 }, expected_date: null, ask_date: undefined }, saved, "123");
    expect(next.estimated_amount).toBe(0); expect(next.expected_date).toBeNull(); expect(next.ask_date).toBe("2026-08-01");
  });
  it.each([{}, { id: "901" }, { constituent_id: "456" }, { status: null }, { name: "" },
    { ask_amount: { value: "25000" } }, { expected_date: "2027-02-30" }, { inactive: "maybe" }])("rejects unverified payloads: %j", (patch) => {
    const payload = Object.keys(patch).length ? { ...remote, ...patch } : {};
    expect(() => normalizeLinkedOpportunity(payload, saved, "123")).toThrow();
  });
  it("recognizes funded status even without a funded date or amount", () => {
    expect(normalizeLinkedOpportunity({ ...remote, status: "Funded" }, saved, "123").opportunity_status).toBe(FUNDED_OPPORTUNITY_STATUS);
  });
  it("closes withdrawn records without inventing a close date", () => {
    expect(normalizeLinkedOpportunity({ ...remote, status: "Withdrawn" }, saved, "123")).toMatchObject({
      current_stage: "Withdrawn", opportunity_status: DECLINED_OPPORTUNITY_STATUS, close_date: null,
    });
  });
  it("can reopen a previously funded opportunity without retaining the old funded amount", () => {
    expect(normalizeLinkedOpportunity(remote, { ...saved, closed_amount: 10000, close_date: "2026-09-01" }, "123"))
      .toMatchObject({ opportunity_status: "Active", closed_amount: null, close_date: null });
  });
  it("excludes explicitly inactive opportunities from the active pipeline", () => {
    expect(normalizeLinkedOpportunity({ ...remote, inactive: true }, saved, "123").opportunity_status).toBe("Inactive");
  });
  it("retains explicit archives on later NXT checks, including funded history", () => {
    expect(normalizeLinkedOpportunity({ ...remote, status: "Funded", inactive: true, funded_amount: { value: 800 } }, { ...saved, opportunity_status: "Archived" }, "123"))
      .toMatchObject({ opportunity_status: "Archived", current_stage: "Funded", closed_amount: 800 });
    expect(opportunityRefreshDue({ ...saved, pipeline_change_id: "pending" }, { force: true })).toBe(false);
  });
});

describe("bounded linked opportunity refresh", () => {
  it("refreshes fully populated closed records, uses read-only NXT calls, and updates derived totals", async () => {
    sql.mockResolvedValueOnce([{ ...saved, closed_amount: 10000, close_date: "2026-09-01" }]);
    const result = await refreshLinkedProspectOpportunities(context);
    expect(result).toMatchObject({ checked: 1, changed: 1, unavailable: 0 });
    expect(fetchNxt).toHaveBeenCalledWith("/opportunity/v1/opportunities/900", expect.objectContaining({
      userId: 44, authUserId: 1, method: "GET", maxRetries: 0, timeoutMs: 8000,
    }));
    expect(writes()).toHaveLength(1);
    const query = queryText(writes()[0]);
    expect(query).toContain("updated_at::text IS NOT DISTINCT FROM");
    expect(query).toContain("nxt_checked_at::text IS NOT DISTINCT FROM");
    expect(query).toContain("nxt_retry_after =");
    expect(query).not.toMatch(/updated_at\s*=|latest_notes\s*=|shared_opportunity_key\s*=/);
    const totals = sql.mock.calls.find((call) => queryText(call).includes("WITH totals"));
    expect(queryText(totals)).toContain("p.status = 'Archived'");
    expect(queryText(totals)).not.toContain("priority_order");
    expect(clearCaches).toHaveBeenCalledWith(44);
  });
  it("does not fetch fresh records or force past the minimum spacing", async () => {
    sql.mockResolvedValueOnce([{ ...saved, nxt_checked_at: "2026-09-23T11:59:50Z" }]);
    await refreshLinkedProspectOpportunities({ ...context, force: true });
    expect(fetchNxt).not.toHaveBeenCalled();
    expect(opportunityRefreshDue({ ...saved, nxt_checked_at: "2026-09-23T11:57:00Z" })).toBe(false);
    expect(opportunityRefreshDue({ ...saved, nxt_checked_at: "2026-09-23T11:57:00Z" }, { force: true })).toBe(true);
  });
  it("does not overwrite recent app edits with a lagging NXT response", async () => {
    sql.mockResolvedValueOnce([{ ...saved, revision: "2026-09-23T11:55:00Z" }]);
    expect(await refreshLinkedProspectOpportunities({ ...context, force: true })).toMatchObject({ deferred: 1 });
    expect(fetchNxt).not.toHaveBeenCalled();
  });
  it("preserves saved records when another refresh owns the lease", async () => {
    sql.mockResolvedValueOnce([saved]).mockResolvedValueOnce([]);
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ deferred: 1 });
    expect(fetchNxt).not.toHaveBeenCalled();
  });
  it("does not count a concurrent-edit compare-and-set miss as a verified refresh", async () => {
    sql.mockResolvedValueOnce([saved]).mockResolvedValueOnce([{ id: 301 }]).mockResolvedValueOnce([]);
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ checked: 0, changed: 0, deferred: 1 });
    expect(clearCaches).not.toHaveBeenCalled();
  });
  it("keeps saved values when NXT fails or returns a different constituent", async () => {
    sql.mockResolvedValueOnce([saved]); fetchNxt.mockResolvedValueOnce({ ...remote, constituent_id: "456" });
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ unavailable: 1, changed: 0 });
    expect(writes()).toHaveLength(0); expect(clearCaches).not.toHaveBeenCalled();
  });
  it("stops on rate limits and persists a retry time without clearing records", async () => {
    sql.mockResolvedValueOnce([saved, { ...saved, id: 302, blackbaud_opportunity_id: "901" }]);
    fetchNxt.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { httpStatus: 429, retryAfterMs: 300000 }));
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ unavailable: 1, deferred: 1 });
    expect(fetchNxt).toHaveBeenCalledTimes(1); expect(writes()).toHaveLength(0);
    expect(sql.mock.calls.at(-1)).toContain("2026-09-23T12:05:00.000Z");
  });
  it("caps each pass and never reads opportunities without a verified constituent link", async () => {
    sql.mockResolvedValueOnce(Array.from({ length: 10 }, (_, id) => ({ ...saved, id })));
    const result = await refreshLinkedProspectOpportunities(context);
    expect(fetchNxt).toHaveBeenCalledTimes(8); expect(result.deferred).toBe(2);
    fetchNxt.mockClear(); sql.mockResolvedValueOnce([saved]);
    expect(await refreshLinkedProspectOpportunities({ ...context, constituentId: null })).toMatchObject({ unavailable: 1 });
    expect(fetchNxt).not.toHaveBeenCalled();
  });
  it("keeps NXT reads sequential", async () => {
    sql.mockResolvedValueOnce([saved, { ...saved, id: 302 }]);
    let release;
    fetchNxt.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = refreshLinkedProspectOpportunities(context);
    await vi.waitFor(() => expect(fetchNxt).toHaveBeenCalledTimes(1));
    release(remote); await pending;
    expect(fetchNxt).toHaveBeenCalledTimes(2);
  });
  it("repairs derived totals on an unchanged verified read or an explicit cached retry", async () => {
    sql.mockResolvedValueOnce([{ ...saved, ...normalizeLinkedOpportunity(remote, saved, "123") }]);
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ changed: 0, checked: 1, reconciled: true });
    expect(clearCaches).toHaveBeenCalledWith(44);
    fetchNxt.mockClear(); clearCaches.mockClear();
    sql.mockResolvedValueOnce([{ ...saved, nxt_checked_at: "2026-09-23T11:59:50Z" }]);
    expect(await refreshLinkedProspectOpportunities({ ...context, force: true })).toMatchObject({ checked: 0, reconciled: true });
    expect(fetchNxt).not.toHaveBeenCalled(); expect(clearCaches).toHaveBeenCalledWith(44);
  });
});
