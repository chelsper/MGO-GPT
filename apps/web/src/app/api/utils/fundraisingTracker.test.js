import { describe, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn() }));
import { refreshFundraisingTracker, trackerQueryParams } from "./fundraisingTracker";
import { newFundraisingTracker, trackerFingerprint } from "@/utils/fundraisingTracker";

const panel = { ...newFundraisingTracker("campaign", true), funds: [{ id: "123", name: "A-Train Campaign" }] };
const now = new Date("2026-09-24T16:00:00Z");
const gift = (id, type = "Donation", amount = 100, splits = [{ id: String(Number(id) + 1000), fund_id: "123", amount: { value: amount } }]) => ({ id, type, date: "2026-09-01T00:00:00Z", amount: { value: amount }, gift_splits: splits });
const reader = (gifts, extra = {}) => vi.fn(async (url) => url.startsWith("/fundraising/") ? { id: url.split("/").at(-1) } : { value: gifts, count: gifts.length, ...extra });
const run = (read, cached = null, definition = panel, remaining = 2) => refreshFundraisingTracker({ panel: definition, cached, read, budget: { remaining }, user: { id: 1 }, origin: "https://example.test", now });
const continuation = (p = panel, offset = 1) => `https://api.sky.blackbaud.com/gift/v1/gifts?${new URLSearchParams({ ...trackerQueryParams(p), offset: String(offset), sort_token: "stable" })}`;
const old = () => ({ key: panel.key, fingerprint: trackerFingerprint(panel), committedCents: 99900, receivedCents: 33300, refreshedAt: "2026-09-23T12:00:00Z" });

