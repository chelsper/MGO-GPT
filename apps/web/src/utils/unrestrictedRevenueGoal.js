import { projectionCents } from "./fyRevenueGoals";
import { getStandingsPeriods } from "./standingsPeriods";

export function salaryCashAllocation(config, cashSnapshot, fundNames, reinvestmentSnapshot) {
  if (!config.salaryGoal) return null;
  const rule = config.salaryGoal;
  const groups = Array.isArray(cashSnapshot?.groups) ? cashSnapshot.groups.filter(group => group?.key === rule.fundGroup) : [];
  const impact = groups.length === 1 ? groups[0].receivedCents : null;
  const reinvestmentCents = rule.includeReinvestment
    ? Number.isSafeInteger(reinvestmentSnapshot?.receivedCents) ? projectionCents(reinvestmentSnapshot.receivedCents, "set_aside") : null
    : 0;
  const ready = Number.isSafeInteger(rule.cents) && rule.cents > 0 &&
    Number.isSafeInteger(cashSnapshot?.receivedCents) && Number.isSafeInteger(impact) && Number.isSafeInteger(reinvestmentCents);
  // Keep the full set-aside in salaries; Impact cash fills the remaining need only.
  const impactAllocatedCents = ready ? Math.min(Math.max(0, rule.cents - reinvestmentCents), Math.max(0, impact)) : null;
  const allocatedCents = ready ? impactAllocatedCents + reinvestmentCents : null;
  const budgetCash = ready ? cashSnapshot.receivedCents - impactAllocatedCents : null;
  return { targetCents: rule.cents, fundName: fundNames?.[rule.fundGroup] || rule.fundName,
    receivedCents: ready ? impact : null, allocatedCents, impactAllocatedCents, reinvestmentCents,
    remainingCents: ready ? Math.max(0, rule.cents - allocatedCents) : null,
    aboveGoalCents: ready ? Math.max(0, allocatedCents - rule.cents) : null,
    excessCents: ready ? Math.max(0, impact - impactAllocatedCents) : null,
    budgetCashCents: Number.isSafeInteger(budgetCash) ? budgetCash : null };
}

export function unrestrictedRevenueGoal(config, reinvestmentSnapshot, cashSnapshot, now = new Date(), fundNames) {
  const period = getStandingsPeriods(now).fiscalYear;
  const activeFiscalYear = period.startsOn === config.startsOn && period.endsOn === config.endsOn;
  const fixedTotalCents = config.fixedContributions.reduce((sum, item) => sum + item.cents, 0);
  const eligible = reinvestmentSnapshot?.receivedCents;
  const cash = cashSnapshot?.receivedCents;
  // Always take the 10% set-aside, even if the detail panel displays the optional 90% remainder.
  const reinvestmentCents = Number.isSafeInteger(eligible) ? projectionCents(eligible, "set_aside") : null;
  const salary = salaryCashAllocation(config, cashSnapshot, fundNames, reinvestmentSnapshot);
  const unrestrictedReinvestmentCents = reinvestmentCents === null ? null : config.salaryGoal?.includeReinvestment ? 0 : reinvestmentCents;
  const budgetCashCents = salary ? salary.budgetCashCents : Number.isSafeInteger(cash) ? cash : null;
  const missing = [reinvestmentCents === null && "gift re-investment", budgetCashCents === null &&
    (Number.isSafeInteger(cash) && salary ? "Impact Fund allocation" : "budget-relieving cash")].filter(Boolean);
  let totalCents = null, remainingCents = null, aboveGoalCents = null, percent = null, overflow = false;
  if (activeFiscalYear && !missing.length) {
    const total = BigInt(fixedTotalCents) + BigInt(unrestrictedReinvestmentCents) + BigInt(budgetCashCents);
    const remaining = BigInt(config.cents) - total;
    overflow = !Number.isSafeInteger(Number(total)) || !Number.isSafeInteger(Number(remaining));
    if (!overflow) {
      totalCents = Number(total);
      remainingCents = Number(remaining > 0n ? remaining : 0n);
      aboveGoalCents = Number(remaining < 0n ? -remaining : 0n);
      percent = totalCents / config.cents * 100;
    }
  }
  return { activeFiscalYear, fixedTotalCents, reinvestmentCents, unrestrictedReinvestmentCents, budgetCashCents, salary, missing, overflow, totalCents, remainingCents, aboveGoalCents, percent };
}
