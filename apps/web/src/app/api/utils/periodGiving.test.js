import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { list, realized } = vi.hoisted(() => ({ list: vi.fn(), realized: vi.fn() }));
vi.mock("@/app/api/utils/blackbaud", () => ({ listBlackbaudGifts: list }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/plannedGiftRevenue", () => ({ getRealizedPlannedGiftIds: realized }));
import { calculatePeriodGivingByWorkspaceUser, getPeriodGivingByWorkspaceUser, getGivingQueryWindows } from "./closedFyGiftTotals";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
const { current, prior, priorFullYear, week } = getStandingsPeriods(new Date("2026-09-04T15:00:00Z"));
const periods = { current, prior, week };
const workspaceUsers = [{ id: 1, blackbaud_constituent_id: "101", blackbaud_fundraiser_alias_ids: ["alias"] }, { id: 2, blackbaud_constituent_id: "102" }, { id: 3 }];
const gift = (id, date, amount, extra = {}) => ({ id, date, amount: { value: amount }, type: "Donation", fundraisers: [{ constituent_id: "101" }], ...extra });
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ gifts: [], hasMore: false, pageCount: 1 }); realized.mockResolvedValue(new Set()); });
afterEach(() => vi.restoreAllMocks());
it("uses existing gift credit rules for both years, preserving shared credit without duplicates", () => {
  const gifts = [gift("a", "2026-07-01", 100), gift("a", "2026-07-01", 100), gift("b", "2025-09-04", 40),
    gift("c", "2025-09-05", 999), gift("future", "2026-09-05", 999),
    gift("shared", "2026-08-25", 50, { fundraisers: [{ constituent_id: "alias" }, { constituent_id: "102" }] }),
    gift("pledge", "2026-09-04", 20, { type: "Pledge" }), gift("planned", "2026-09-01", 800, { type: "PlannedGift" }),
    gift("wrong-type", "2026-08-25", 800, { type: "Unknown" })];
  const result = calculatePeriodGivingByWorkspaceUser({ workspaceUsers, gifts, periods, realizedPlannedGiftIds: new Set(["planned"]) });
  expect(result.get(1)).toEqual({ current: 170, prior: 40, week: 50 });
  expect(result.get(2)).toEqual({ current: 50, prior: 0, week: 50 });
  expect(result.get(3)).toEqual({ current: null, prior: null, week: null });
});
it("fetches each gift type once per YTD window, not per MGO or overlapping weekly period", async () => {
  list.mockResolvedValue({ gifts: [gift("a", "2026-08-25", 133.25)], hasMore: false, pageCount: 1 });
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" });
  expect(list).toHaveBeenCalledTimes(18);
  expect(totals.get(1).current).toBe(133.25);
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ includePageMetadata: true, searchParams: expect.objectContaining({ start_gift_date: "2025-07-01", end_gift_date: "2025-09-04" }) }));
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ includePageMetadata: true, searchParams: expect.objectContaining({ start_gift_date: "2026-07-01", end_gift_date: "2026-09-04" }) }));
  expect(realized).toHaveBeenCalledWith(expect.objectContaining({ strict: true }));
});
it("avoids the 10,000-row all-months cap without raising the page limit", async () => {
  list.mockImplementation(async ({ searchParams }) => ({
    gifts: [gift("current", "2026-09-04", 133), gift("prior", "2025-09-04", 100)],
    hasMore: searchParams.start_gift_date === "2025-07-01" && searchParams.end_gift_date === "2026-09-04",
    pageCount: 1,
  }));
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" });
  expect(totals.get(1)).toEqual({ current: 133, prior: 100, week: 0 });
  expect(list.mock.calls.every(([request]) => request.maxPages === 20 && request.pageLimit === 500 && request.strictResponse === true)).toBe(true);
});
it("merges only overlapping periods and preserves a week outside the YTD window at the July boundary", () => {
  expect(getGivingQueryWindows(periods)).toEqual([
    { startsOn: "2025-07-01", endsOn: "2025-09-04" },
    { startsOn: "2026-07-01", endsOn: "2026-09-04" },
  ]);
  const july = getStandingsPeriods(new Date("2026-07-02T15:00:00Z"));
  expect(getGivingQueryWindows({ current: july.current, prior: july.prior, week: july.week })).toEqual([
    { startsOn: "2025-07-01", endsOn: "2025-07-02" },
    { startsOn: "2026-06-22", endsOn: "2026-06-28" },
    { startsOn: "2026-07-01", endsOn: "2026-07-02" },
  ]);
});
it.each([{}, { current: { startsOn: "2026-02-30", endsOn: "2026-09-04" } }, { current: { startsOn: "2026-09-05", endsOn: "2026-09-04" } }])("never runs an unbounded query for invalid periods %j", async (invalidPeriods) => {
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods: invalidPeriods, authUserId: 7, origin: "https://example.org" })).rejects.toThrow("Valid giving comparison periods");
  expect(list).not.toHaveBeenCalled();
});
it("checks planned-gift relationships only for deduplicated gifts credited to the listed solicitors within a displayed period", async () => {
  const eligible = gift("planned", "2026-09-01", 500, { type: "PlannedGift" });
  list.mockResolvedValue({ gifts: [eligible, eligible,
    gift("other-solicitor", "2026-09-01", 500, { type: "PlannedGift", fundraisers: [{ constituent_id: "999" }] }),
    gift("outside-comparison", "2025-10-01", 500, { type: "PlannedGift" }),
  ], hasMore: false, pageCount: 1 });
  realized.mockResolvedValue(new Set(["planned"]));
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" });
  expect(realized).toHaveBeenCalledWith(expect.objectContaining({ gifts: [eligible], strict: true }));
  expect(totals.get(1).current).toBe(0);
});
it.each([{ gifts: [], hasMore: true }, { invalid: true }, { gifts: [], pageCount: 1 },
  { gifts: [], hasMore: false, pageCount: 0 }, { gifts: [], hasMore: false, pageCount: 21 }])("rejects malformed gift feeds %j", async (page) => {
  list.mockResolvedValue(page);
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" })).rejects.toThrow("incomplete");
  expect(list).toHaveBeenCalledTimes(1);
  expect(realized).not.toHaveBeenCalled();
});
it("does not turn a network failure into zero", async () => {
  list.mockRejectedValue(new Error("429"));
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" })).rejects.toThrow("429");
  expect(list).toHaveBeenCalledTimes(1);
});
it("counts the complete prior FY using the same attribution and gift rules without changing YTD", () => {
  const expandedPeriods = { ...periods, priorFullYear };
  const gifts = [gift("start", "2025-07-01", 10), gift("end", "2026-06-30", 20), gift("end", "2026-06-30", 20),
    gift("old", "2025-06-30", 900), gift("current", "2026-07-01", 30),
    gift("shared", "2026-01-01", 40, { fundraisers: [{ constituent_id: "alias" }, { constituent_id: "102" }] }),
    gift("pledge", "2026-04-01", 50, { type: "Pledge" }),
    gift("planned", "2026-04-01", 60, { type: "PlannedGift" }),
    gift("uncredited", "2026-04-01", 900, { fundraisers: [{ constituent_id: "999" }] }),
    gift("wrong-type", "2026-04-01", 900, { type: "Unknown" })];
  const result = calculatePeriodGivingByWorkspaceUser({ workspaceUsers, gifts, periods: expandedPeriods, realizedPlannedGiftIds: new Set(["planned"]) });
  expect(result.get(1)).toEqual({ current: 30, prior: 10, priorFullYear: 120, week: 0 });
  expect(result.get(2)).toEqual({ current: 0, prior: 0, priorFullYear: 40, week: 0 });
  expect(result.get(3)).toEqual({ current: null, prior: null, priorFullYear: null, week: null });
});
it("reuses prior full-year results for prior YTD instead of issuing another feed per solicitor", async () => {
  list.mockResolvedValue({ gifts: [gift("spring", "2026-04-01", 125)], hasMore: false, pageCount: 1 });
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods: { ...periods, priorFullYear }, authUserId: 7, origin: "https://example.org" });
  expect(list).toHaveBeenCalledTimes(18);
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ searchParams: expect.objectContaining({ start_gift_date: "2025-07-01", end_gift_date: "2026-06-30" }), maxPages: 20, strictResponse: true }));
  expect(totals.get(1)).toEqual({ current: 0, prior: 0, priorFullYear: 125, week: 0 });
  expect(realized).toHaveBeenCalledWith(expect.objectContaining({ gifts: [gift("spring", "2026-04-01", 125)], strict: true }));
});
it("covers a July weekly period from the prior full-year feed with no overlapping requests", () => {
  const july = getStandingsPeriods(new Date("2026-07-02T15:00:00Z"));
  expect(getGivingQueryWindows({ current: july.current, prior: july.prior, priorFullYear: july.priorFullYear, week: july.week })).toEqual([
    { startsOn: "2025-07-01", endsOn: "2026-06-30" },
    { startsOn: "2026-07-01", endsOn: "2026-07-02" },
  ]);
});
it("splits a capped full-year feed and counts more than 10,000 gifts without reusing its partial parent", async () => {
  const gifts = Array.from({ length: 10001 }, (_, index) => gift(`gift-${index}`, index < 5000 ? "2025-07-01" : "2026-06-30", 1));
  list.mockImplementation(async ({ searchParams: { start_gift_date: start, end_gift_date: end, gift_type: type } }) => {
    if (type !== "Donation") return { gifts: [], hasMore: false, pageCount: 1 };
    if (start === "2025-07-01" && end === "2026-06-30") {
      return { gifts: [gift("discard-truncated-parent", "2025-07-01", 999999)], hasMore: true, pageCount: 20 };
    }
    const matching = gifts.filter(({ date }) => date >= start && date <= end);
    return { gifts: matching, hasMore: false, pageCount: Math.max(1, Math.ceil(matching.length / 500)) };
  });
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods: { ...periods, priorFullYear }, authUserId: 7, origin: "https://example.org" });
  expect(totals.get(1)).toEqual({ current: 0, prior: 5000, priorFullYear: 10001, week: 0 });
  expect(list).toHaveBeenCalledTimes(20);
  const windows = list.mock.calls.filter(([request]) => request.searchParams.gift_type === "Donation")
    .map(([{ searchParams }]) => [searchParams.start_gift_date, searchParams.end_gift_date]);
  expect(windows).toEqual([
    ["2025-07-01", "2026-06-30"], ["2025-07-01", "2025-12-30"],
    ["2025-12-31", "2026-06-30"], ["2026-07-01", "2026-09-04"],
  ]);
  expect(list.mock.calls.every(([request]) => request.maxPages <= 20 && request.maxRetries === 0 &&
    request.timeoutMs === 12000 && Number.isFinite(request.deadlineAt))).toBe(true);
});
it("recursively partitions inclusive leap-day boundaries without duplicate credit", async () => {
  const gifts = [gift("a", "2024-02-28", 10), gift("b", "2024-02-29", 20), gift("c", "2024-03-01", 30)];
  list.mockImplementation(async ({ searchParams: { start_gift_date: start, end_gift_date: end, gift_type: type } }) => ({
    gifts: type === "Donation" ? gifts.filter(({ date }) => date >= start && date <= end) : [],
    hasMore: type === "Donation" && start !== end, pageCount: 1,
  }));
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods: { current: { startsOn: "2024-02-28", endsOn: "2024-03-01" } }, authUserId: 7 });
  expect(totals.get(1).current).toBe(60);
  expect(list.mock.calls.filter(([request]) => request.searchParams.gift_type === "Donation")
    .map(([{ searchParams }]) => [searchParams.start_gift_date, searchParams.end_gift_date])).toEqual([
      ["2024-02-28", "2024-03-01"], ["2024-02-28", "2024-02-29"],
      ["2024-02-28", "2024-02-28"], ["2024-02-29", "2024-02-29"], ["2024-03-01", "2024-03-01"],
    ]);
});
it("refuses a still-truncated single day rather than publishing partial totals", async () => {
  list.mockResolvedValue({ gifts: [], hasMore: true, pageCount: 20 });
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods: { current: { startsOn: "2026-07-01", endsOn: "2026-07-01" } }, authUserId: 7 })).rejects.toMatchObject({ code: "NXT_INCOMPLETE_RESULTS" });
  expect(list).toHaveBeenCalledTimes(1);
  expect(realized).not.toHaveBeenCalled();
});
it("limits the combined page budget across partitions instead of retrying indefinitely", async () => {
  list.mockResolvedValue({ gifts: [], hasMore: true, pageCount: 20 });
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods: { ...periods, priorFullYear }, authUserId: 7 })).rejects.toMatchObject({ code: "NXT_REFRESH_LIMIT" });
  expect(list).toHaveBeenCalledTimes(6);
  expect(realized).not.toHaveBeenCalled();
});
it("stops before another request when the comparison deadline expires", async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  list.mockImplementation(async () => {
    clock.mockReturnValue(now + 150000);
    return { gifts: [], hasMore: false, pageCount: 1 };
  });
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7 })).rejects.toMatchObject({ code: "NXT_REFRESH_LIMIT" });
  expect(list).toHaveBeenCalledTimes(1);
  expect(realized).not.toHaveBeenCalled();
});