describe("bounded fundraising totals", () => {
  it("counts only selected fund splits, with no duplicate pledge payment or soft-credit counting", async () => {
    const read = reader([
      { ...gift("1", "Donation", 100, [{ id: "11", fund_id: "123", amount: { value: 60 } }, { id: "12", fund_id: "999", amount: { value: 40 } }]), soft_credits: [{ amount: { value: 100 } }] },
      gift("2", "Pledge", 1000), gift("3", "PledgePayment", 250), gift("4", "MatchingGiftPledge", 500),
      gift("5", "MatchingGiftPayment", 100), gift("6", "RecurringGiftPayment", 50), gift("7", "PlannedGift", 5000),
      gift("8", "RecurringGift", 1000), gift("9", "PledgeWriteOff", 25), gift("10", "RealizedPlannedGiftRevenue", 20),
    ]);
    expect(await run(read)).toMatchObject({ committedCents: 163000, receivedCents: 48000, excludedCount: 3, pending: null, error: null });
    expect(read).toHaveBeenCalledTimes(2);
    const url = new URL(read.mock.calls[1][0], "https://api.sky.blackbaud.com");
    expect(url.searchParams.get("fund_id")).toBe("123");
    expect(url.searchParams.has("start_gift_date")).toBe(false);
    expect(url.searchParams.has("end_gift_date")).toBe(false);
    expect(read.mock.calls[0][0]).toBe("/fundraising/v1/funds/123");
  });
  it("sums a multi-fund gift once and verifies every selected fund before reading gifts", async () => {
    const p = { ...panel, funds: [...panel.funds, { id: "456", name: "Second" }] };
    const read = reader([gift("1", "Donation", 100, [{ id: "11", fund_id: "123", amount: { value: 60 } }, { id: "12", fund_id: "456", amount: { value: 40 } }])]);
    const first = await run(read, null, p);
    expect(first).toMatchObject({ pending: { fundIndex: 2, rows: 0 } });
    expect(first.committedCents).toBeUndefined();
    expect(await run(read, first, p)).toMatchObject({ committedCents: 10000, receivedCents: 10000, pending: null });
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("never reads all gifts for an unconfigured tracker or an invalid fund", async () => {
    const read = vi.fn().mockResolvedValue({ id: "999" });
    await run(read, null, { ...panel, funds: [] });
    expect(read).not.toHaveBeenCalled();
    const result = await run(read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.error).toBeTruthy();
    expect(result.committedCents).toBeUndefined();
  });
  it("shows verified zero and supports refunds/negative values, without truncating to whole dollars", async () => {
    expect(await run(reader([]))).toMatchObject({ committedCents: 0, receivedCents: 0 });
    expect(await run(reader([gift("1", "Donation", 10.29), gift("2", "Donation", -2.01)]))).toMatchObject({ committedCents: 828, receivedCents: 828 });
  });
  it("supports inclusive optional dates and does not impose a hidden date range on all-time giving", async () => {
    const p = { ...panel, period: "date_range", startDate: "2026-01-01", endDate: "2026-12-31" };
    expect(trackerQueryParams(p)).toMatchObject({ start_gift_date: "2026-01-01T00:00:00Z", end_gift_date: "2026-12-31T23:59:59.999Z" });
    const future = { ...gift("1"), date: "2027-01-01T00:00:00Z" };
    expect((await run(reader([future]))).committedCents).toBe(10000);
    expect((await run(reader([future]), old(), p)).committedCents).toBeUndefined();
  });
  it("checkpoints pages without publishing partial amounts and resumes without rereading successful pages", async () => {
    const read = reader([gift("1")], { count: 2, next_link: continuation() });
    const first = await run(read, old());
    expect(first).toMatchObject({ committedCents: 99900, pending: { rows: 1 }, error: null });
    const next = vi.fn().mockResolvedValue({ value: [gift("2")], count: 2 });
    expect(await run(next, first)).toMatchObject({ committedCents: 20000, receivedCents: 20000, pending: null });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(continuation());
  });
  it("preserves a clean checkpoint on throttling without publishing provider errors", async () => {
    const first = await run(reader([gift("1")], { count: 2, next_link: continuation() }), old());
    const read = vi.fn().mockRejectedValue(Object.assign(new Error("private token"), { httpStatus: 429 }));
    const paused = await run(read, first);
    expect(paused.pending).toEqual(first.pending);
    expect(paused.committedCents).toBe(99900);
    expect(JSON.stringify(paused)).not.toContain("private token");
    expect((await run(reader([gift("2")], { count: 2 }), paused)).committedCents).toBe(20000);
  });
  it.each([
    { value: [gift("1"), gift("1")], count: 2 },
    { value: [gift("1")], count: 2 },
    { value: [gift("1")], count: "1" },
    { value: [gift("1", "UnknownType")], count: 1 },
    { value: [{ ...gift("1"), amount: { value: 99 } }], count: 1 },
    { value: [{ ...gift("1"), date: "bad" }], count: 1 },
    { value: [gift("1", "Donation", 100, [{ id: "11", fund_id: "999", amount: { value: 100 } }])], count: 1 },
    { value: [gift("1")], count: 2, next_link: "https://evil.test/gift/v1/gifts" },
    { value: [gift("1")], count: 2, next_link: continuation().replace("fund_id=123", "fund_id=999") },
    { value: [], count: 2, next_link: continuation() },
  ])("retains last-good totals when data cannot be reconciled: %j", async (payload) => {
    const result = await run(reader([], payload), old());
    expect(result).toMatchObject({ committedCents: 99900, receivedCents: 33300, pending: null });
    expect(result.error).toBeTruthy();
  });
  it("rejects an overlapping or changing collection on subsequent pages", async () => {
    const first = await run(reader([gift("1")], { count: 2, next_link: continuation() }), old());
    expect((await run(reader([gift("1")], { count: 2 }), first)).error).toBeTruthy();
    expect((await run(reader([gift("2")], { count: 3 }), first)).error).toBeTruthy();
    expect(first.pending.rows).toBe(1);
  });
  it("restarts expired or different-user checkpoints without reusing incompatible fund totals", async () => {
    const first = await run(reader([gift("1")], { count: 2, next_link: continuation() }));
    first.pending.ownerId = 2;
    const read = reader([]);
    expect((await run(read, first)).receivedCents).toBe(0);
    expect(read.mock.calls[0][0]).toBe("/fundraising/v1/funds/123");
    const changed = { ...panel, funds: [{ id: "777", name: "Changed" }] };
    expect((await run(vi.fn().mockRejectedValue(new Error("failed")), old(), changed)).committedCents).toBeUndefined();
  });
});
