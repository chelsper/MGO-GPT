import { describe, expect, it } from "vitest";
import { BOARD_DEFAULT_SOURCES, BOARD_INITIAL_SOURCE, BOARD_MEMBERSHIP_RULE, BOARD_SERVICE_COLUMNS, boardParticipationStatus, boardParticipation, boardParticipationChange, boardPercent, boardPointChange, boardYearStage, validateBoardSource } from "./boardTrustees";

const snapshot = (cash, commitments = []) => ({ trusteeCount: cash.length, eligibility: { rule: BOARD_MEMBERSHIP_RULE, reviewCount: 0 },
  trustees: cash.map((cashCents, index) => ({ id: String(index + 1), cashCents, commitmentCents: index < commitments.length ? commitments[index] : 0 })) });
const entry = (year, cash, commitments) => ({ source: { fiscalYear: year }, snapshot: snapshot(cash, commitments) });

describe("Trustee cash, pledge and planned-gift participation", () => {
  it("preconfigures every supplied FY17-FY27 query in newest-first order", () => {
    expect(BOARD_DEFAULT_SOURCES.map(validateBoardSource).map(item => [item.fiscalYear, item.queryId]))
      .toEqual([[2027, "31092"], [2026, "31093"], [2025, "31094"], [2024, "31095"],
        [2023, "31096"], [2022, "31097"], [2021, "31098"], [2020, "31099"],
        [2019, "31100"], [2018, "31101"], [2017, "31102"]]);
    expect(BOARD_INITIAL_SOURCE).toBe(BOARD_DEFAULT_SOURCES[0]);
    expect(Object.isFrozen(BOARD_DEFAULT_SOURCES)).toBe(true);
    for (const source of BOARD_DEFAULT_SOURCES) {
      const fy = `FY${String(source.fiscalYear).slice(-2)}`;
      expect(source.queryName).toBe(`${fy} BoT Giving - MGOGPT`);
      expect(source.columns).toEqual({ name: "Name", cash: `Total Gifts ${fy} (Cash)`,
        commitments: `Total Pledges or Planned Gifts ${fy}`, ...BOARD_SERVICE_COLUMNS });
      expect(Object.isFrozen(source)).toBe(true);
      expect(Object.isFrozen(source.columns)).toBe(true);
    }
  });
  it("counts cash-only, pledge/planned-gift-only and both once, excluding zero and negative summaries", () => {
    const result = boardParticipation(snapshot([1, 0, -100, 200, 0], [0, 50000, 0, 10000, 0]));
    expect(result).toEqual({ total: 5, participants: 3, unknown: 0, rate: .6 });
    expect(boardPercent(result.rate)).toBe("60%");
    expect(boardParticipationStatus({ cashCents: 0, commitmentCents: 50000 })).toBe("Participating");
    expect(boardParticipationStatus({ cashCents: 0, commitmentCents: 0 })).toBe("Not participating");
  });
  it("never offsets positive participation against a negative summary in the other category", () => {
    expect(boardParticipation(snapshot([1, -1000, -1], [-1000, 1, -1])))
      .toEqual({ total: 3, participants: 2, unknown: 0, rate: 2 / 3 });
  });
  it("does not let missing commitments block known cash participation", () => {
    const data = snapshot([100, 0]); data.trustees[0].commitmentCents = null;
    expect(boardParticipation(data).rate).toBe(.5);
    expect(boardParticipationStatus(data.trustees[0])).toBe("Participating");
  });
  it.each([null, undefined, NaN, "100", Infinity, Number.MAX_SAFE_INTEGER + 1])("withholds the percentage for unreported cash (%s) with no positive commitment", cash => {
    expect(boardParticipation(snapshot([100, cash]))).toEqual({ total: 2, participants: 1, unknown: 1, rate: null });
    expect(boardParticipationStatus({ cashCents: cash, commitmentCents: 0 })).toBe("Giving not reported");
  });
  it.each([null, undefined, NaN, "100", Infinity, Number.MAX_SAFE_INTEGER + 1])("withholds the percentage for unreported commitments (%s) with no positive cash", commitment => {
    expect(boardParticipation(snapshot([0, -1, 100], [commitment, commitment, commitment])))
      .toEqual({ total: 3, participants: 1, unknown: 2, rate: null });
  });
  it("counts known positive commitments despite missing cash, without changing saved amounts", () => {
    const data = snapshot([null, 0, 1], [100, 1, null]);
    const before = structuredClone(data);
    expect(boardParticipation(data)).toEqual({ total: 3, participants: 3, unknown: 0, rate: 1 });
    expect(data).toEqual(before);
    expect(boardParticipation(snapshot([null], [null]))).toEqual({ total: 1, participants: 0, unknown: 1, rate: null });
  });
  it("distinguishes no data, empty rosters, 0% and 100%", () => {
    expect(boardParticipation(null).rate).toBeNull();
    expect(boardParticipation(snapshot([])).rate).toBeNull();
    expect(boardParticipation(snapshot([0, 0])).rate).toBe(0);
    expect(boardParticipation(snapshot([1, 1])).rate).toBe(1);
    expect(boardPercent(null)).toBe("Unavailable");
  });
  it("rejects a truncated roster for percentage purposes", () => {
    expect(boardParticipation({ ...snapshot([100]), trusteeCount: 2 }).rate).toBeNull();
  });
  it("withholds percentages for unresolved service dates and old query-only snapshots", () => {
    const data = snapshot([100, 0]); data.eligibility.reviewCount = 1;
    expect(boardParticipation(data).rate).toBeNull();
    delete data.eligibility;
    expect(boardParticipation(data).rate).toBeNull();
    for (const rule of ["trustee-service-six-months-v1", "trustee-service-six-months-v2"]) {
      data.eligibility = { rule, reviewCount: 0 };
      expect(boardParticipation(data).rate).toBeNull();
      expect(boardParticipationChange([{ source: { fiscalYear: 2027 }, snapshot: data }, entry(2026, [0])], 2027)).toBeNull();
    }
  });
  it("uses each year's own denominator, comparing unrounded rates in percentage points", () => {
    const entries = [entry(2027, [100, 0, 0]), entry(2026, [100, 0, 0, 0, 0, 0])];
    expect(boardParticipationChange(entries, 2027)).toBeCloseTo(16.6666667);
    expect(boardPointChange(boardParticipationChange(entries, 2027))).toBe("+16.7 percentage points");
    expect(boardPointChange(-48)).toBe("-48 percentage points");
    expect(boardPointChange(-.00001)).toBe("0 percentage points");
  });
  it("never substitutes a nonadjacent year or unknown rate for a missing previous year", () => {
    expect(boardParticipationChange([entry(2027, [100]), entry(2025, [0])], 2027)).toBeNull();
    expect(boardParticipationChange([entry(2027, [100]), entry(2026, [null])], 2027)).toBeNull();
    expect(boardParticipationChange([entry(2027, []), entry(2026, [0])], 2027)).toBeNull();
    expect(boardParticipationChange([entry(2027, [100]), entry(2026, [0])], 2027)).toBe(100);
  });
  it("includes pledges and planned gifts in both sides of year-over-year comparisons", () => {
    const entries = [entry(2027, [100, 0, 0], [100, 100, 0]), entry(2026, [0, 100], [100, 0])];
    expect(boardParticipation(entries[0].snapshot).participants).toBe(2);
    expect(boardParticipation(entries[1].snapshot).participants).toBe(2);
    expect(boardPointChange(boardParticipationChange(entries, 2027))).toBe("-33.3 percentage points");
    entries[1].snapshot.trustees[0].commitmentCents = null;
    expect(boardParticipationChange(entries, 2027)).toBeNull();
  });
  it("labels saved coverage, not today's date, using the Eastern fiscal-year boundary", () => {
    expect(boardYearStage(2027, "2026-10-29T12:00:00Z")).toBe("Year to date");
    expect(boardYearStage(2026, "2026-10-29T12:00:00Z")).toBe("Completed fiscal year");
    expect(boardYearStage(2026, "2026-07-01T03:59:59Z")).toBe("Year to date");
    expect(boardYearStage(2026, "2026-07-01T04:00:00Z")).toBe("Completed fiscal year");
    expect(boardYearStage(2028, "2026-10-29T12:00:00Z")).toBe("Before fiscal year");
    expect(boardYearStage(2027, null)).toBe("Not refreshed");
  });
});
