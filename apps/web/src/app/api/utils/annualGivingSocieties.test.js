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

  it("supports configurable fiscal-year annual societies", async () => {
    const listGifts = vi.fn(async () => [gift({ amount: 1200 })]);

    const summary = await fetchAnnualGivingSocieties({
      listGifts,
      userId: "user-1",
      authUserId: "auth-1",
      origin: "https://www.jumgogpt.app",
      constituentId: "123",
      now: NOW,
      societyDefinitions: [
        {
          key: "fy_society",
          name: "FY Society",
          basis: "annual",
          periodBasis: "fiscal_year",
          fiscalYearStartMonth: 7,
          minimumAmount: 1000,
          maximumAmount: null,
          countSources: ["received_revenue", "recognition_credit"],
          active: true,
          displayOrder: 1,
        },
      ],
    });

    expect(listGifts).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: {
          constituent_id: "123",
          start_gift_date: "2026-07-01",
          end_gift_date: "2026-08-06",
        },
      }),
    );
    expect(summary.yearLabel).toBe("FY27");
    expect(summary.primarySociety?.label).toBe("FY Society");
  });

  it("honors configured count sources when qualifying a society", () => {
    const summary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      societyDefinitions: [
        {
          key: "received_only",
          name: "Received Only",
          basis: "annual",
          periodBasis: "calendar_year",
          minimumAmount: 1000,
          maximumAmount: null,
          countSources: ["received_revenue"],
          active: true,
          displayOrder: 1,
        },
      ],
      gifts: [
        gift({ id: "small-direct", amount: 500 }),
        gift({
          id: "large-soft",
          constituent_id: "999",
          amount: 5000,
          soft_credits: [
            {
              constituent_id: "123",
              amount: { value: 5000 },
            },
          ],
        }),
      ],
    });

    expect(summary.receivedRevenueTotal).toBe(500);
    expect(summary.recognitionCreditTotal).toBe(5000);
    expect(summary.primarySociety).toBeNull();
  });

  it("allows annual and lifetime giving society badges to coexist", () => {
    const summary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      societyDefinitions: [
        {
          key: "presidents_society",
          name: "President's Society",
          basis: "annual",
          periodBasis: "calendar_year",
          minimumAmount: 10000,
          maximumAmount: null,
          countSources: ["received_revenue", "recognition_credit"],
          active: true,
          displayOrder: 1,
        },
        {
          key: "frances_bartlett_kinne_society",
          name: "Frances Bartlett Kinne Society",
          basis: "lifetime",
          periodBasis: "lifetime",
          minimumAmount: 1000000,
          maximumAmount: null,
          countSources: ["committed"],
          active: true,
          displayOrder: 2,
        },
      ],
      gifts: [gift({ amount: 12500 })],
      lifetimeGiving: {
        total_giving: { value: 1000000 },
        total_received_giving: { value: 750000 },
        total_soft_credits: { value: 250000 },
      },
    });

    expect(summary.primarySociety?.label).toBe("President's Society");
    expect(summary.primaryLifetimeSociety?.label).toBe(
      "Frances Bartlett Kinne Society",
    );
    expect(summary.societies.map((society) => society.label)).toEqual([
      "President's Society",
      "Frances Bartlett Kinne Society",
    ]);
    expect(summary.lifetimeGiving.committedTotal).toBe(1000000);
  });

  it("qualifies planned gift societies from hard or recognition credit without using amount", () => {
    const summary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      societyDefinitions: [
        {
          key: "legacy_society",
          name: "Legacy Society",
          basis: "lifetime",
          periodBasis: "lifetime",
          minimumAmount: 0,
          maximumAmount: null,
          countSources: ["planned_gift"],
          active: true,
          displayOrder: 1,
        },
      ],
      gifts: [
        gift({
          id: "planned-hard",
          gift_type: "Planned Gift",
          amount: 0,
          date: "2020-01-01T00:00:00.000Z",
        }),
        gift({
          id: "planned-soft",
          constituent_id: "999",
          gift_type: "Planned Gift",
          amount: 0,
          date: "2019-01-01T00:00:00.000Z",
          soft_credits: [
            {
              constituent_id: "123",
              amount: { value: 0 },
            },
          ],
        }),
      ],
    });

    expect(summary.primaryLifetimeSociety?.label).toBe("Legacy Society");
    expect(summary.primaryLifetimeSociety?.qualificationMode).toBe("planned_gift");
    expect(summary.primaryLifetimeSociety?.plannedGiftCount).toBe(2);
    expect(summary.primaryLifetimeSociety?.plannedGiftIds).toEqual([
      "planned-hard",
      "planned-soft",
    ]);
  });

  it("fetches full gift history when a lifetime planned gift society is configured", async () => {
    const listGifts = vi.fn(async () => [
      gift({
        id: "old-planned",
        gift_type: "Planned Gift",
        amount: 0,
        date: "2018-01-01T00:00:00.000Z",
      }),
    ]);

    const summary = await fetchAnnualGivingSocieties({
      listGifts,
      userId: "user-1",
      authUserId: "auth-1",
      origin: "https://www.jumgogpt.app",
      constituentId: "123",
      now: NOW,
      societyDefinitions: [
        {
          key: "legacy_society",
          name: "Legacy Society",
          basis: "lifetime",
          periodBasis: "lifetime",
          minimumAmount: 0,
          maximumAmount: null,
          countSources: ["planned_gift"],
          active: true,
          displayOrder: 1,
        },
      ],
    });

    expect(listGifts).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: {
          constituent_id: "123",
        },
      }),
    );
    expect(summary.primaryLifetimeSociety?.label).toBe("Legacy Society");
  });

  it("keeps lower annual societies hidden unless they are configured to display alongside", () => {
    const gifts = [gift({ amount: 12000 })];
    const baseDefinitions = [
      {
        key: "presidents_society",
        name: "President's Society",
        basis: "annual",
        periodBasis: "calendar_year",
        minimumAmount: 10000,
        maximumAmount: null,
        countSources: ["received_revenue", "recognition_credit"],
        active: true,
        displayOrder: 1,
      },
      {
        key: "order_of_the_dolphin",
        name: "Order of the Dolphin",
        basis: "annual",
        periodBasis: "calendar_year",
        minimumAmount: 1000,
        maximumAmount: null,
        countSources: ["received_revenue", "recognition_credit"],
        active: true,
        displayOrder: 2,
      },
    ];

    const primaryOnlySummary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      gifts,
      societyDefinitions: baseDefinitions,
    });

    expect(
      primaryOnlySummary.allQualifiedAnnualSocieties.map((society) => society.label),
    ).toEqual(["President's Society", "Order of the Dolphin"]);
    expect(primaryOnlySummary.annualSocieties.map((society) => society.label)).toEqual([
      "President's Society",
    ]);
    expect(primaryOnlySummary.societies.map((society) => society.label)).toEqual([
      "President's Society",
    ]);

    const alongsideSummary = calculateAnnualGivingSocieties({
      constituentId: "123",
      now: NOW,
      gifts,
      societyDefinitions: baseDefinitions.map((definition) =>
        definition.key === "order_of_the_dolphin"
          ? { ...definition, displayAlongside: true }
          : definition,
      ),
    });

    expect(alongsideSummary.annualSocieties.map((society) => society.label)).toEqual([
      "President's Society",
      "Order of the Dolphin",
    ]);
  });
});
