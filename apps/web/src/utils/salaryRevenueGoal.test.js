import { expect, it } from "vitest";
import { unrestrictedRevenueGoal } from "./unrestrictedRevenueGoal";
import { unrestrictedExpectedGoal } from "./fyBudgetPledges";
import { UNRESTRICTED_GOAL_CONFIG as config } from "@/app/api/utils/fyUnrestrictedGoal";

const now = new Date("2026-11-05T15:00:00Z");
const cash = (impact, other = 20000000, extra = {}) => unrestrictedRevenueGoal(config, { receivedCents: 100000000 },
  { receivedCents: impact + other, groups: [{ key: "impact", receivedCents: impact }, { key: "other", receivedCents: other }], ...extra }, now);
const pledges = (impact, other = 0) => ({ period: config, outstandingCents: impact + other, countableCents: impact + other,
  fundTotals: [{ fundName: "Future. Made. Impact Fund", countableCents: impact }, { fundName: "Other Scholarship", countableCents: other }] });

it.each([[0,0,0], [65000000,65000000,0], [84999999,84999999,0], [85000000,85000000,0],
  [85000001,85000000,1], [100000000,85000000,15000000]])("allocates %i cents salary-first without double counting", (impact, salary, excess) => {
  const goal = cash(impact);
  expect(config.cents).toBe(650000000);
  expect(goal.salary).toMatchObject({ targetCents: 85000000, allocatedCents: salary, remainingCents: 85000000 - salary, excessCents: excess });
  expect(goal.budgetCashCents).toBe(20000000 + excess);
  expect(goal.salary.allocatedCents + goal.budgetCashCents).toBe(impact + 20000000);
  expect(goal.totalCents).toBe(303000000 + 10000000 + 20000000 + excess);
});
it.each([undefined, {}, [], [{key:"other",receivedCents:1}], [{key:"impact",receivedCents:"1"}],
  [{key:"impact",receivedCents:1},{key:"impact",receivedCents:1}]])("holds unknown or ambiguous Impact Fund totals instead of assuming zero: %j", groups => {
  const goal = cash(100, 0, { groups });
  expect(goal.totalCents).toBeNull(); expect(goal.salary.allocatedCents).toBeNull();
  expect(goal.missing).toContain("Impact Fund allocation");
});
it("reopens the salary need after a reduction and preserves negative source adjustments", () => {
  expect(cash(80000000).salary.remainingCents).toBe(5000000);
  const negative = cash(-10000);
  expect(negative.salary).toMatchObject({ allocatedCents: 0, remainingCents: 85000000, excessCents: 0 });
  expect(negative.budgetCashCents).toBe(19990000);
  const projected = unrestrictedExpectedGoal(config, negative, pledges(50000));
  expect(projected).toMatchObject({ salaryExpectedCents: 40000, expectedCents: 10000 });
});
it("allocates expected Impact installments only after cash, retaining adjusted eligibility", () => {
  const goal = cash(30000000), snapshot = pledges(80000000, 20000000);
  snapshot.outstandingCents = 120000000;
  const expected = unrestrictedExpectedGoal(config, goal, snapshot);
  expect(expected).toMatchObject({ countableCents: 100000000, salaryExpectedCents: 55000000, expectedCents: 45000000, totalCents: 378000000 });
  expect(goal.totalCents).toBe(333000000);
  expect(expected.expectedCents + expected.salaryExpectedCents).toBe(snapshot.countableCents);
});
it("moves payment amounts from expected to received without duplicating either goal", () => {
  const before = unrestrictedExpectedGoal(config, cash(30000000), pledges(80000000, 20000000));
  const after = unrestrictedExpectedGoal(config, cash(90000000), pledges(20000000, 20000000));
  expect(after.totalCents).toBe(before.totalCents);
  expect(after.salaryExpectedCents).toBe(0);
  expect(cash(90000000).salary.allocatedCents).toBe(85000000);
});
it("matches the saved fund mapping with punctuation normalization, not partial names", () => {
  const goal = unrestrictedRevenueGoal(config, {receivedCents:0}, {receivedCents:0,groups:[{key:"impact",receivedCents:0}]}, now, {impact:"Custom Impact Fund"});
  const snapshot = pledges(10000, 20000);
  snapshot.fundTotals[0].fundName = "  CUSTOM IMPACT FUND. ";
  expect(unrestrictedExpectedGoal(config, goal, snapshot).salaryExpectedCents).toBe(10000);
  snapshot.fundTotals[0].fundName = "Custom Impact Fund Alumni";
  expect(unrestrictedExpectedGoal(config, goal, snapshot).salaryExpectedCents).toBe(0);
});
it.each([undefined, [], [{fundName:"Future. Made. Impact Fund",countableCents:999}],
  [{fundName:"",countableCents:1000}], [{fundName:"Other",countableCents:-1000}]])("holds a projection without reconciled fund totals: %j", fundTotals => {
  expect(unrestrictedExpectedGoal(config, cash(0), {...pledges(1000),fundTotals}).totalCents).toBeNull();
});
it("distinguishes zero expected receipts from unknown data and rejects a different fiscal year", () => {
  expect(unrestrictedExpectedGoal(config, cash(0), pledges(0)).expectedCents).toBe(0);
  expect(unrestrictedExpectedGoal(config, cash(0), null).expectedCents).toBeNull();
  expect(unrestrictedExpectedGoal(config, cash(0), {...pledges(1000),period:{startsOn:"2025-07-01",endsOn:"2026-06-30"}}).totalCents).toBeNull();
  expect(unrestrictedExpectedGoal(config, {...cash(0),activeFiscalYear:false}, pledges(1000)).totalCents).toBeNull();
});
