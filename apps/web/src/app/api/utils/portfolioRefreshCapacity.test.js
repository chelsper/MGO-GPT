import { beforeEach, expect, it, vi } from "vitest";
import manifest from "../../../../vercel.json";
import { ACTIVITY_CRON_MINUTES, PORTFOLIO_CRON_MINUTES, PORTFOLIO_REFRESH_HOURS } from "./portfolioMaintenancePolicy";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
import { activityCapacity, portfolioCapacity, readPortfolioRefreshCapacity } from "./portfolioRefreshCapacity";

const row = { workspace_count: 5, unknown_workspaces: 0, assignments_due: 0, assignment_slots: 908,
  unique_constituents: 800, due_slots: 578, giving_due: 578, summary_due: 10, never_checked: 0,
  giving_over_48_hours: 100, giving_checked_24_hours: 330, oldest_giving_check: "2026-09-18T12:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); sql.mockResolvedValue([row]); });

it("keeps normal-night ceilings aligned with effective cron definitions and worker limits", () => {
  expect(PORTFOLIO_REFRESH_HOURS).toEqual([1, 2, 3, 4, 5, 6]);
  expect(manifest.crons.find(item => item.path === "/api/internal/portfolio-refresh").schedule).toBe(`*/${PORTFOLIO_CRON_MINUTES} * * * *`);
  expect(manifest.crons.find(item => item.path === "/api/internal/portfolio-activity-refresh").schedule).toBe(`5-59/${ACTIVITY_CRON_MINUTES} * * * *`);
  expect(portfolioCapacity(row)).toMatchObject({ itemsPerNight: 360, minimumSweepNights: 3, minimumBacklogNights: 2, exceedsNight: true });
  expect(activityCapacity(1816)).toEqual({ callsPerNight: 288, minimumSweepNights: 7, exceedsNight: true });
});

it("does not sum overlapping backlogs or count shared constituents as one workspace slot", () => {
  expect(portfolioCapacity(row)).toMatchObject({ due: 578, givingDue: 578, summaryDue: 10, slots: 908, uniqueConstituents: 800 });
});

it("preserves unknown membership and verified-empty counts without promising current data", () => {
  const empty = Object.fromEntries(Object.keys(row).map(key => [key, 0]));
  expect(portfolioCapacity({ ...empty, workspace_count: 3, unknown_workspaces: 2, oldest_giving_check: null }))
    .toMatchObject({ unknownWorkspaces: 2, slots: 0, oldestGivingCheck: null, minimumSweepNights: 0, exceedsNight: false });
  expect(activityCapacity(0)).toMatchObject({ minimumSweepNights: 0, exceedsNight: false });
  expect(portfolioCapacity({ ...row, assignment_slots: 360 })).toMatchObject({ minimumSweepNights: 1, exceedsNight: false });
});

it.each([undefined, null, -1, NaN, Infinity, "invalid"])("fails closed on invalid counts (%s)", value => {
  expect(() => portfolioCapacity({ ...row, assignment_slots: value })).toThrow();
  expect(() => activityCapacity(value)).toThrow();
});

it("uses a single read across all eligible saved memberships, with no provider calls", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  try {
    expect(await readPortfolioRefreshCapacity()).toMatchObject({ slots: 908, givingChecked24Hours: 330 });
    expect(sql).toHaveBeenCalledTimes(1);
    const statement = sql.mock.calls[0][0].join(" ");
    expect(statement).toContain("SELECT DISTINCT w.id AS workspace_user_id");
    expect(statement).toContain("active = TRUE");
    expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|LIMIT)\b/);
    expect(fetchSpy).not.toHaveBeenCalled();
    sql.mockResolvedValue([]);
    await expect(readPortfolioRefreshCapacity()).rejects.toThrow("unavailable");
  } finally { fetchSpy.mockRestore(); }
});
