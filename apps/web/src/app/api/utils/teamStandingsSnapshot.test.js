import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { numericScore } from "@/app/reports/executive-team-standings/standingsPresentation";
import { EXECUTIVE_TEAM_STANDINGS_CACHE_KEY, getWorkspaceStandingsSummary, projectWorkspaceStandingsSummary } from "./teamStandingsSnapshot";

const { readSnapshot, saveSnapshot } = vi.hoisted(() => ({ readSnapshot: vi.fn(), saveSnapshot: vi.fn() }));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshotWithMetadata: readSnapshot,
  saveReportSnapshot: saveSnapshot,
}));

const now = new Date("2026-09-08T21:00:00Z");
function snapshot() {
  const comparison = getStandingsPeriods(new Date("2026-09-07T22:00:00Z"));
  return {
    updatedAt: "2026-09-07T22:01:04Z",
    payload: {
      fiscalYear: comparison.fiscalYear, comparison,
      standings: [
        { userId: 1, name: "Other MGO", fundedThisFiscalYear: 999, drilldown: { donor: "Private" } },
        { userId: 8, name: "Selected MGO", fundedThisFiscalYear: 4030000, priorYearToDate: { raised: 179900 }, drilldown: { donor: "Private" } },
      ],
    },
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("workspace leaderboard total", () => {
  it("uses the exact saved current and prior YTD totals, not another full-FY cache", () => {
    expect(projectWorkspaceStandingsSummary(snapshot(), 8, now)).toEqual({
      currentFY: "FY27", priorFY: "FY26", closedThisFY: 4030000, closedPriorFY: 179900,
      raisedSnapshot: { source: "team_standings", status: "available", reason: null, periodMode: "ytd", asOf: "2026-09-07", updatedAt: "2026-09-07T22:01:04Z" },
    });
  });

  it("exposes no other MGO, donor, drilldown, or full snapshot data", () => {
    const result = JSON.stringify(projectWorkspaceStandingsSummary(snapshot(), "8", now));
    for (const value of ["999", "Other MGO", "Selected MGO", "Private", "drilldown", '"standings":'])
      expect(result).not.toContain(value);
  });

  it.each([null, undefined, "", " ", "invalid", true, {}, -1, Infinity, NaN, 0, "0", 1234.56])(
    "matches leaderboard handling of score %j, including a real zero", (value) => {
      const saved = snapshot();
      saved.payload.standings[1].fundedThisFiscalYear = value;
      saved.payload.standings[1].priorYearToDate.raised = value;
      const result = projectWorkspaceStandingsSummary(saved, 8, now);
      expect(result.closedThisFY).toBe(numericScore(value));
      expect(result.closedPriorFY).toBe(numericScore(value));
      expect(result.raisedSnapshot.status).toBe(numericScore(value) === null ? "unavailable" : "available");
    },
  );

  it("does not relabel a previous fiscal year's snapshot as the current year", () => {
    const result = projectWorkspaceStandingsSummary(snapshot(), 8, new Date("2027-07-01T05:00:00Z"));
    expect(result).toMatchObject({ currentFY: "FY28", closedThisFY: null, closedPriorFY: null, raisedSnapshot: { reason: "fiscal_year_mismatch" } });
  });

  it("uses Eastern fiscal boundaries like Team Standings", () => {
    expect(projectWorkspaceStandingsSummary(snapshot(), 8, new Date("2027-07-01T03:00:00Z")).closedThisFY).toBe(4030000);
  });

  it("preserves an older current-FY snapshot without pretending it is YTD", () => {
    const saved = snapshot();
    delete saved.payload.comparison;
    expect(projectWorkspaceStandingsSummary(saved, 8, now)).toMatchObject({
      closedThisFY: 4030000, closedPriorFY: null,
      raisedSnapshot: { periodMode: "full_fiscal_year", asOf: null },
    });
  });

  it("keeps available giving when an unrelated team metric is missing", () => {
    const saved = snapshot();
    saved.payload.scoringUnavailableUserIds = [1, 8];
    saved.payload.standings[1].highValueActionsThisFiscalYear = null;
    expect(projectWorkspaceStandingsSummary(saved, 8, now).closedThisFY).toBe(4030000);
  });

  it.each([0, null, undefined, "bad", 999, -1])("never falls back to another user's score for ID %j", (id) => {
    expect(projectWorkspaceStandingsSummary(snapshot(), id, now)).toMatchObject({
      closedThisFY: null, closedPriorFY: null, raisedSnapshot: { reason: "workspace_not_ranked" },
    });
  });

  it("reports missing snapshots as unavailable, not zero", () => {
    expect(projectWorkspaceStandingsSummary(null, 8, now)).toMatchObject({
      closedThisFY: null, closedPriorFY: null, raisedSnapshot: { reason: "missing_snapshot" },
    });
  });

  it("reads the shared key without saving or refreshing a snapshot", async () => {
    readSnapshot.mockResolvedValue(null);
    await getWorkspaceStandingsSummary(8);
    expect(readSnapshot).toHaveBeenCalledWith(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
