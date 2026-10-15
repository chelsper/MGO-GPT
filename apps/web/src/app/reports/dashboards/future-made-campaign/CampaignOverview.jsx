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
        <p>{committed?.description || "Map write-offs and refresh the campaign to calculate Committed."}</p>
      </article>
      <article className={styles.metric} aria-label="Received campaign total">
        <h3>Received</h3><strong className={metricReady(received) ? styles.metricAmount : styles.metricPending}>{metricReady(received) ? campaignMoney(received.cents) : "Balance data needed"}</strong>
        <p>{received?.description || "Map write-offs and current pledge balances, then refresh. This is not a zero balance."}</p>
      </article>
    </div>
    <CampaignClassification data={data} />
    <div className={styles.hero} role="group" aria-label="Campaign recognition total">
      <div><p className={styles.eyebrow}>CAMPAIGN RECOGNITION</p><h2>{campaignMoney(ready ? data.effectiveCents : null)}</h2><p>Your saved campaign definition, less mapped write-offs and including local adjustments.</p></div>
      <div className={styles.reconciliation}>
        <span>Original allocation total <strong>{campaignMoney(ready ? data.originalCents : null)}</strong></span>
        <span>Write-offs <strong>{campaignMoney(ready ? data.writeOffCents : null)}</strong></span>
        <span>Net gift amount <strong>{campaignMoney(ready ? data.netCents ?? data.originalCents : null)}</strong></span>
        <span>Local adjustments <strong>{campaignMoney(ready ? data.effectiveCents-(data.netCents ?? data.originalCents) : null)}</strong></span>
        <span>Outstanding pledge balance <strong>{campaignMoney(ready ? data.pledgeBalanceCents : null)}</strong></span>
        <small>{ready ? `${data.uniqueRows.toLocaleString()} unique allocations from ${data.rawRows.toLocaleString()} query rows` : "Connect the query to build the first complete snapshot."}</small>
      </div>
    </div>
    <p className={styles.muted}>Received is calculated from current pledge balances, not payment dates. It includes approved campaign-only adjustments and is not a cash-ledger report. Unmapped deductions are not treated as verified zeros.</p>
  </section>;
}
