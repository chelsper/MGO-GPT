import { describe, expect, it } from "vitest";
import { activityNextCheckAt, selectActivityRows } from "./portfolioActivitySchedule";

const rows = (lane, count = 20) => Array.from({ length: count }, (_, i) => ({ queue_lane: lane, constituent_id: `${lane}-${i}` }));

describe("portfolio activity scheduling", () => {
  it("gives first-fill work priority without starving routine checks or retries", () => {
    const candidates = [...rows("priority"), ...rows("routine"), ...rows("retry")];
    const selected = selectActivityRows(candidates);
    expect(selected).toHaveLength(20);
    expect(selected.slice(0, 8).map(row => row.queue_lane)).toEqual([
      "priority", "priority", "routine", "priority", "retry", "routine", "priority", "routine",
    ]);
    expect(new Set(selected.map(row => row.constituent_id)).size).toBe(20);
    expect(candidates).toHaveLength(60);
    for (const lane of ["priority", "routine", "retry"]) {
      const selectedLane = selected.filter(row => row.queue_lane === lane);
      expect(selectedLane).toEqual(rows(lane, selectedLane.length));
    }
  });
  it.each(["priority", "routine", "retry"])("fills spare slots when only %s work is due", lane => {
    expect(selectActivityRows(rows(lane, 30))).toEqual(rows(lane, 20));
    expect(selectActivityRows(rows(lane, 2))).toEqual(rows(lane, 2));
  });
  it("handles empty queues and uses unused slots without duplicate selections", () => {
    expect(selectActivityRows([])).toEqual([]);
    const result = selectActivityRows([...rows("priority", 1), ...rows("routine", 1), ...rows("retry", 3)]);
    expect(result).toHaveLength(5);
    expect(new Set(result.map(row => row.constituent_id)).size).toBe(5);
  });
  it("spreads future checks deterministically between 24 and 30 hours after the actual check", () => {
    const checkedAt = "2026-09-18T06:00:00Z";
    const row = { workspace_user_id: 7, origin: "https://example.com", constituent_id: "100", kind: "gift" };
    const offsets = new Set();
    for (let i = 0; i < 100; i++) {
      const candidate = { ...row, constituent_id: String(i + 1) };
      const next = activityNextCheckAt(candidate, checkedAt);
      const offset = Date.parse(next) - Date.parse(checkedAt);
      expect(offset).toBeGreaterThanOrEqual(24 * 3600000);
      expect(offset).toBeLessThanOrEqual(30 * 3600000);
      expect(next).toBe(activityNextCheckAt(candidate, checkedAt));
      offsets.add(offset);
    }
    expect(offsets.size).toBeGreaterThan(90);
    expect(activityNextCheckAt(row, checkedAt)).toBe(activityNextCheckAt({ ...row, workspace_user_id: "7" }, checkedAt));
    const variants = [row, { ...row, workspace_user_id: 8 }, { ...row, origin: "https://other.example.com" }, { ...row, kind: "action" }];
    expect(new Set(variants.map(candidate => activityNextCheckAt(candidate, checkedAt))).size).toBe(4);
    expect(() => activityNextCheckAt(row, "invalid")).toThrow("invalid_activity_check_time");
  });
});
