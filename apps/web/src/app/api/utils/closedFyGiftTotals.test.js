import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.fn();
const listBlackbaudGiftsMock = vi.fn();
const getRealizedPlannedGiftIdsMock = vi.fn();
const calculateLifetimeFundraiserCreditMock = vi.fn();

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  listBlackbaudGifts: listBlackbaudGiftsMock,
}));

vi.mock("@/app/api/utils/plannedGiftRevenue", () => ({
  getRealizedPlannedGiftIds: getRealizedPlannedGiftIdsMock,
}));

vi.mock("@/app/api/utils/lifetimeFundraiserCredit", () => ({
  calculateLifetimeFundraiserCredit: calculateLifetimeFundraiserCreditMock,
}));

const leslie = {
  id: 7,
  name: "Leslie M. Redd",
  email: "lredd@ju.edu",
  blackbaud_constituent_id: "186057",
  blackbaud_lookup_id: "436887",
  blackbaud_fundraiser_alias_ids: ["152922"],
};

describe("closed FY gift totals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
    getRealizedPlannedGiftIdsMock.mockResolvedValue(new Set());
    calculateLifetimeFundraiserCreditMock.mockImplementation(({ gifts, fundraiserIds }) => ({
      total: gifts
        .filter((gift) =>
          gift.fundraisers?.some((fundraiser) => fundraiserIds.has(fundraiser.constituent_id)),
        )
        .reduce((total, gift) => total + Number(gift.amount?.value || 0), 0),
    }));
    listBlackbaudGiftsMock.mockImplementation(async ({ searchParams, includePageMetadata }) => {
      if (searchParams?.gift_type !== "Donation") return [];

      const gifts = [
        {
          id: "gift-1",
          date: "2026-08-12T00:00:00",
          amount: { value: 1000 },
          fundraisers: [{ constituent_id: "152922" }],
          gift_type: "Donation",
        },
      ];
      return includePageMetadata ? { gifts, hasMore: false, pageCount: 1 } : gifts;
    });
  });

  it("counts gifts credited to configured fundraiser alias ids", async () => {
    const { getClosedFiscalYearSummary } = await import("./closedFyGiftTotals.js");

    const summary = await getClosedFiscalYearSummary({
      workspaceUser: {
        ...leslie,
        blackbaud_fundraiser_alias_ids: ["152922", "172263"],
      },
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
      now: new Date("2026-08-18T12:00:00Z"),
    });

    expect(summary.currentFY).toBe("FY27");
    expect(summary.closedThisFY).toBe(1000);
    expect(summary.closedPriorFY).toBe(0);
  });

  it("normalizes comma and newline separated alias ids for cache matching", async () => {
    const { normalizeBlackbaudFundraiserAliasIds } = await import("./closedFyGiftTotals.js");

    expect(
      normalizeBlackbaudFundraiserAliasIds("152922,\n172263\n234684,152922"),
    ).toEqual(["152922", "172263", "234684"]);
  });

  it("uses one direct lifetime gift feed without fiscal-year date requests", async () => {
    const { getLifetimeGivingTotal } = await import("./closedFyGiftTotals.js");

    await expect(
      getLifetimeGivingTotal({
        workspaceUser: leslie,
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).resolves.toBe(1000);

    expect(calculateLifetimeFundraiserCreditMock).toHaveBeenCalledTimes(1);
    expect(listBlackbaudGiftsMock).toHaveBeenCalled();
    for (const call of listBlackbaudGiftsMock.mock.calls) {
      expect(call[0].searchParams).not.toHaveProperty("start_date");
      expect(call[0].searchParams).not.toHaveProperty("end_date");
    }
  });

  it("calculates every configured fundraiser from one shared lifetime gift scan", async () => {
    const { getLifetimeGivingTotalsForWorkspaceUsers } = await import(
      "./closedFyGiftTotals.js"
    );

    const totals = await getLifetimeGivingTotalsForWorkspaceUsers({
      workspaceUsers: [
        leslie,
        {
          id: 8,
          name: "Morgan Major",
          blackbaud_constituent_id: "238901",
        },
      ],
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
    });

    expect(totals.get(7)).toBe(1000);
    expect(totals.get(8)).toBe(0);
    expect(calculateLifetimeFundraiserCreditMock).toHaveBeenCalledTimes(2);
    expect(listBlackbaudGiftsMock).toHaveBeenCalledTimes(10);
  });

  it("does not substitute a zero when the direct lifetime feed fails", async () => {
    listBlackbaudGiftsMock.mockRejectedValue(new Error("Blackbaud gifts unavailable"));
    const { getLifetimeGivingTotal } = await import("./closedFyGiftTotals.js");

    await expect(
      getLifetimeGivingTotal({
        workspaceUser: leslie,
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).resolves.toBeNull();

    expect(calculateLifetimeFundraiserCreditMock).not.toHaveBeenCalled();
  });

  it("retains the existing FY behavior for a realized planned gift", async () => {
    listBlackbaudGiftsMock.mockImplementation(async ({ searchParams }) => {
      if (searchParams?.gift_type === "PlannedGift") {
        return [
          {
            id: "planned-gift",
            date: "2026-08-12T00:00:00",
            amount: { value: 2500000 },
            fundraisers: [{ constituent_id: "152922" }],
            gift_type: "Planned Gift",
          },
        ];
      }
      if (searchParams?.gift_type === "Donation") {
        return [
          {
            id: "realized-revenue",
            date: "2026-08-12T00:00:00",
            amount: { value: 500000 },
            fundraisers: [{ constituent_id: "152922" }],
            gift_type: "Realized Planned Gift Revenue",
          },
        ];
      }
      return [];
    });
    getRealizedPlannedGiftIdsMock.mockResolvedValue(new Set(["planned-gift"]));

    const { getClosedFiscalYearSummary } = await import("./closedFyGiftTotals.js");
    const summary = await getClosedFiscalYearSummary({
      workspaceUser: leslie,
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
      now: new Date("2026-08-18T12:00:00Z"),
    });

    expect(summary.closedThisFY).toBe(500000);
  });

  it("does not cache a false zero for a failed competitive score refresh", async () => {
    const { getClosedFiscalYearSummary } = await import("./closedFyGiftTotals.js");
    listBlackbaudGiftsMock.mockRejectedValue(new Error("NXT throttled"));
    await expect(getClosedFiscalYearSummary({ workspaceUser: leslie, authUserId: 7, origin: "https://example.org", requireComplete: true })).rejects.toThrow("NXT throttled");
    expect(sqlMock.mock.calls.some(([strings]) => strings.join("").includes("UPDATE users"))).toBe(false);
  });

  it("requires fundraiser identity for a ranked score", async () => {
    const { getClosedFiscalYearSummary } = await import("./closedFyGiftTotals.js");
    await expect(getClosedFiscalYearSummary({ workspaceUser: { id: 9 }, authUserId: 7, origin: "https://example.org", requireComplete: true })).rejects.toThrow("identity");
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
  });

  it("requires a verified cache for rankings and lets other reports reuse it without more API calls", async () => {
    const { getClosedFiscalYearSummary } = await import("./closedFyGiftTotals.js");
    const options = { workspaceUser: leslie, authUserId: 7, origin: "https://example.org", now: new Date("2026-09-04T12:00:00Z"), requireComplete: true };
    await getClosedFiscalYearSummary(options);
    const saveCall = sqlMock.mock.calls.find(([strings]) => strings.join("").includes("UPDATE users"));
    const key = saveCall.find((value) => typeof value === "string" && value.startsWith("closed-summary-v4"));
    expect(key).toBeTruthy();
    sqlMock.mockResolvedValue([{ blackbaud_summary_cache: { closedThisFY: 1000, closedPriorFY: 0, verifiedComplete: true }, blackbaud_summary_cache_key: key, blackbaud_summary_cached_at: new Date().toISOString() }]);
    listBlackbaudGiftsMock.mockClear();
    await expect(getClosedFiscalYearSummary(options)).resolves.toMatchObject({ closedThisFY: 1000 });
    await expect(getClosedFiscalYearSummary({ ...options, requireComplete: false })).resolves.toMatchObject({ closedThisFY: 1000 });
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
    sqlMock.mockResolvedValue([{ blackbaud_summary_cache: { closedThisFY: 0, closedPriorFY: 0 }, blackbaud_summary_cache_key: key, blackbaud_summary_cached_at: new Date().toISOString() }]);
    await expect(getClosedFiscalYearSummary(options)).resolves.toMatchObject({ closedThisFY: 1000 });
    expect(listBlackbaudGiftsMock).toHaveBeenCalled();
  });
});
