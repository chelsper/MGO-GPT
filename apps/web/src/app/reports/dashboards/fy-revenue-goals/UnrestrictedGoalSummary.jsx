import { revenueMoney } from "@/utils/fyRevenueGoals";
import { unrestrictedRevenueGoal } from "@/utils/unrestrictedRevenueGoal";
import styles from "./revenue.module.css";

const refreshed = snapshot => snapshot?.refreshedAt && Number.isFinite(Date.parse(snapshot.refreshedAt))
  ? `Saved ${new Date(snapshot.refreshedAt).toLocaleString()}` : "No saved query total";

const dateLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
export default function UnrestrictedGoalSummary({ config, reinvestmentSnapshot, cashSnapshot, now }) {
  if (!config) return null;
  const goal = unrestrictedRevenueGoal(config, reinvestmentSnapshot, cashSnapshot, now);
  const complete = goal.totalCents !== null;
  const progress = complete ? Math.min(100, Math.max(0, goal.percent)) : 0;
  const percentLabel = complete ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(goal.percent)}%` : "";
  const pending = !goal.activeFiscalYear ? `${config.label} configuration needs updating` : goal.overflow ? "Total needs review" : "Awaiting source totals";
  return <section className={styles.goalSummary} aria-labelledby="unrestricted-goal-heading">
    <header className={styles.goalHeader}><div><p className={styles.eyebrow}>{config.label} · {dateLabel(config.startsOn)} - {dateLabel(config.endsOn)}</p>
      <h2 id="unrestricted-goal-heading">Unrestricted revenue goal</h2><p>Cash received to date toward this fiscal year's goal.</p></div>
      <span className={styles.goalBadge}>CASH BASIS</span></header>
    <dl className={styles.goalMetrics}>
      <div><dt>Cash received to date</dt><dd className={styles.goalTotal}>{complete ? revenueMoney(goal.totalCents) : <span className={styles.goalPending}>{pending}</span>}</dd></div>
      <div><dt>Annual goal</dt><dd>{revenueMoney(config.cents)}</dd></div>
      <div><dt>Remaining to goal</dt><dd>{complete ? revenueMoney(goal.remainingCents) : <span className={styles.goalPending}>{pending}</span>}</dd>
        {goal.aboveGoalCents > 0 && <p className={styles.goalSurplus}>{revenueMoney(goal.aboveGoalCents)} above goal</p>}</div>
    </dl>
    {complete ? <div className={styles.goalProgress}>
      <div role="progressbar" aria-label="Unrestricted revenue goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        aria-valuetext={`${percentLabel} of goal; ${revenueMoney(goal.totalCents)} received toward ${revenueMoney(config.cents)}`}><span style={{ width: `${progress}%` }} /></div>
      <p><strong>{percentLabel} of goal</strong><span>{goal.remainingCents === 0 ? "Goal reached" : `${revenueMoney(goal.remainingCents)} to go`}</span></p>
    </div> : <p role="status" className={styles.goalNotice}>{!goal.activeFiscalYear
      ? `These fixed entries and the ${revenueMoney(config.cents)} target apply to ${config.label} only. Update the fiscal-year configuration before combining them with another year's query totals.`
      : goal.overflow ? "A source amount exceeds the supported reporting range. The combined total has not been calculated."
      : `Waiting for saved ${goal.missing.join(" and ")} totals. The full cash total and remaining amount will appear once both sources are available.`}</p>}
    <div className={styles.goalBreakdown}>
      <h3>What counts toward the goal</h3>
      <dl>
        <div><dt><a href="#budget-cash-heading">Budget-relieving cash received</a><small>Query 31075 · {refreshed(cashSnapshot)}</small></dt><dd>{revenueMoney(goal.budgetCashCents)}</dd></div>
        <div><dt><a href="#reinvestment-totals">Gift re-investment (10%)</a><small>10% of query 31074's received total · {refreshed(reinvestmentSnapshot)}</small></dt><dd>{revenueMoney(goal.reinvestmentCents)}</dd></div>
        {config.fixedContributions.map(item => <div key={item.key}><dt>{item.label}<small>Fixed cash received entry</small></dt><dd>{revenueMoney(item.cents)}</dd></div>)}
      </dl>
      <p className={styles.help}>Fixed contributions total {revenueMoney(goal.fixedTotalCents)}. The roll-up adds these to budget-relieving cash plus the 10% re-investment amount, not the full eligible-gifts total. The three fixed contributions are confirmed as separate from query 31075. No NXT records are changed.</p>
    </div>
  </section>;
}
