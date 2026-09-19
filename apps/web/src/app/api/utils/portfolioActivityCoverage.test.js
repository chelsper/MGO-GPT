import { beforeEach, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("./sql", () => ({ default: sql }));
import { activityCoverageStatus, readPortfolioActivityCoverage } from "./portfolioActivityCoverage";

const saved = { id: "7", name: "Test MGO", has_portfolio: true, assigned: 10, checked: 6,
  gifts_checked: 8, actions_checked: 7, never_checked: 5, due: 9,
  connection_errors: 0, throttled: 0, other_errors: 0,
  last_checked_at: "2026-09-19T10:00:00Z", oldest_checked_at: "2026-09-17T10:00:00Z", last_attempt_at: "2026-09-19T10:05:00Z" };
const summary = items => ({ workspace_count: items.length, awaiting_assignments: 0,
  total: 20, never_checked: 5, due: 9, connection_errors: 0, throttled: 0, other_errors: 0,
  last_checked_at: saved.last_checked_at, items });
beforeEach(() => sql.mockReset().mockResolvedValue([summary([saved])]));

it("returns only named portfolio counts and saved times in a single scoped read", async () => {
  sql.mockResolvedValue([summary([{ ...saved, constituent_id: "DONOR", activity_details: { summary: "private notes" }, secret: "omit" }])]);
  const result = await readPortfolioActivityCoverage(["7"], "https://app.example");
  expect(result).toMatchObject({ workspaceCount: 1, total: 20, neverChecked: 5, due: 9 });
  expect(result.items[0]).toEqual({ id: "7", name: "Test MGO", hasAssignments: true, assigned: 10, checked: 6, waiting: 4,
    giftsChecked: 8, actionsChecked: 7, due: 9, connectionErrors: 0, throttled: 0, otherErrors: 0,
    lastCheckedAt: "2026-09-19T10:00:00.000Z", oldestCheckedAt: "2026-09-17T10:00:00.000Z", lastAttemptAt: "2026-09-19T10:05:00.000Z",
    level: "notice", label: "Initial checks pending" });
  expect(sql).toHaveBeenCalledTimes(1);
  expect(sql.mock.calls[0].slice(1)).toEqual([["7"], "https://app.example", 100]);
  const query = sql.mock.calls[0][0].join("?");
  expect(query).toContain("active = TRUE");
  expect(query).toContain("SELECT DISTINCT");
  expect(query).toContain("s.origin = ?");
  expect(query).toContain("BOOL_AND(s.checked_at IS NOT NULL)");
  expect(query).not.toMatch(/\b(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/);
  expect(JSON.stringify(result)).not.toMatch(/DONOR|private notes|secret/);
});

it("distinguishes missing assignments from a verified empty assignment list", async () => {
  sql.mockResolvedValue([summary([{ ...saved, assigned: 0, checked: 0, has_portfolio: null }, { ...saved, id: "8", assigned: 0, checked: 0 }])]);
  const { items } = await readPortfolioActivityCoverage(["7", "8"], "https://app.example");
  expect(items[0]).toMatchObject({ assigned: null, hasAssignments: false, label: "Assignment sync needed" });
  expect(items[1]).toMatchObject({ assigned: 0, hasAssignments: true, label: "No assigned constituents" });
});

it("does not label saved checks current when errors or a recheck backlog remain", () => {
  const item = { hasAssignments: true, assigned: 10, waiting: 0, due: 0, connectionErrors: 0, otherErrors: 0, throttled: 0 };
  expect(activityCoverageStatus(item)).toEqual({ level: "quiet", label: "Checks saved" });
  expect(activityCoverageStatus({ ...item, due: 5 }).label).toBe("Rechecks queued");
  expect(activityCoverageStatus({ ...item, waiting: 5 }).label).toBe("Initial checks pending");
  expect(activityCoverageStatus({ ...item, throttled: 2 }).label).toBe("Waiting for retry");
  expect(activityCoverageStatus({ ...item, throttled: 2, connectionErrors: 1 }).label).toBe("Checks need attention");
  expect(activityCoverageStatus({ ...item, otherErrors: 1 }).level).toBe("review");
});

it("retains global totals when bounding the per-portfolio list", async () => {
  sql.mockResolvedValue([{ ...summary(Array.from({ length: 101 }, (_, i) => ({ ...saved, id: String(i + 1) }))), total: 2020 }]);
  const result = await readPortfolioActivityCoverage(["7"], "https://app.example");
  expect(result.workspaceCount).toBe(101);
  expect(result.total).toBe(2020);
  expect(result.items).toHaveLength(100);
});

it.each([{ rows: [] }, { rows: [{}] }, { rows: [{ items: null }] }])("does not turn an incomplete aggregate into a healthy empty result (%j)", async ({ rows }) => {
  sql.mockResolvedValue(rows);
  await expect(readPortfolioActivityCoverage([], "https://app.example")).rejects.toThrow("Activity coverage unavailable");
});

it("shows missing or invalid saved timestamps as unknown", async () => {
  sql.mockResolvedValue([summary([{ ...saved, last_checked_at: null, oldest_checked_at: "invalid", last_attempt_at: null }])]);
  expect((await readPortfolioActivityCoverage(["7"], "https://app.example")).items[0]).toMatchObject({ lastCheckedAt: null, oldestCheckedAt: null, lastAttemptAt: null });
});
