import { describe, expect, it, vi } from "vitest";

import {
  calculateAnnualGivingSocieties,
  fetchAnnualGivingSocieties,
} from "./annualGivingSocieties.js";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function gift(overrides = {}) {
  return {
    id: overrides.id || "gift-1",
    constituent_id: overrides.constituent_id || "123",
    date: overrides.date || "2026-07-01T00:00:00.000Z",
    gift_type: overrides.gift_type || "Donation",
    amount: { value: overrides.amount ?? 500 },
    ...overrides,
  };
}

describe("annual giving societies", () => {
  it("places $10,000+ current-year received and recognition giving in President's Society", () => {
    const summary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      gifts: [
        gift({ id: "direct", amount: 9000 }),
        gift({
          id: "soft",
          constituent_id: "999",
          amount: 2000,
          soft_credits: [
            {
              constituent_id: "123",
              amount: { value: 1500 },
            },
          ],
        }),
      ],
    });

    expect(summary.combinedAnnualGiving).toBe(10500);
    expect(summary.receivedRevenueTotal).toBe(9000);
    expect(summary.recognitionCreditTotal).toBe(1500);
    expect(summary.primarySociety?.label).toBe("President's Society");
    expect(summary.primarySociety?.maximum).toBeNull();
  });

  it("places $1,000-$9,999.99 current-year giving in Order of the Dolphin", () => {
    const summary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      gifts: [gift({ amount: 9999.99 })],
    });

    expect(summary.combinedAnnualGiving).toBe(9999.99);
    expect(summary.primarySociety?.label).toBe("Order of the Dolphin");
  });

  it("does not show a society below $1,000", () => {
    const summary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      gifts: [gift({ amount: 999.99 })],
    });

    expect(summary.primarySociety).toBeNull();
    expect(summary.societies).toEqual([]);
  });

  it("excludes non-received revenue records and excluded funds", () => {
    const summary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      gifts: [
        gift({ id: "pledge", gift_type: "Pledge", amount: 10000 }),
        gift({
          id: "fee",
          amount: 10000,
          fund: { name: "Credit Card Processing Fee" },
        }),
        gift({ id: "old", date: "2025-12-31T00:00:00.000Z", amount: 10000 }),
      ],
    });

    expect(summary.combinedAnnualGiving).toBe(0);
    expect(summary.primarySociety).toBeNull();
  });

  it("passes current calendar-year date filters to the Gift API list function", async () => {
    const listGifts = vi.fn(async () => [gift({ amount: 1000 })]);

    const summary = await fetchAnnualGivingSocieties({
      listGifts,
      userId: "user-1",
      authUserId: "auth-1",
      origin: "https://www.jumgogpt.app",
      constituentId: "123",
      now: NOW,
    });

    expect(listGifts).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: {
          constituent_id: "123",
          start_gift_date: "2026-01-01",
          end_gift_date: "2026-08-06",
        },
      }),
    );
    expect(summary.primarySociety?.label).toBe("Order of the Dolphin");
  });
});
