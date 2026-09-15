import { describe, expect, it } from "vitest";
import {
  buildPortfolioSignals,
  DEFAULT_PORTFOLIO_VIEW,
  matchesPortfolioQuickView,
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
  it("surfaces the earliest valid unfinished step across duplicate local rows", () => {
    const rows = [
      row("1", 0, { next_action_text: "Undated" }),
      row("1", 0, {
        next_action_text: "Future",
        next_action_due_date: "2026-10-01",
      }),
      row("1", 0, {
        next_action_text: "Invalid",
        next_action_due_date: "2026-02-30",
      }),
      row("1", 0, {
        next_action_text: "Call",
        next_action_due_date: "2026-09-01",
      }),
      row("1", 0, {
        next_action_text: "Done",
        next_action_due_date: "2026-08-01",
        next_action_completed_at: "2026-08-01",
      }),
      row("1", 0, {
        next_action_text: "Archived",
        next_action_due_date: "2026-08-01",
        status: "Archived",
      }),
      row("1", 0, {
        next_action_text: "  ",
        next_action_due_date: "2026-08-01",
      }),
    ];
    const original = structuredClone(rows);
    expect(buildPortfolioSignals(rows).get("1")).toMatchObject({
      nextStep: "Call",
      dueDate: "2026-09-01",
    });
    expect(rows).toEqual(original);
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

describe("portfolio quick views", () => {
  it("includes missing data in All, but requires a saved open signal in Open opportunities", () => {
    expect(matchesPortfolioQuickView(undefined, "all", "2026-09-15")).toBe(
      true,
    );
    expect(matchesPortfolioQuickView(undefined, "open", "2026-09-15")).toBe(
      false,
    );
    expect(
      matchesPortfolioQuickView(
        { hasOpen: false, openCount: 0 },
        "open",
        "2026-09-15",
      ),
    ).toBe(false);
    expect(
      matchesPortfolioQuickView(
        { hasOpen: true, openCount: null },
        "open",
        "2026-09-15",
      ),
    ).toBe(true);
  });
  it.each([
    ["2026-09-14", true],
    ["2026-09-15", true],
    ["2026-09-15T00:00:00.000Z", true],
    ["2026-09-16", false],
    ["2026-02-30", false],
    ["invalid", false],
    [null, false],
  ])(
    "treats %s as a calendar due date through today: %s",
    (dueDate, expected) => {
      expect(
        matchesPortfolioQuickView(
          { nextStep: "Call", dueDate },
          "due",
          "2026-09-15",
        ),
      ).toBe(expected);
    },
  );
  it("does not infer due follow-ups from stale activity, missing steps, or an invalid cutoff", () => {
    expect(
      matchesPortfolioQuickView({ dueDate: "2026-09-01" }, "due", "2026-09-15"),
    ).toBe(false);
    expect(
      matchesPortfolioQuickView(
        { nextStep: "  ", dueDate: "2026-09-01" },
        "due",
        "2026-09-15",
      ),
    ).toBe(false);
    expect(
      matchesPortfolioQuickView(
        { latest_activity_at: "2026-01-01" },
        "due",
        "2026-09-15",
      ),
    ).toBe(false);
    expect(
      matchesPortfolioQuickView(
        { nextStep: "Call", dueDate: "2026-09-01" },
        "due",
        "invalid",
      ),
    ).toBe(false);
  });
});

describe("portfolio priority sorts", () => {
  const list = Array.from({ length: 9 }, (_, index) => ({
    constituentId: String(index + 1),
    name: `Person ${index + 1}`,
    priority_order: index + 1,
  }));
  it("sorts unfinished calendar dates oldest first, with missing/invalid/completed dates last", () => {
    const signals = buildPortfolioSignals([
      row("1", 2, {
        next_action_text: "Future",
        next_action_due_date: "2026-10-01",
      }),
      row("2", 0, {
        next_action_text: "Due",
        next_action_due_date: "2026-09-15T00:00:00.000Z",
      }),
      row("3", 0, {
        next_action_text: "Oldest",
        next_action_due_date: "2025-07-01",
      }),
      row("4", 0, { next_action_text: "No date" }),
      row("5", 0, {
        next_action_text: "Invalid date",
        next_action_due_date: "2026-02-30",
      }),
      row("6", 0, {
        next_action_text: "Done",
        next_action_due_date: "2024-01-01",
        next_action_completed_at: "2024-01-01",
      }),
      row("7", 0, {
        next_action_text: "Archived",
        next_action_due_date: "2024-01-01",
        status: "Archived",
      }),
      row("8", 0, {
        next_action_text: "  ",
        next_action_due_date: "2024-01-01",
      }),
    ]);
    expect(
      sortPortfolioPeople(list, signals, "due").map(
        (person) => person.constituentId,
      ),
    ).toEqual(["3", "2", "1", "4", "5", "6", "7", "8", "9"]);
  });
  it("sorts numeric open pipeline amounts highest first, retaining zero and putting unknown totals last", () => {
    const signals = buildPortfolioSignals([
      row("1", 2, { portfolio_open_pipeline_amount: "9000" }),
      row("2", 2, { portfolio_open_pipeline_amount: "10000" }),
      row("3", 0, { portfolio_open_pipeline_amount: "999999" }),
      row("4", 1, { portfolio_open_pipeline_amount: "0" }),
      row("5", undefined, { portfolio_open_pipeline_amount: "999999" }),
      row("6", 1, { portfolio_open_pipeline_amount: "invalid" }),
      row("7", 1, { portfolio_open_pipeline_amount: "-1" }),
      row("8", 1, { portfolio_open_pipeline_amount: "500000" }),
      row("8", 1, { portfolio_open_pipeline_amount: "500000" }),
    ]);
    expect(
      sortPortfolioPeople(list, signals, "pipeline").map(
        (person) => person.constituentId,
      ),
    ).toEqual(["2", "1", "3", "4", "5", "6", "7", "8", "9"]);
  });
  it.each(["due", "pipeline"])(
    "breaks %s ties by name then ID without changing Top Prospects ranks or signals",
    (sort) => {
      const source = [
        { constituentId: "10", name: "Beth", priority_order: 1 },
        { constituentId: "3", name: "Amy", priority_order: 2 },
        { constituentId: "2", name: "Beth", priority_order: 3 },
      ];
      const signals = buildPortfolioSignals(
        source.map((person) =>
          row(person.constituentId, 1, {
            next_action_text: "Call",
            next_action_due_date: "2026-09-15",
          }),
        ),
      );
      const original = structuredClone({ source, signals });
      expect(
        sortPortfolioPeople(source, signals, sort).map(
          (person) => person.constituentId,
        ),
      ).toEqual(["3", "2", "10"]);
      expect(source).toEqual(original.source);
      expect(signals).toEqual(original.signals);
    },
  );
});

describe("worklist pagination and preferences", () => {
  it("accepts Focus while keeping Compact as the backward-compatible default", () => {
    expect(normalizePortfolioView({ density: "focus" }).density).toBe("focus");
    expect(normalizePortfolioView({ density: "invalid" }).density).toBe(
      "compact",
    );
    expect(normalizePortfolioView({}).density).toBe("compact");
  });
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
        quickView: "bad",
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
      quickView: "all",
      group: "category",
      sort: "name",
      pageSize: 50,
    });
    expect(portfolioViewKey(1, 2)).not.toBe(portfolioViewKey(2, 2));
    expect(portfolioViewKey(1, 2)).not.toBe(portfolioViewKey(1, 3));
    expect(portfolioViewKey(null, 2)).toBeNull();
    expect(normalizePortfolioView({ quickView: "open" }).quickView).toBe(
      "open",
    );
    expect(normalizePortfolioView({ quickView: "due" }).quickView).toBe("due");
    expect(normalizePortfolioView({ sort: "due" }).sort).toBe("due");
    expect(normalizePortfolioView({ sort: "pipeline" }).sort).toBe("pipeline");
  });
});
