import { beforeEach, describe, expect, it, vi } from "vitest";

const listBlackbaudGiftsMock = vi.fn();

vi.mock("@/app/api/utils/blackbaud", () => ({
  listBlackbaudGifts: listBlackbaudGiftsMock,
}));

const leslieFundraiserIds = new Set(["186057", "436887", "152922"]);

function creditedGift(overrides = {}) {
  return {
    fundraisers: [{ constituent_id: "152922" }],
    ...overrides,
  };
}

describe("lifetime fundraiser credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts a planned gift and separately credited realized revenue", async () => {
    const { calculateLifetimeFundraiserCredit } = await import(
      "./lifetimeFundraiserCredit.js"
    );

    const result = calculateLifetimeFundraiserCredit({
      fundraiserIds: leslieFundraiserIds,
      gifts: [
        creditedGift({
          id: "planned-gift",
          gift_type: "Planned Gift",
          amount: { value: 2500000 },
        }),
        creditedGift({
          id: "realized-revenue",
          gift_type: "Realized Planned Gift Revenue",
          amount: { value: 500000 },
          planned_gift_id: "planned-gift",
        }),
      ],
    });

    expect(result.total).toBe(3000000);
    expect(result.includedGiftIds).toEqual(["planned-gift", "realized-revenue"]);
  });

  it("nets pledge write-offs and excludes pledge payments", async () => {
    const { calculateLifetimeFundraiserCredit } = await import(
      "./lifetimeFundraiserCredit.js"
    );

    const result = calculateLifetimeFundraiserCredit({
      fundraiserIds: leslieFundraiserIds,
      gifts: [
        creditedGift({
          id: "pledge-1",
          gift_type: "Pledge",
          amount: { value: 750000 },
          write_off_amount: { value: 450000 },
        }),
        creditedGift({
          id: "pledge-payment-1",
          gift_type: "Pledge payment",
          amount: { value: 300000 },
          pledge_id: "pledge-1",
        }),
        creditedGift({
          id: "standalone-payment",
          gift_type: "Pledge payment",
          amount: { value: 250 },
          pledge_id: "missing-pledge",
        }),
      ],
    });

    expect(result.total).toBe(300000);
    expect(result.includedGiftIds).toEqual(["pledge-1"]);
    expect(result.excluded.linkedFulfillmentPayment).toBe(1);
    expect(result.excluded.unlinkedFulfillmentPayment).toBe(1);
  });

  it("excludes matching and recurring fulfillment payments without inferring a parent", async () => {
    const { calculateLifetimeFundraiserCredit } = await import(
      "./lifetimeFundraiserCredit.js"
    );

    const result = calculateLifetimeFundraiserCredit({
      fundraiserIds: leslieFundraiserIds,
      gifts: [
        creditedGift({
          id: "matching-pledge",
          gift_type: "Matching Gift Pledge",
          amount: { value: 1000 },
        }),
        creditedGift({
          id: "matching-payment",
          gift_type: "Matching Gift Payment",
          amount: { value: 1000 },
          matching_gift_pledge_id: "matching-pledge",
        }),
        creditedGift({
          id: "recurring-payment",
          gift_type: "Recurring Gift Payment",
          amount: { value: 50 },
          recurring_gift_id: "unavailable-recurring-commitment",
        }),
      ],
    });

    expect(result.total).toBe(1000);
    expect(result.includedGiftIds).toEqual(["matching-pledge"]);
    expect(result.excluded.linkedFulfillmentPayment).toBe(1);
    expect(result.excluded.unlinkedFulfillmentPayment).toBe(1);
  });

  it("deduplicates only by gift ID and requires explicit fundraiser credit", async () => {
    const { calculateLifetimeFundraiserCredit } = await import(
      "./lifetimeFundraiserCredit.js"
    );

    const result = calculateLifetimeFundraiserCredit({
      fundraiserIds: leslieFundraiserIds,
      gifts: [
        creditedGift({ id: "same-id", gift_type: "Donation", amount: { value: 200 } }),
        creditedGift({ id: "same-id", gift_type: "Donation", amount: { value: 999 } }),
        creditedGift({
          id: "same-looking-different-id",
          gift_type: "Donation",
          amount: { value: 200 },
        }),
        {
          id: "not-credited",
          gift_type: "Donation",
          amount: { value: 500 },
          fundraisers: [{ constituent_id: "not-leslie" }],
        },
        creditedGift({
          id: "voided",
          gift_type: "Donation",
          amount: { value: 500 },
          is_void: true,
        }),
        {
          id: "multi-solicitor",
          gift_type: "Donation",
          amount: { value: 700 },
          fundraisers: [{ constituent_id: "other" }, { constituent_id: "152922" }],
        },
      ],
    });

    expect(result.total).toBe(1100);
    expect(result.excluded.duplicateGiftId).toBe(1);
    expect(result.excluded.noFundraiserCredit).toBe(1);
    expect(result.excluded.reversalOrVoid).toBe(1);
  });

  it("uses one undated bounded request and rejects an incomplete result", async () => {
    const { getLiveLifetimeFundraiserCredit } = await import(
      "./lifetimeFundraiserCredit.js"
    );
    listBlackbaudGiftsMock.mockResolvedValue({ gifts: [], hasMore: false });

    await expect(
      getLiveLifetimeFundraiserCredit({
        workspaceUser: {
          id: 7,
          blackbaud_constituent_id: "186057",
          blackbaud_lookup_id: "436887",
          blackbaud_fundraiser_alias_ids: ["152922"],
        },
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).resolves.toBe(0);

    expect(listBlackbaudGiftsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
        pageLimit: 500,
        maxPages: 20,
        includePageMetadata: true,
        searchParams: expect.objectContaining({
          gift_type: expect.arrayContaining(["PledgePayment", "PlannedGift"]),
        }),
      }),
    );
    const [{ searchParams }] = listBlackbaudGiftsMock.mock.calls[0];
    expect(searchParams.gift_type).toContain("PlannedGift");
    expect(searchParams).not.toHaveProperty("start_gift_date");
    expect(searchParams).not.toHaveProperty("end_gift_date");

    listBlackbaudGiftsMock.mockResolvedValue({ gifts: [], hasMore: true });
    await expect(
      getLiveLifetimeFundraiserCredit({
        workspaceUser: { id: 7, blackbaud_constituent_id: "186057" },
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).rejects.toThrow("could not be read completely");
  });
});
