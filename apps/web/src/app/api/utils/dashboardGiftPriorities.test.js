import { describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({ fetch: vi.fn(), config: vi.fn(() => ({ clientId: "test-client", redirectUri: "https://example.app/callback", subscriptionKey: "synthetic" })) }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: provider.fetch, getBlackbaudConfig: provider.config }));
import { buildGiftPriorities, giftPriorityWindow, loadDashboardGifts, readSavedPortfolioGifts } from "./dashboardGiftPriorities";
import { applyPriorityPreferences, readDashboardPriorities } from "./dashboardPriorities";

const now = new Date("2026-09-27T14:00:00Z");
const gift = { id: "900", constituent_id: "100", type: "Donation", date: "2026-09-25T00:00:00", amount: { value: 2500 }, soft_credits: [] };
const row = (patch = {}, recipient = {}) => ({ gift: { ...gift, ...patch }, constituent_id: "100", name: "Sample Donor", ...recipient });
const saved = (gifts = [row()], patch = {}) => ({ active_metadata: { version: 1, checkedAt: "2026-09-27T06:00:00Z", startDate: "2026-01-01", endDate: "2026-09-27" }, assignments_checked_at: "2026-09-27T05:00:00Z", gifts, ...patch });
const build = (gifts, patch) => buildGiftPriorities(saved(gifts, patch), now);

it("uses configured gift amount/date boundaries without weakening freshness or reviving dismissals", async () => {
  const policy = { giftMinimum: 500, recentGiftDays: 1 };
  expect(giftPriorityWindow(now, policy)).toEqual({ start: "2026-09-27", end: "2026-09-27" });
  expect(giftPriorityWindow(new Date("2026-03-08T14:00:00Z"), { recentGiftDays: 7 })).toEqual({ start: "2026-03-02", end: "2026-03-08" });
  expect(buildGiftPriorities(saved([row({ amount: { value: 500 }, date: "2026-09-27" })]), now, policy).items).toHaveLength(0);
  expect(buildGiftPriorities(saved([row({ amount: { value: 500.01 }, date: "2026-09-27" })]), now, policy).items).toHaveLength(1);
  expect(buildGiftPriorities(saved(), now, policy).items).toHaveLength(0);
  expect(buildGiftPriorities(saved(), now, { giftMinimum: 2500 }).items).toHaveLength(0);
  const wider = { giftMinimum: 500, recentGiftDays: 60 };
  const result = buildGiftPriorities(saved(), now, wider);
  expect(result.items[0].revision).toBe(build().items[0].revision);
  expect(buildGiftPriorities(saved(undefined, { assignments_checked_at: "2026-01-01" }), now, wider).coverage.status).toBe("unavailable");
  const db = vi.fn().mockResolvedValue([saved()]);
  await readSavedPortfolioGifts({ scopeKey: "scope", workspaceId: 7, now, db, settings: policy });
  expect(db.mock.calls[0]).toContain(500); expect(db.mock.calls[0]).toContain("2026-09-27"); expect(db.mock.calls[0]).toContain(201);
});
it("reports partial coverage rather than inventing history when the configured window is wider", () => {
  const partial = saved(undefined, { active_metadata: { ...saved().active_metadata, startDate: "2026-09-01" } });
  expect(buildGiftPriorities(partial, now, { recentGiftDays: 90 }).coverage).toMatchObject({ status: "partial", startDate: "2026-09-01" });
});

