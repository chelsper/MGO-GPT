import { describe, expect, it } from "vitest";
import { unrestrictedRevenueGoal } from "./unrestrictedRevenueGoal";
import { UNRESTRICTED_GOAL_CONFIG as config } from "@/app/api/utils/fyUnrestrictedGoal";

const now = new Date("2026-10-19T15:00:00Z");
const summary = (eligible, cash, date = now) => unrestrictedRevenueGoal(config, { receivedCents: eligible, projectedCents: 99999999 }, { receivedCents: cash }, date);
describe("FY27 unrestricted cash goal", () => {
  it("uses the requested target and three separate cash entries", () => {
    expect(config.cents).toBe(650000000);
    expect(config.fixedContributions.map(item => [item.label, item.cents])).toEqual([
      ["Parmelee Estate", 230000000], ["Lovett Trust", 23000000], ["LINE Funding", 50000000],
    ]);
    expect(summary(0, 0).fixedTotalCents).toBe(303000000);
  });
  it("adds budget cash, exactly 10% of eligible cash and the fixed subtotal once", () => {
    const goal = summary(425000000, 32500000);
    expect(goal).toMatchObject({ totalCents: 378000000, remainingCents: 272000000, aboveGoalCents: 0, reinvestmentCents: 42500000, budgetCashCents: 32500000, missing: [] });
    expect(goal.percent).toBeCloseTo(58.153846);
  });
  it("never uses the optional 90% display figure or adds the entire eligible amount", () => {
    const goal = unrestrictedRevenueGoal(config, { receivedCents: 100000000, projectedCents: 90000000 }, { receivedCents: 50000000 }, now);
    expect(goal.totalCents).toBe(363000000);
    expect(goal.reinvestmentCents).toBe(10000000);
  });
  it("keeps valid zero totals distinct from unavailable query data", () => {
    expect(summary(0, 0)).toMatchObject({ totalCents: 303000000, remainingCents: 347000000, missing: [] });
    expect(unrestrictedRevenueGoal(config, null, null, now)).toMatchObject({ totalCents: null, remainingCents: null, percent: null, missing: ["gift re-investment", "budget-relieving cash"] });
    expect(summary(100, undefined)).toMatchObject({ reinvestmentCents: 10, totalCents: null, missing: ["budget-relieving cash"] });
  });
  it.each([NaN, Infinity, "10000", 1.5, null, Number.MAX_SAFE_INTEGER + 1])("does not silently use invalid amounts %s", value => {
    expect(summary(value, 0)).toMatchObject({ totalCents: null, reinvestmentCents: null });
    expect(summary(0, value)).toMatchObject({ totalCents: null, budgetCashCents: null });
  });
  it("rounds ten percent once in cents and includes negative adjustments", () => {
    expect(summary(100005, -500)).toMatchObject({ reinvestmentCents: 10001, totalCents: 303009501 });
    expect(summary(-100005, 0)).toMatchObject({ reinvestmentCents: -10001, totalCents: 302989999 });
  });
  it("shows zero remaining and a separate surplus when the target is exceeded", () => {
    expect(summary(0, 347000000)).toMatchObject({ totalCents: 650000000, remainingCents: 0, aboveGoalCents: 0, percent: 100 });
    expect(summary(100000000, 347000000)).toMatchObject({ totalCents: 660000000, remainingCents: 0, aboveGoalCents: 10000000 });
  });
  it("rejects an unsafe aggregate even when its individual components fit", () => {
    expect(summary(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toMatchObject({ overflow: true, totalCents: null, remainingCents: null });
  });
  it("does not relabel or reuse FY27 fixed amounts across fiscal-year boundaries", () => {
    expect(summary(0, 0, new Date("2026-07-01T03:59:59Z"))).toMatchObject({ activeFiscalYear: false, totalCents: null });
    expect(summary(0, 0, new Date("2026-07-01T04:00:00Z"))).toMatchObject({ activeFiscalYear: true, totalCents: 303000000 });
    expect(summary(0, 0, new Date("2027-07-01T03:59:59Z"))).toMatchObject({ activeFiscalYear: true });
    expect(summary(0, 0, new Date("2027-07-01T04:00:00Z"))).toMatchObject({ activeFiscalYear: false, totalCents: null, remainingCents: null });
  });
});
