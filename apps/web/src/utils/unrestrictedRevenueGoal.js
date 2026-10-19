import { projectionCents } from "./fyRevenueGoals";
import { getStandingsPeriods } from "./standingsPeriods";

export function unrestrictedRevenueGoal(config, reinvestmentSnapshot, cashSnapshot, now = new Date()) {
  const period = getStandingsPeriods(now).fiscalYear;
  const activeFiscalYear = period.startsOn === config.startsOn && period.endsOn === config.endsOn;
  const fixedTotalCents = config.fixedContributions.reduce((sum, item) => sum + item.cents, 0);
  const eligible = reinvestmentSnapshot?.receivedCents;
  const cash = cashSnapshot?.receivedCents;
  // Always take the 10% set-aside, even if the detail panel displays the optional 90% remainder.
  const reinvestmentCents = Number.isSafeInteger(eligible) ? projectionCents(eligible, "set_aside") : null;
  const budgetCashCents = Number.isSafeInteger(cash) ? cash : null;
  const missing = [reinvestmentCents === null && "gift re-investment", budgetCashCents === null && "budget-relieving cash"].filter(Boolean);
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
  return { activeFiscalYear, fixedTotalCents, reinvestmentCents, budgetCashCents, missing, overflow, totalCents, remainingCents, aboveGoalCents, percent };
}
