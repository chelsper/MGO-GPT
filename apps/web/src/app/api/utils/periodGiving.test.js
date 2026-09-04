import { beforeEach, expect, it, vi } from "vitest";
const { list, realized } = vi.hoisted(() => ({ list: vi.fn(), realized: vi.fn() }));
vi.mock("@/app/api/utils/blackbaud", () => ({ listBlackbaudGifts: list }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/plannedGiftRevenue", () => ({ getRealizedPlannedGiftIds: realized }));
import { calculatePeriodGivingByWorkspaceUser, getPeriodGivingByWorkspaceUser } from "./closedFyGiftTotals";
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
it("fetches each gift type once for the whole team and all periods", async () => {
  list.mockResolvedValue({ gifts: [gift("a", "2026-08-25", 133.25)], hasMore: false });
  const totals = await getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" });
  expect(list).toHaveBeenCalledTimes(9);
  expect(totals.get(1).current).toBe(133.25);
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ includePageMetadata: true, searchParams: expect.objectContaining({ start_gift_date: "2025-07-01", end_gift_date: "2026-09-04" }) }));
  expect(realized).toHaveBeenCalledWith(expect.objectContaining({ strict: true }));
});
it.each([{ gifts: [], hasMore: true }, { invalid: true }])("rejects incomplete gift feeds %j", async (page) => {
  list.mockResolvedValue(page);
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" })).rejects.toThrow("incomplete");
});
it("does not turn a network failure into zero", async () => {
  list.mockRejectedValue(new Error("429"));
  await expect(getPeriodGivingByWorkspaceUser({ workspaceUsers, periods, authUserId: 7, origin: "https://example.org" })).rejects.toThrow("429");
});
