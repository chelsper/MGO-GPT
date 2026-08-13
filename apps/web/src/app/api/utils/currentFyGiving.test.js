import { describe, expect, it } from "vitest";

import {
  calculateCurrentFiscalYearGiving,
  getCurrentFiscalYearWindow,
} from "./currentFyGiving.js";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function gift(overrides = {}) {
  return {
    id: overrides.id || "gift-1",
    constituent_id: overrides.constituent_id || "100",
    date: overrides.date || "2026-07-01T00:00:00.000Z",
    gift_type: overrides.gift_type || "Donation",
    amount: { value: overrides.amount ?? 100 },
    ...overrides,
  };
}

describe("current fiscal year giving", () => {
  it("uses the current July-to-June fiscal year", () => {
    expect(getCurrentFiscalYearWindow({ now: NOW })).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-08-11",
      fiscalYear: 2027,
      yearLabel: "FY27",
    });
    expect(
      getCurrentFiscalYearWindow({ now: new Date("2026-06-30T12:00:00.000Z") }),
    ).toMatchObject({ startDate: "2025-07-01", yearLabel: "FY26" });
  });

  it("keeps recognized received, recognized committed, and planned-gift totals separate", () => {
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["100", "200"],
      gifts: [
        gift({ id: "donation", amount: 250 }),
        gift({ id: "payment", gift_type: "Pledge Payment", amount: 750 }),
        gift({ id: "pledge", gift_type: "Pledge", amount: 5000 }),
        gift({ id: "planned", gift_type: "Planned Gift", amount: 12000 }),
        gift({ id: "old", date: "2026-06-30T12:00:00.000Z", amount: 9999 }),
        gift({
          id: "soft-credit",
          constituent_id: "999",
          amount: 1500,
          soft_credits: [{ constituent_id: "200", amount: { value: 1500 } }],
        }),
        gift({
          id: "soft-planned",
          constituent_id: "999",
          gift_type: "Planned Giving",
          amount: 2000,
          soft_credits: [{ constituent_id: "200", amount: { value: 2000 } }],
        }),
      ],
    });

    expect(summary.byConstituentId["100"]).toMatchObject({
      hardReceived: 1000,
      hardCommitted: 17000,
      softReceived: 0,
      softCommitted: 0,
      recognizedReceived: 1000,
      recognizedCommitted: 17000,
      plannedGifts: 12000,
      receivedGiftCount: 2,
      committedGiftCount: 2,
      plannedGiftCount: 1,
    });
    expect(summary.byConstituentId["200"]).toMatchObject({
      hardReceived: 0,
      hardCommitted: 0,
      softReceived: 1500,
      softCommitted: 2000,
      recognizedReceived: 1500,
      recognizedCommitted: 2000,
      plannedGifts: 2000,
      receivedGiftCount: 1,
      committedGiftCount: 1,
      plannedGiftCount: 1,
    });
    expect(summary.acknowledgmentCredits).toEqual([
      expect.objectContaining({
        hardCreditConstituentId: "999",
        recipientConstituentId: "200",
        amount: 1500,
      }),
    ]);
  });

  it("keeps DAF hard-credit revenue separate from individual acknowledgment credit", () => {
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["daf", "cynthia", "dan"],
      gifts: [
        gift({
          id: "daf-pledge-payment",
          constituent_id: "daf",
          gift_type: "Pledge payment",
          amount: 50000,
          soft_credits: [
            { constituent_id: "cynthia", amount: { value: 50000 } },
            { constituent_id: "dan", amount: { value: 50000 } },
          ],
        }),
      ],
    });

    expect(summary.byConstituentId.daf).toMatchObject({
      hardReceived: 50000,
      recognizedReceived: 50000,
    });
    expect(summary.byConstituentId.cynthia).toMatchObject({
      hardReceived: 0,
      softReceived: 50000,
      recognizedReceived: 50000,
    });
    expect(summary.byConstituentId.dan).toMatchObject({
      hardReceived: 0,
      softReceived: 50000,
      recognizedReceived: 50000,
    });
    expect(summary.acknowledgmentCredits).toEqual([
      expect.objectContaining({
        hardCreditConstituentId: "daf",
        recipientConstituentId: "cynthia",
        amount: 50000,
      }),
      expect.objectContaining({
        hardCreditConstituentId: "daf",
        recipientConstituentId: "dan",
        amount: 50000,
      }),
    ]);
  });

  it("uses direct recognition once instead of counting a duplicate soft credit", () => {
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["100"],
      gifts: [
        gift({
          id: "direct-and-soft",
          amount: 800,
          soft_credits: [{ constituent_id: "100", amount: { value: 800 } }],
        }),
      ],
    });

    expect(summary.byConstituentId["100"].recognizedReceived).toBe(800);
  });

  it("counts a soft-credited pledge payment when NXT annotates the type label", () => {
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["200"],
      gifts: [
        gift({
          id: "annotated-soft-pledge-payment",
          constituent_id: "999",
          gift_type: "Pledge payment ($50,000 Soft credit)",
          amount: 50000,
          soft_credits: [{ constituent_id: "200", amount: { value: 50000 } }],
        }),
      ],
    });

    expect(summary.byConstituentId["200"]).toMatchObject({
      recognizedReceived: 50000,
      recognizedCommitted: 0,
      receivedGiftCount: 1,
    });
  });

  it("recognizes a structured Blackbaud gift type value", () => {
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["200"],
      gifts: [
        gift({
          id: "structured-soft-pledge-payment",
          constituent_id: "999",
          gift_type: { description: "Pledge payment ($50,000 Soft credit)" },
          amount: 50000,
          soft_credits: [{ constituent_id: "200", amount: { value: 50000 } }],
        }),
      ],
    });

    expect(summary.byConstituentId["200"]).toMatchObject({
      recognizedReceived: 50000,
      recognizedCommitted: 0,
      receivedGiftCount: 1,
    });
  });

  it("does not count the same gift twice when a list response repeats it", () => {
    const repeatedGift = gift({ id: "repeated", amount: 650 });
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["100"],
      gifts: [repeatedGift, repeatedGift],
    });

    expect(summary.byConstituentId["100"]).toMatchObject({
      recognizedReceived: 650,
      receivedGiftCount: 1,
    });
  });

  it("records the latest recognized received gift for direct and soft-credit recipients", () => {
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["100", "200"],
      gifts: [
        gift({
          id: "older-direct",
          constituent_id: "100",
          date: "2026-07-03T00:00:00.000Z",
          amount: 100,
        }),
        gift({
          id: "latest-direct",
          constituent_id: "100",
          date: "2026-07-08T00:00:00.000Z",
          amount: 250,
        }),
        gift({
          id: "latest-soft-credit",
          constituent_id: "999",
          date: "2026-07-10T00:00:00.000Z",
          amount: 500,
          soft_credits: [{ constituent_id: "200", amount: { value: 500 } }],
        }),
        gift({
          id: "planned-gift",
          constituent_id: "100",
          date: "2026-07-11T00:00:00.000Z",
          gift_type: "Planned Gift",
          amount: 1000,
        }),
      ],
    });

    expect(summary.byConstituentId["100"]).toMatchObject({
      lastGiftDate: "2026-07-08T00:00:00.000Z",
      lastGiftAmount: 250,
    });
    expect(summary.byConstituentId["200"]).toMatchObject({
      lastGiftDate: "2026-07-10T00:00:00.000Z",
      lastGiftAmount: 500,
    });
  });

  it("does not include credit-card processing-fee gifts", () => {
    const summary = calculateCurrentFiscalYearGiving({
      now: NOW,
      constituentIds: ["100"],
      gifts: [
        gift({
          id: "fee",
          amount: 1000,
          fund: { name: "Credit Card Processing Fee" },
        }),
      ],
    });

    expect(summary.byConstituentId["100"]).toMatchObject({
      recognizedReceived: 0,
      recognizedCommitted: 0,
      plannedGifts: 0,
    });
  });
});
