import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.fn();
const listBlackbaudGiftsMock = vi.fn();

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  listBlackbaudGifts: listBlackbaudGiftsMock,
}));

describe("closed FY gift totals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
    listBlackbaudGiftsMock.mockImplementation(async ({ searchParams }) => {
      if (searchParams?.gift_type !== "Donation") {
        return [];
      }

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
        id: 7,
        name: "Leslie M. Redd",
        email: "lredd@ju.edu",
        blackbaud_constituent_id: "186057",
        blackbaud_lookup_id: "436887",
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

  it("uses the same eligible gifts for lifetime giving without fiscal-year dates", async () => {
    const { getLifetimeGivingTotal } = await import("./closedFyGiftTotals.js");

    const lifetimeGiving = await getLifetimeGivingTotal({
      workspaceUser: {
        id: 7,
        name: "Leslie M. Redd",
        email: "lredd@ju.edu",
        blackbaud_constituent_id: "186057",
        blackbaud_lookup_id: "436887",
        blackbaud_fundraiser_alias_ids: ["152922"],
      },
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
    });

    expect(lifetimeGiving).toBe(1000);
    expect(listBlackbaudGiftsMock).toHaveBeenCalled();
    for (const [{ searchParams }] of listBlackbaudGiftsMock.mock.calls) {
      expect(searchParams).not.toHaveProperty("start_gift_date");
      expect(searchParams).not.toHaveProperty("end_gift_date");
    }
  });
});
