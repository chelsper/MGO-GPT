import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";
import CampaignClassification from "./CampaignClassification";

export default function CampaignOverview({ data }) {
  const ready = Boolean(data.runId);
  const committed = data.segments?.committed, received = data.segments?.received;
  const metricReady = metric => ready && metric?.status === "ready" && Number.isSafeInteger(metric.cents);
  return <section id="campaign-overview" className={styles.overview} aria-label="Campaign overview">
    <div className={styles.sectionHead}><div><h2>Campaign at a glance</h2><p className={styles.muted}>All fiscal years and all five pillars.</p></div></div>
    <div className={styles.overviewMetrics}>
      <article className={styles.metric} aria-label="Committed campaign total">
        <h3>Committed</h3><strong className={metricReady(committed) ? styles.metricAmount : styles.metricPending}>{metricReady(committed) ? campaignMoney(committed.cents) : "Not set up yet"}</strong>
        <p>{metricReady(committed) ? "After write-offs and campaign-only adjustments." : committed?.description || "Map write-offs and refresh the campaign to calculate Committed."}</p>
      </article>
      <article className={styles.metric} aria-label="Received campaign total">
        <h3>Received to date</h3><strong className={metricReady(received) ? styles.metricAmount : styles.metricPending}>{metricReady(received) ? campaignMoney(received.cents) : "Balance data needed"}</strong>
        <p>{metricReady(received) ? "Committed less outstanding pledge balances." : received?.description || "Map write-offs and current pledge balances, then refresh. This is not a zero balance."}</p>
      </article>
      <article className={styles.metric} aria-label="Outstanding pledge balance">
        <h3>Outstanding pledges</h3><strong className={metricReady(received) && Number.isSafeInteger(data.pledgeBalanceCents) ? styles.metricAmount : styles.metricPending}>{metricReady(received) && Number.isSafeInteger(data.pledgeBalanceCents) ? campaignMoney(data.pledgeBalanceCents) : "Balance data needed"}</strong>
        <p>Remaining pledge balances, already included in Committed.</p>
      </article>
    </div>
    <p className={styles.muted}>Received is paid to date on campaign gifts, not cash receipts within a particular fiscal year.</p>
    {ready && !metricReady(committed) && <div className={styles.recognition} role="group" aria-label="Campaign recognition total"><h3>Campaign recognition</h3><strong className={styles.metricAmount}>{campaignMoney(data.effectiveCents)}</strong><p className={styles.muted}>Saved campaign amount. Committed and Received need the financial setup above.</p></div>}
    <CampaignClassification data={data} />
    <details className={styles.calculations}>
      <summary>How these totals are calculated</summary>
      <p>Committed is the original gift amount less write-offs, plus approved campaign-only adjustments. Received is Committed less outstanding pledge balances. It is not a cash-ledger report.</p>
      <div className={styles.reconciliation}>
        <span>Original allocation total <strong>{campaignMoney(ready ? data.originalCents : null)}</strong></span>
        <span>Write-offs <strong>{campaignMoney(ready ? data.writeOffCents : null)}</strong></span>
        <span>Net gift amount <strong>{campaignMoney(ready ? data.netCents ?? data.originalCents : null)}</strong></span>
        <span>Local adjustments <strong>{campaignMoney(ready ? data.effectiveCents-(data.netCents ?? data.originalCents) : null)}</strong></span>
        <small>{ready ? `${data.uniqueRows.toLocaleString()} unique allocations from ${data.rawRows.toLocaleString()} query rows` : "Connect the query to build the first complete snapshot."}</small>
      </div>
      <p>Philanthropic is the campaign total minus Comprehensive Investment. The classification query identifies gifts already included in the campaign; its amounts are not added again.</p>
      <p>Multi-fund gifts use verified NXT allocations and proportionally allocated deductions. Local adjustments affect this dashboard only; original NXT amounts remain visible. Missing deductions or balances are not treated as verified zeros.</p>
      {data.writeOffSource && <p>Write-offs use the saved CSV register: complete list through {data.writeOffSource.completeAsOf}; additions/corrections through {data.writeOffSource.latestAsOf}. New NXT write-offs require an updated upload.</p>}
      {data.orphaned > 0 && <p>{data.orphaned} saved exceptions belong to allocations no longer in this query. They are retained in history but excluded from totals.</p>}
    </details>
  </section>;
}
