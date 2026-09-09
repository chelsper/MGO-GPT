import { describe, expect, it } from "vitest";
import { calendarDate, canRollOpportunityForward, closedOpportunityKind, formatCalendarDate, latestDatedAction, partitionOpportunities } from "./prospectActivity";

const now = new Date("2026-09-08T18:00:00Z");
describe("prospect opportunity presentation", () => {
  it("preserves calendar dates, including June 30 in Eastern time", () => {
    expect(formatCalendarDate("2027-06-30T00:00:00Z")).toBe("June 30, 2027");
    expect(calendarDate("2027-02-30")).toBeNull();
    expect(calendarDate("broken")).toBeNull();
  });
  it("separates active, recent closed, and older/undated history without losing records", () => {
    const items = [
      { id: 1, current_stage: "Cultivation" },
      { id: 2, current_stage: "Funded", close_date: "2026-06-30", updated_at: now },
      { id: 3, current_stage: "Withdrawn", close_date: "2025-10-01" },
      { id: 4, current_stage: "Funded", close_date: "2024-09-08", updated_at: now },
      { id: 5, current_stage: "Declined", close_date: null, updated_at: now },
      { id: 6, current_stage: "Funded", close_date: "2024-09-09" },
    ];
    const groups = partitionOpportunities(items, now);
    expect(groups.active.map((o) => o.id)).toEqual([1]);
    expect(groups.recentClosed.map((o) => o.id)).toEqual([2, 3, 6]);
    expect(groups.olderClosed.map((o) => o.id)).toEqual([4, 5]);
    expect(Object.values(groups).flat()).toHaveLength(items.length);
  });
  it("does not misclassify withdrawn opportunities with stale funded amounts", () => {
    expect(closedOpportunityKind({ current_stage: "Withdrawn", closed_amount: 100 })).toBe("Withdrawn");
    expect(closedOpportunityKind({ opportunity_status: "Closed - Gift Secured" })).toBe("Funded");
  });
  it.each(["Identification", "Cultivation", "Solicitation", "Solicitation - Verbal", "solicitation-verbal"])("offers rollover for prior-year %s", (stage) => {
    expect(canRollOpportunityForward({ current_stage: stage, expected_date: "2026-06-30" }, now)).toBe(true);
  });
  it.each(["Funded", "Withdrawn", "Declined", "Qualification", "Stewardship", "", "Unknown"])("does not roll forward %s", (stage) => {
    expect(canRollOpportunityForward({ current_stage: stage, expected_date: "2026-06-30" }, now)).toBe(false);
  });
  it.each([null, "invalid", "2026-07-01", "2027-06-30", "2028-06-30"])("does not roll missing, current or future expected date %s", (date) => {
    expect(canRollOpportunityForward({ current_stage: "Solicitation", expected_date: date }, now)).toBe(false);
  });
  it("uses the Eastern July 1 boundary and automatically advances fiscal years", () => {
    const opportunity = { current_stage: "Cultivation", expected_date: "2027-06-30" };
    expect(canRollOpportunityForward(opportunity, new Date("2027-07-01T03:59:59Z"))).toBe(false);
    expect(canRollOpportunityForward(opportunity, new Date("2027-07-01T04:00:00Z"))).toBe(true);
  });
  it("selects actions by action date, not sync date, and excludes future scheduled actions", () => {
    expect(latestDatedAction([
      { id: "1", date: "2026-08-01", date_modified: now },
      { id: "2", date: "2026-09-01" },
      { id: "3", date: "2026-12-01" },
    ], now)?.id).toBe("2");
  });
});
