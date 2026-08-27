import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.fn();
const listBlackbaudGiftsMock = vi.fn();
const getRealizedPlannedGiftIdsMock = vi.fn();
const getLiveLifetimeFundraiserCreditMock = vi.fn();

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
  getLiveLifetimeFundraiserCredit: getLiveLifetimeFundraiserCreditMock,
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
    getLiveLifetimeFundraiserCreditMock.mockResolvedValue(1000);
    listBlackbaudGiftsMock.mockImplementation(async ({ searchParams }) => {
      if (searchParams?.gift_type !== "Donation") return [];

      return [
        {
          id: "gift-1",
          date: "2026-08-12T00:00:00",
          amount: { value: 1000 },
          fundraisers: [{ constituent_id: "152922" }],
          gift_type: "Donation",
        },
      ];
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

  it("uses the dedicated lifetime calculator without fiscal-year gift requests", async () => {
    getLiveLifetimeFundraiserCreditMock.mockResolvedValue(4500000);
    const { getLifetimeGivingTotal } = await import("./closedFyGiftTotals.js");

    await expect(
      getLifetimeGivingTotal({
        workspaceUser: leslie,
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).resolves.toBe(4500000);

    expect(getLiveLifetimeFundraiserCreditMock).toHaveBeenCalledWith({
      workspaceUser: leslie,
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
    });
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
  });

  it("does not substitute a zero or legacy lifetime cache value when the query refresh fails", async () => {
    getLiveLifetimeFundraiserCreditMock.mockRejectedValue(
      new Error("Blackbaud query unavailable"),
    );
    const { getLifetimeGivingTotal } = await import("./closedFyGiftTotals.js");

    await expect(
      getLifetimeGivingTotal({
        workspaceUser: leslie,
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).resolves.toBeNull();

    expect(sqlMock).toHaveBeenCalledTimes(2);
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
});
