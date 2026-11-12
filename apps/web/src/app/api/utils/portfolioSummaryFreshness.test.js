import { describe, expect, it } from "vitest";
import { getPortfolioSummaryStaleAfter, isPortfolioSummaryCurrent, selectPortfolioRefreshIds, hasPortfolioSummaryChanges } from "./portfolioSummaryFreshness";

const now = Date.parse("2026-09-03T06:00:00Z");
const current = { data_complete: true, summary_payload: { mapped: {} }, stale_after: "2026-09-09T06:00:00Z" };

describe("lightweight portfolio policy", () => {
  it("does not extend the weekly timestamp just because a summary was read", () => {
    expect(getPortfolioSummaryStaleAfter({ summaryRefreshedAt: "2026-09-01T06:00:00Z", givingDataFreshUntil: "2026-09-04T06:00:00Z" }, now)).toBe("2026-09-08T06:00:00.000Z");
  });

  it("selects 301 nightly giving updates but no unnecessary summary rebuilds", () => {
    const ids = Array.from({ length: 301 }, (_, i) => String(i + 1));
    const snapshots = ids.map((constituent_id) => ({ constituent_id, ...current }));
    expect(selectPortfolioRefreshIds(ids, snapshots, "nightly", now)).toHaveLength(301);
    expect(selectPortfolioRefreshIds(ids, snapshots, "stale", now)).toEqual([]);
    expect(selectPortfolioRefreshIds(ids, snapshots, "full", now)).toEqual(ids);
  });

  it("skips current giving and summaries, prioritizing missing and failed records", () => {
    const ids = ["1", "2", "3", "4"];
    const snapshots = [
      { constituent_id: "1", ...current, stale_after: "2026-08-01" },
      { constituent_id: "3", ...current, last_error_stage: "summary_generation" },
      { constituent_id: "4", ...current, giving_payload: {}, giving_stale_after: "2026-09-04" },
    ];
    expect(selectPortfolioRefreshIds(ids, snapshots, "nightly", now)).toEqual(["2", "3", "1"]);
  });

  it("does not skip incomplete summaries even if their timestamp is current", () => {
    expect(isPortfolioSummaryCurrent({ ...current, data_complete: false }, now)).toBe(false);
  });

  it("puts missing giving ahead of oldest due records and excludes already-current records", () => {
    const snapshots = [
      { constituent_id: "1", ...current, giving_payload: {}, giving_stale_after: "2026-09-02" },
      { constituent_id: "2", ...current, giving_payload: {}, giving_stale_after: "2026-08-01" },
      { constituent_id: "3", ...current },
      { constituent_id: "4", ...current, giving_payload: {}, giving_stale_after: "2026-09-05" },
    ];
    expect(selectPortfolioRefreshIds(["1", "2", "3", "4"], snapshots, "nightly", now)).toEqual(["3", "2", "1"]);
  });

  it("detects giving/proposal changes without reacting to refresh timestamps", () => {
    const summary = { mapped: { lifetimeGiving: { totalGiving: 123 }, proposalSummary: [{ estimated_amount: 500 }] } };
    expect(hasPortfolioSummaryChanges(summary, { ...summary, givingRefreshedAt: "2026-09-03" })).toBe(false);
    expect(hasPortfolioSummaryChanges(summary, { mapped: { ...summary.mapped, lifetimeGiving: { totalGiving: 124 } } })).toBe(true);
    expect(hasPortfolioSummaryChanges(summary, { mapped: { ...summary.mapped, proposalSummary: [] } })).toBe(true);
  });

  it("does not rebuild for JSONB object-key ordering, including nested proposals", () => {
    const summary = { mapped: {
      lifetimeGiving: { totalGiving: 100, constituentId: "123", totalReceivedGiving: 80 },
      proposalSummary: [{ id: 1, detail: { name: "Project", amount: 1000 } }],
    } };
    const giving = { mapped: {
      lifetimeGiving: { constituentId: "123", totalReceivedGiving: 80, totalGiving: 100 },
      proposalSummary: [{ detail: { amount: 1000, name: "Project" }, id: 1 }],
    } };
    expect(hasPortfolioSummaryChanges(summary, giving)).toBe(false);
    expect(Object.keys(giving.mapped.lifetimeGiving)).toEqual(["constituentId", "totalReceivedGiving", "totalGiving"]);
  });

  it.each([
    { lifetimeGiving: { totalGiving: 101 }, proposalSummary: [{ id: 1 }, { id: 2 }] },
    { lifetimeGiving: { totalGiving: "100" }, proposalSummary: [{ id: 1 }, { id: 2 }] },
    { lifetimeGiving: { totalGiving: 100, totalSoftCredits: 5 }, proposalSummary: [{ id: 1 }, { id: 2 }] },
    { lifetimeGiving: null, proposalSummary: [{ id: 1 }, { id: 2 }] },
    { lifetimeGiving: { totalGiving: 100 }, proposalSummary: [{ id: 2 }, { id: 1 }] },
    { lifetimeGiving: { totalGiving: 100 }, proposalSummary: [{ id: 1 }, { id: 2, amount: 0 }] },
  ])("still detects actual input changes: %j", (mapped) => {
    const summary = { mapped: { lifetimeGiving: { totalGiving: 100 }, proposalSummary: [{ id: 1 }, { id: 2 }] } };
    expect(hasPortfolioSummaryChanges(summary, { mapped })).toBe(true);
  });
});
