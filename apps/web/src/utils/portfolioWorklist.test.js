import { describe, expect, it } from "vitest";
import {
  buildPortfolioSignals,
  DEFAULT_PORTFOLIO_VIEW,
  normalizePortfolioView,
  paginatePortfolioTiers,
  portfolioViewKey,
  reconcilePortfolioOrder,
  sortPortfolioPeople,
} from "./portfolioWorklist";

const row = (id, count, extra = {}) => ({
  linked_blackbaud_constituent_id: id,
  portfolio_open_opportunity_count: count,
  portfolio_open_pipeline_amount: "2500",
  status: "Active",
  ...extra,
});
const people = [
  { constituentId: "1", name: "Zelda" },
  { constituentId: "2", name: "Beth" },
  { constituentId: "3", name: "Amy" },
];

describe("saved portfolio signals", () => {
  it("distinguishes known zero from missing data, including old cached responses", () => {
    const signals = buildPortfolioSignals([row("1", "0"), row("2", undefined)]);
    expect(signals.get("1").openCount).toBe(0);
    expect(signals.get("2").openCount).toBeNull();
    expect(signals.has("3")).toBe(false);
  });
  it.each([null, undefined, "", -1, "invalid", Infinity])(
    "does not treat invalid count %s as zero",
    (count) => {
      expect(
        buildPortfolioSignals([row("1", count)]).get("1").openCount,
      ).toBeNull();
    },
  );
  it("includes saved opportunities regardless of prospect status or fiscal year", () => {
    expect(
      buildPortfolioSignals([
        row("1", "2", { status: "Archived", fy: "FY26" }),
      ]).get("1"),
    ).toMatchObject({ hasOpen: true, openCount: 2, amount: 2500 });
  });
  it("does not double count duplicate local rows", () => {
    expect(
      buildPortfolioSignals([row("1", 2), row("1", 2)]).get("1"),
    ).toMatchObject({ hasOpen: true, openCount: null, amount: null });
  });
  it("does not show a completed or archived prospect's next step as active", () => {
    const signals = buildPortfolioSignals([
      row("1", 0, {
        next_action_text: "Completed",
        next_action_completed_at: "2026-09-15",
      }),
      row("2", 0, { next_action_text: "Old", status: "Archived" }),
      row("3", 0, {
        next_action_text: "Call",
        next_action_due_date: "2026-09-20",
      }),
    ]);
    expect(signals.get("1").nextStep).toBeNull();
    expect(signals.get("2").nextStep).toBeNull();
    expect(signals.get("3")).toMatchObject({
      nextStep: "Call",
      dueDate: "2026-09-20",
    });
  });
  it("sorts saved opens first, known zero next, missing last without mutating source order", () => {
    const signals = buildPortfolioSignals([row("1", 1), row("2", 0)]);
    const original = structuredClone(people);
    expect(
      sortPortfolioPeople(people, signals, "open").map((p) => p.name),
    ).toEqual(["Zelda", "Beth", "Amy"]);
    expect(
      sortPortfolioPeople(people, signals, "name").map((p) => p.name),
    ).toEqual(["Amy", "Beth", "Zelda"]);
    expect(people).toEqual(original);
  });
  it("preserves the current order on background updates; removes deleted IDs and appends new ones", () => {
    const order = ["2", "1", "3"];
    expect(reconcilePortfolioOrder(order, people)).toBe(order);
    expect(
      reconcilePortfolioOrder(order, [
        ...people.slice(1),
        { constituentId: "4" },
      ]),
    ).toEqual(["2", "3", "4"]);
  });
});

describe("worklist pagination and preferences", () => {
  const all = Array.from({ length: 61 }, (_, id) => ({
    constituentId: String(id),
  }));
  const tiers = [
    { key: "lead", items: all.slice(0, 30) },
    { key: "support", items: all.slice(30) },
  ];
  it("limits the whole page, not each group, to 25 or 50", () => {
    const result = paginatePortfolioTiers(tiers, 2, 25);
    expect(result).toMatchObject({
      total: 61,
      pageCount: 3,
      start: 26,
      end: 50,
    });
    expect(result.tiers.map((tier) => tier.items.length)).toEqual([5, 20]);
    expect(result.tiers.map((tier) => tier.totalCount)).toEqual([30, 31]);
    expect(
      paginatePortfolioTiers(tiers, 1, 50).tiers.flatMap((tier) => tier.items),
    ).toHaveLength(50);
  });
  it("clamps a page after filtering or removal and handles empty results", () => {
    expect(
      paginatePortfolioTiers([{ items: all.slice(0, 2) }], 3, 25),
    ).toMatchObject({ page: 1, start: 1, end: 2 });
    expect(paginatePortfolioTiers([], 3, 25)).toMatchObject({
      page: 1,
      start: 0,
      end: 0,
      tiers: [],
    });
  });
  it("validates preferences and stores no constituent information", () => {
    expect(
      normalizePortfolioView({
        density: "bad",
        group: "bad",
        sort: "bad",
        pageSize: 100,
        name: "Donor",
      }),
    ).toEqual(DEFAULT_PORTFOLIO_VIEW);
    expect(
      normalizePortfolioView({
        density: "detailed",
        group: "category",
        sort: "name",
        pageSize: 50,
      }),
    ).toEqual({
      density: "detailed",
      group: "category",
      sort: "name",
      pageSize: 50,
    });
    expect(portfolioViewKey(1, 2)).not.toBe(portfolioViewKey(2, 2));
    expect(portfolioViewKey(1, 2)).not.toBe(portfolioViewKey(1, 3));
    expect(portfolioViewKey(null, 2)).toBeNull();
  });
});
