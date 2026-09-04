import { describe, expect, it } from "vitest";
import { coverageText, numericScore, rankStandings, scoreText } from "./standingsPresentation";

describe("team ranking", () => {
  const entries = [
    { userId: 1, name: "Cameron", fundedThisFiscalYear: 1000, highValueActionsThisFiscalYear: 5 },
    { userId: 2, name: "Alex", fundedThisFiscalYear: 5000, highValueActionsThisFiscalYear: 0 },
    { userId: 3, name: "Blake", fundedThisFiscalYear: 1000, highValueActionsThisFiscalYear: 10 },
  ];
  it("ranks descending with shared ranks for ties and no mutation", () => {
    expect(rankStandings(entries).map(({ userId, rank }) => [userId, rank])).toEqual([[2, 1], [3, 2], [1, 2]]);
    expect(entries.map((entry) => entry.userId)).toEqual([1, 2, 3]);
  });
  it("switches metrics without using local coverage as a tiebreaker", () => {
    expect(rankStandings(entries, "actions").map((entry) => entry.userId)).toEqual([3, 1, 2]);
  });
  it("shows cents so different fundraising scores do not appear to be tied", () => {
    expect(scoreText(1000.25, "raised")).toBe("$1,000.25");
    expect(scoreText(1000.75, "raised")).toBe("$1,000.75");
    expect(scoreText(1000, "raised")).toBe("$1,000");
  });
  it("uses competition ranks 1,1,3 and leaves unknown scores unranked below genuine zeros", () => {
    const input = [10, null, 10, 0, undefined].map((value, index) => ({ userId: index, name: String(index), highValueActionsThisFiscalYear: value }));
    expect(rankStandings(input, "actions").map(({ userId, rank }) => [userId, rank])).toEqual([[0, 1], [2, 1], [3, 3], [1, null], [4, null]]);
  });
  it.each([undefined, null, "", " ", NaN, Infinity, "bad", false, [], -1])("does not coerce invalid scores to zero: %s", (value) => {
    expect(numericScore(value)).toBeNull();
  });
  it("documents local coverage without requiring a due date", () => {
    expect(coverageText(4, 17)).toBe("24% coverage");
    expect(coverageText(0, 0)).toBe("No active prospects");
  });
});