describe("gift-based dashboard suggestions", () => {
  it("uses verified direct gift facts, natural wording, and an explicit unsent action form", () => {
    const result = build();
    expect(result.coverage.status).toBe("ready");
    const item = result.items[0];
    expect(item).toMatchObject({ key: "gift:900", kind: "gift", title: "$2,500.00 gift", constituentName: "Sample Donor", giftId: "900" });
    expect(item.message).toBe("A $2,500.00 gift was recorded on Sep 25, 2026. Would a thank-you or another stewardship touch be helpful?");
    const url = new URL(item.href, "https://example.app");
    expect(url.pathname).toBe("/action-opportunity-update");
    expect(Object.fromEntries(url.searchParams)).toEqual({ mode: "action", actionType: "Stewardship", donor: "Sample Donor", blackbaudConstituentId: "100", returnTo: "/" });
    expect(item.message).not.toMatch(/hasn't|has not|unthanked|missing|no opportunity|already sent/i);
  });
  it.each(["Pledge", "RecurringGift", "MatchingGiftPledge", "PlannedGift", "GiftInKind", "Stock", "SoldStock", "Other", "Unknown", ""])("withholds unsupported or non-received type %s", type => {
    expect(build([row({ type })]).items).toEqual([]);
  });
  it.each(["Cash", "Donation", "PayCash", "PledgePayment", "PledgePayCash", "RecurringGiftPayment", "RecurringGiftPayCash", "MatchingGiftPayment", "MatchingGiftPayCash"])("recognizes the explicit receipt type %s", type => {
    expect(build([row({ type })]).items).toHaveLength(1);
  });
  it.each([0, -100, 1000, "2500", null, Infinity, NaN])("rejects below-threshold or invalid amount %s", value => {
    expect(build([row({ amount: { value } })]).items).toEqual([]);
  });
  it("accepts over $1,000, never sums smaller gifts or adds soft credits to the amount", () => {
    expect(build([row({ amount: { value: 1000.01 } })]).items).toHaveLength(1);
    expect(build([row({ amount: { value: 600 } }), row({ id: "901", amount: { value: 600 } })]).items).toEqual([]);
    expect(build([row({ soft_credits: [{ constituent_id: "101", amount: { value: 2500 } }] })]).items[0].title).toBe("$2,500.00 gift");
    expect(build([row({}, { constituent_id: "101" })]).items).toEqual([]);
  });
  it("uses exactly 30 Eastern calendar days and excludes future, old, or invalid dates", () => {
    expect(giftPriorityWindow(new Date("2026-09-28T02:00:00Z"))).toEqual({ start: "2026-08-29", end: "2026-09-27" });
    expect(giftPriorityWindow(new Date("2026-03-08T14:00:00Z"))).toEqual({ start: "2026-02-07", end: "2026-03-08" });
    for (const date of ["2026-09-28", "2026-08-28", "2026-02-30", null]) expect(build([row({ date })]).items).toEqual([]);
    for (const date of ["2026-08-29", "2026-09-27"]) expect(build([row({ date })]).items).toHaveLength(1);
  });
  it("requires real numeric gift and constituent IDs, never name/date-derived IDs", () => {
    for (const id of [null, "", "donation:2026-09-25:100", "0", "-2"]) expect(build([row({ id })]).items).toEqual([]);
    expect(build([row({ constituent_id: "bad" }, { constituent_id: "bad" })]).items).toEqual([]);
  });
  it("deduplicates the same gift, not different gifts on the same day, and withholds identity/fact conflicts", () => {
    expect(build([row(), row({}, { name: "Alternate display name" })]).items).toHaveLength(1);
    expect(build([row(), row({ id: "901" })]).items).toHaveLength(2);
    for (const other of [row({ amount: { value: 3500 } }), row({ date: "2026-09-24" }), row({ type: "Pledge" }), row({ constituent_id: "101" }), row({ date: "2027-01-01" })]) {
      expect(build([row(), other]).items).toEqual([]);
      expect(build([other, row()]).items).toEqual([]);
    }
  });
  it("withholds unavailable, future, stale, malformed, and unbound cache metadata", () => {
    expect(buildGiftPriorities(null, now).coverage.status).toBe("unavailable");
    for (const patch of [{ version: 2 }, { checkedAt: "bad" }, { checkedAt: "2026-09-29" }, { checkedAt: "2026-09-24" }, { startDate: "2027-01-01" }, { endDate: "2026-08-01" }, { endDate: "2027-01-01" }]) {
      const result = build(undefined, { active_metadata: { ...saved().active_metadata, ...patch } });
      expect(result.items).toEqual([]); expect(result.coverage.status).toBe("unavailable");
    }
    for (const assignments_checked_at of [null, "bad", "2026-09-23", "2026-09-28"]) expect(build(undefined, { assignments_checked_at }).items).toEqual([]);
  });
  it("labels partial year-boundary coverage rather than implying there were no prior-period gifts", () => {
    const result = buildGiftPriorities(saved([row({ date: "2027-01-01" })], { assignments_checked_at: "2027-01-02T06:00:00Z", active_metadata: { version: 1, startDate: "2027-01-01", endDate: "2027-01-02", checkedAt: "2027-01-02T06:00:00Z" } }), new Date("2027-01-02T14:00:00Z"));
    expect(result.coverage).toMatchObject({ status: "partial", startDate: "2027-01-01" }); expect(result.items).toHaveLength(1);
  });
  it("keeps dismissal stable through name/refresh changes but resurfaces changed gift facts", () => {
    const item = build().items[0];
    const prefs = [{ item_key: item.key, item_revision: item.revision, state: "dismissed" }];
    const refreshed = build([row({}, { name: "Updated Name" })], { active_metadata: { ...saved().active_metadata, checkedAt: "2026-09-27T12:00:00Z" } });
    expect(applyPriorityPreferences(refreshed.items, prefs, "2026-09-27").hidden).toHaveLength(1);
    expect(applyPriorityPreferences(build([row({ amount: { value: 3000 } })]).items, prefs, "2026-09-27").hidden).toHaveLength(0);
  });
  it("bounds returned reminders and orders newest gifts first", () => {
    const result = build(Array.from({ length: 205 }, (_, index) => row({ id: String(1000 + index), date: index === 3 ? "2026-09-27" : "2026-09-25" })));
    expect(result.items).toHaveLength(200); expect(result.truncated).toBe(true); expect(result.items[0].giftId).toBe("1003");
  });
  it("reads a bounded published generation and current workspace membership using SELECT only", async () => {
    const db = vi.fn().mockResolvedValue([saved()]);
    await readSavedPortfolioGifts({ scopeKey: "scope", workspaceId: 7, now, db });
    const [parts, ...values] = db.mock.calls[0];
    expect(values).toContain(7); expect(values).toContain("scope"); expect(values).toContain(201);
    const text = parts.join("");
    expect(text).toMatch(/p.generation = s.active_generation/); expect(text).toMatch(/u.active = TRUE/);
    expect(text).not.toMatch(/INSERT|UPDATE|DELETE|pending|soft_credits/);
  });
  it("resolves the current connection scope, and degrades gift hints only on cache/config failures", async () => {
    const options = { workspaceId: 7, origin: "https://example.app", now, db: vi.fn().mockResolvedValue([saved()]), refreshUser: vi.fn().mockResolvedValue({ id: 8, role: "admin" }), resolveScope: vi.fn().mockResolvedValue("bound-scope") };
    expect((await loadDashboardGifts(options)).items).toHaveLength(1);
    expect(options.resolveScope).toHaveBeenCalledWith({ authUserId: 8, origin: options.origin, db: options.db });
    options.db.mockRejectedValue(new Error("private database details"));
    expect(await loadDashboardGifts(options)).toEqual({ items: [], coverage: { status: "unavailable" }, truncated: false });
    options.resolveScope.mockClear(); options.refreshUser.mockResolvedValue({ id: 9, role: "mgo" });
    await loadDashboardGifts(options); expect(options.resolveScope).not.toHaveBeenCalled();
  });
  it("uses only saved data even through the real scope resolver; never calls Blackbaud", async () => {
    const db = vi.fn().mockResolvedValueOnce([{ id: 1, connected_at: "2026-01-01" }]).mockResolvedValueOnce([saved()]);
    const result = await loadDashboardGifts({ workspaceId: 7, origin: "https://example.app", now, db, refreshUser: async () => ({ id: 8, role: "admin" }) });
    expect(result.items).toHaveLength(1); expect(provider.fetch).not.toHaveBeenCalled();
    expect(provider.config).toHaveBeenCalledWith("https://example.app");
    expect(db.mock.calls).toHaveLength(2);
  });
  it("applies the existing viewer/workspace preferences to gifts without creating tasks or sending messages", async () => {
    const giftData = build();
    const item = giftData.items[0];
    const db = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ item_key: item.key, item_revision: item.revision, state: "dismissed" }]);
    const result = await readDashboardPriorities(7, 10, now, db, giftData);
    expect(result.hidden).toHaveLength(1); expect(result.giftCoverage).toEqual(giftData.coverage);
    expect(db.mock.calls[2]).toContain(7); expect(db.mock.calls[2]).toContain(10);
    expect(db.mock.calls.map(call => call[0].join("")).join(" ")).not.toMatch(/INSERT|UPDATE|DELETE/);
  });
});
