import { beforeEach, expect, it, vi } from "vitest";
const { list, realized } = vi.hoisted(() => ({ list: vi.fn(), realized: vi.fn() }));
vi.mock("@/app/api/utils/blackbaud", () => ({ listBlackbaudGifts: list }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/plannedGiftRevenue", () => ({ getRealizedPlannedGiftIds: realized }));
import { calculatePeriodGivingByWorkspaceUser, getPeriodGivingByWorkspaceUser, getGivingQueryWindows } from "./closedFyGiftTotals";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
const { current, prior, week } = getStandingsPeriods(new Date("2026-09-04T15:00:00Z"));
const periods = { current, prior, week };
const workspaceUsers = [{ id: 1, blackbaud_constituent_id: "101", blackbaud_fundraiser_alias_ids: ["alias"] }, { id: 2, blackbaud_constituent_id: "102" }, { id: 3 }];
const gift = (id, date, amount, extra = {}) => ({ id, date, amount: { value: amount }, type: "Donation", fundraisers: [{ constituent_id: "101" }], ...extra });
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ gifts: [], hasMore: false }); realized.mockResolvedValue(new Set()); });
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
  list.mockResolvedValue({ gifts: [gift("a", "2026-08-25", 133.25)], hasMore: false });
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
  ], hasMore: false });
  realized.mockResolvedValue(new Set(["planned"]));
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" });
  expect(realized).toHaveBeenCalledWith(expect.objectContaining({ gifts: [eligible], strict: true }));
  expect(totals.get(1).current).toBe(0);
});
it.each([{ gifts: [], hasMore: true }, { invalid: true }])("rejects incomplete gift feeds %j", async (page) => {
  list.mockResolvedValue(page);
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" })).rejects.toThrow("incomplete");
});
it("does not turn a network failure into zero", async () => {
  list.mockRejectedValue(new Error("429"));
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" })).rejects.toThrow("429");
});
