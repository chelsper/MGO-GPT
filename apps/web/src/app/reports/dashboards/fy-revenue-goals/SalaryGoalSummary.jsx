import { revenueMoney } from "@/utils/fyRevenueGoals";
import styles from "./revenue.module.css";

export default function SalaryGoalSummary({ config, goal, expected }) {
  const salary = goal.salary;
  if (!salary) return null;
  const ready = goal.activeFiscalYear && salary.allocatedCents !== null;
  const progress = ready ? salary.allocatedCents / salary.targetCents * 100 : 0;
  const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(progress);
  const projected = ready && expected.salaryExpectedCents !== null ? salary.allocatedCents + expected.salaryExpectedCents : null;
  return <section className={`${styles.goalSummary} ${styles.salarySummary}`} aria-labelledby="salary-goal-heading">
    <header className={styles.goalHeader}><div><p className={styles.eyebrow}>{config.label} · ADDITIONAL GOAL</p>
      <h2 id="salary-goal-heading">Salaries funded from Future. Made. Impact Fund</h2>
      <p>The first {revenueMoney(salary.targetCents)} received from this fund supports salaries. Only cash above that amount counts toward the separate {revenueMoney(config.cents)} unrestricted goal.</p>
    </div><span className={styles.goalBadge}>SALARIES FIRST</span></header>
    <dl className={styles.goalMetrics}>
      <div><dt>Cash allocated to salaries</dt><dd className={styles.goalTotal}>{ready ? revenueMoney(salary.allocatedCents) : <span className={styles.goalPending}>Awaiting allocation</span>}</dd></div>
      <div><dt>Salary goal</dt><dd>{revenueMoney(salary.targetCents)}</dd></div>
      <div><dt>Still to fund</dt><dd>{ready ? revenueMoney(salary.remainingCents) : <span className={styles.goalPending}>Awaiting allocation</span>}</dd></div>
    </dl>
    {ready && <div className={styles.goalProgress}>
      <div role="progressbar" aria-label="Salary funding goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        aria-valuetext={`${percent}% of salary goal; ${revenueMoney(salary.allocatedCents)} allocated toward ${revenueMoney(salary.targetCents)}`}><span style={{ width: `${progress}%` }} /></div>
      <p><strong>{percent}% funded</strong><span>{salary.remainingCents === 0 ? "Salary goal funded; additional cash supports the unrestricted goal" : `${revenueMoney(salary.remainingCents)} before additional cash supports the unrestricted goal`}</span></p>
    </div>}
    <div className={styles.goalBreakdown}><dl>
      <div><dt>Impact Fund cash received<small>Included in query 31075's fund breakdown</small></dt><dd>{revenueMoney(ready ? salary.receivedCents : null)}</dd></div>
      <div><dt>Excess cash toward unrestricted goal</dt><dd>{revenueMoney(ready ? salary.excessCents : null)}</dd></div>
      <div><dt>Expected installments allocated to salaries<small>Not received cash; fills only the remaining salary need</small></dt><dd>{revenueMoney(ready ? expected.salaryExpectedCents : null)}</dd></div>
      <div><dt>Salary funding after expected receipts</dt><dd>{revenueMoney(projected)}</dd></div>
    </dl></div>
    <p className={styles.help}>{!goal.activeFiscalYear ? "Update the fiscal-year configuration before calculating this allocation. " : !ready ? "Load the saved cash fund breakdown to calculate this allocation. " : ""}
      This tracks cash allocated for salaries, not payroll payments. The source gifts stay unchanged; the same cash is not allocated to both goals.</p>
  </section>;
}
