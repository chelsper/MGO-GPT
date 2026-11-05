import { projectionCents } from "./fyRevenueGoals";
import { getStandingsPeriods } from "./standingsPeriods";

export function salaryCashAllocation(config, cashSnapshot, fundNames) {
  if (!config.salaryGoal) return null;
  const rule = config.salaryGoal;
  const groups = Array.isArray(cashSnapshot?.groups) ? cashSnapshot.groups.filter(group => group?.key === rule.fundGroup) : [];
  const impact = groups.length === 1 ? groups[0].receivedCents : null;
  const ready = Number.isSafeInteger(rule.cents) && rule.cents > 0 &&
    Number.isSafeInteger(cashSnapshot?.receivedCents) && Number.isSafeInteger(impact);
  const allocatedCents = ready ? Math.min(rule.cents, Math.max(0, impact)) : null;
  const budgetCash = ready ? cashSnapshot.receivedCents - allocatedCents : null;
  return { targetCents: rule.cents, fundName: fundNames?.[rule.fundGroup] || rule.fundName,
    receivedCents: ready ? impact : null, allocatedCents,
    remainingCents: ready ? rule.cents - allocatedCents : null,
    excessCents: ready ? Math.max(0, impact - rule.cents) : null,
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
  const salary = salaryCashAllocation(config, cashSnapshot, fundNames);
  const budgetCashCents = salary ? salary.budgetCashCents : Number.isSafeInteger(cash) ? cash : null;
  const missing = [reinvestmentCents === null && "gift re-investment", budgetCashCents === null &&
    (Number.isSafeInteger(cash) && salary ? "Impact Fund allocation" : "budget-relieving cash")].filter(Boolean);
  let totalCents = null, remainingCents = null, aboveGoalCents = null, percent = null, overflow = false;
  if (activeFiscalYear && !missing.length) {
    const total = BigInt(fixedTotalCents) + BigInt(reinvestmentCents) + BigInt(budgetCashCents);
    const remaining = BigInt(config.cents) - total;
    overflow = !Number.isSafeInteger(Number(total)) || !Number.isSafeInteger(Number(remaining));
    if (!overflow) {
      totalCents = Number(total);
      remainingCents = Number(remaining > 0n ? remaining : 0n);
      aboveGoalCents = Number(remaining < 0n ? -remaining : 0n);
      percent = totalCents / config.cents * 100;
    }
  }
  return { activeFiscalYear, fixedTotalCents, reinvestmentCents, budgetCashCents, salary, missing, overflow, totalCents, remainingCents, aboveGoalCents, percent };
}
