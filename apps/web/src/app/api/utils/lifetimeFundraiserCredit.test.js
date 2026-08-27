import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createBlackbaudAdHocQueryJobMock,
  downloadBlackbaudQueryResultMock,
  getBlackbaudGiftMock,
  getBlackbaudQueryJobMock,
  sqlMock,
} = vi.hoisted(() => ({
  createBlackbaudAdHocQueryJobMock: vi.fn(),
  downloadBlackbaudQueryResultMock: vi.fn(),
  getBlackbaudGiftMock: vi.fn(),
  getBlackbaudQueryJobMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  createBlackbaudAdHocQueryJob: createBlackbaudAdHocQueryJobMock,
  downloadBlackbaudQueryResult: downloadBlackbaudQueryResultMock,
  getBlackbaudGift: getBlackbaudGiftMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));

vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));

const leslieFundraiserIds = new Set(["186057", "152922"]);

function creditedGift(overrides = {}) {
  return {
    fundraisers: [{ constituent_id: "152922" }],
    ...overrides,
  };
}

describe("lifetime fundraiser credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
    createBlackbaudAdHocQueryJobMock.mockResolvedValue({ id: "job-1" });
    getBlackbaudQueryJobMock.mockResolvedValue({
      status: "Completed",
      read_url: "https://example.test/lifetime-credit.csv",
    });
    downloadBlackbaudQueryResultMock.mockResolvedValue("");
    getBlackbaudGiftMock.mockResolvedValue({ write_off_amount: { value: 0 } });
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
          gift_type: "Matching Gift Pledge Payment",
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

  it("uses a server-side query filtered by fundraiser system record IDs", async () => {
    const { getLiveLifetimeFundraiserCredit, getWorkspaceFundraiserIds } = await import(
      "./lifetimeFundraiserCredit.js"
    );
    downloadBlackbaudQueryResultMock.mockResolvedValue([
      "gift_system_record_id,gift_date,gift_type,gift_amount,pledge_balance,gift_status,fundraiser_system_record_id,fundraiser_name",
      "gift-1,2026-08-01,One-Time Gift,1000,,Active,186057,Leslie M. Redd",
      "pledge-1,2025-08-01,Pledge,750000,300000,Active,186057,Leslie M. Redd",
    ].join("\n"));
    getBlackbaudGiftMock.mockResolvedValue({ write_off_amount: { value: 450000 } });

    const workspaceUser = {
      id: 7,
      blackbaud_constituent_id: "186057",
      blackbaud_lookup_id: "436887",
      blackbaud_fundraiser_alias_ids: ["152922"],
    };
    await expect(
      getLiveLifetimeFundraiserCredit({
        workspaceUser,
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).resolves.toBe(301000);

    expect([...getWorkspaceFundraiserIds(workspaceUser)]).toEqual(["186057", "152922"]);
    expect(createBlackbaudAdHocQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
        query: expect.objectContaining({
          sql_generation_mode: "Query",
          result_layout: "MultiRow",
          filter_fields: [
            expect.objectContaining({
              query_field_id: 214249,
              filter_values: ["186057", "152922"],
              operator: "OneOf",
            }),
          ],
        }),
      }),
    );
    const [{ query }] = createBlackbaudAdHocQueryJobMock.mock.calls[0];
    expect(JSON.stringify(query)).not.toContain("436887");
    expect(JSON.stringify(query)).not.toContain("start_gift_date");
    expect(JSON.stringify(query)).not.toContain("end_gift_date");
    expect(getBlackbaudGiftMock).toHaveBeenCalledWith(
      expect.objectContaining({ giftId: "pledge-1" }),
    );
  });

  it("accepts Blackbaud's descriptive CSV headers but rejects incomplete output", async () => {
    const { parseLifetimeFundraiserCreditCsv } = await import(
      "./lifetimeFundraiserCredit.js"
    );

    expect(
      parseLifetimeFundraiserCreditCsv([
        "Gift System Record ID,Gift Type,Gift Amount,Gift Fundraiser System Record ID",
        "gift-1,Donation,1250,186057",
      ].join("\n")),
    ).toEqual([
      expect.objectContaining({
        id: "gift-1",
        gift_type: "Donation",
        amount: "1250",
        fundraisers: [{ fundraiser_id: "186057" }],
      }),
    ]);

    expect(() => parseLifetimeFundraiserCreditCsv("Gift Type,Gift Amount\nDonation,1250"))
      .toThrow("missing required output columns");
  });

  it("does not turn a missing fundraiser identity into a zero credit total", async () => {
    const { getLiveLifetimeFundraiserCredit } = await import(
      "./lifetimeFundraiserCredit.js"
    );

    await expect(
      getLiveLifetimeFundraiserCredit({
        workspaceUser: { id: 7 },
        authUserId: 7,
        origin: "https://www.jumgogpt.app",
      }),
    ).rejects.toThrow("No Blackbaud fundraiser system record ID");
    expect(createBlackbaudAdHocQueryJobMock).not.toHaveBeenCalled();
  });
});
