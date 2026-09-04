import { describe, expect, it } from "vitest";
import { getStandingsPeriods, isInStandingsPeriod } from "./standingsPeriods";

describe("matched fiscal-year windows", () => {
  it("compares the same calendar dates, not a full previous FY", () => {
    const result = getStandingsPeriods(new Date("2026-09-04T23:30:00Z"));
    expect(result.current).toEqual({ label: "FY27", startsOn: "2026-07-01", endsOn: "2026-09-04" });
    expect(result.prior).toEqual({ label: "FY26", startsOn: "2025-07-01", endsOn: "2025-09-04" });
    expect(result.week).toMatchObject({ startsOn: "2026-08-24", endsOn: "2026-08-30" });
  });
  it("uses Eastern time at the year rollover", () => {
    expect(getStandingsPeriods(new Date("2026-07-01T02:00:00Z")).current).toEqual({ label: "FY26", startsOn: "2025-07-01", endsOn: "2026-06-30" });
    expect(getStandingsPeriods(new Date("2026-07-01T05:00:00Z")).current).toEqual({ label: "FY27", startsOn: "2026-07-01", endsOn: "2026-07-01" });
  });
  it("clamps leap day and retains the last complete week on Sundays", () => {
    expect(getStandingsPeriods(new Date("2024-02-29T15:00:00Z")).prior.endsOn).toBe("2023-02-28");
    expect(getStandingsPeriods(new Date("2026-09-06T15:00:00Z")).week).toMatchObject({ startsOn: "2026-08-24", endsOn: "2026-08-30" });
  });
  it("includes both boundary dates but not future dates", () => {
    const period = getStandingsPeriods(new Date("2026-09-04T12:00:00Z")).current;
    expect(isInStandingsPeriod("2026-07-01", period)).toBe(true);
    expect(isInStandingsPeriod("2026-09-04T23:59:59.999Z", period)).toBe(true);
    expect(isInStandingsPeriod("2026-09-05", period)).toBe(false);
    expect(isInStandingsPeriod("invalid", period)).toBe(false);
  });
});
