import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";

export default function CampaignOverview({ data }) {
  const ready = Boolean(data.runId);
  const committed = data.segments?.committed, received = data.segments?.received;
  const metricReady = metric => ready && metric?.status === "ready" && Number.isSafeInteger(metric.cents);
  return <section id="campaign-overview" className={styles.overview} aria-label="Campaign overview">
    <div className={styles.sectionHead}><div><h2>Campaign at a glance</h2><p className={styles.muted}>All fiscal years and all five pillars.</p></div></div>
    <div className={styles.overviewMetrics}>
      <article className={styles.metric} aria-label="Committed campaign total">
        <h3>Committed</h3><strong className={metricReady(committed) ? styles.metricAmount : styles.metricPending}>{metricReady(committed) ? campaignMoney(committed.cents) : "Not set up yet"}</strong>
        <p>{metricReady(committed) ? committed.description : "The commitment definition still needs to be confirmed."}</p>
      </article>
      <article className={styles.metric} aria-label="Received campaign total">
        <h3>Received</h3><strong className={metricReady(received) ? styles.metricAmount : styles.metricPending}>{metricReady(received) ? campaignMoney(received.cents) : "Payment data needed"}</strong>
        <p>{metricReady(received) ? received.description : "A complete payment source has not been connected yet. This is not a zero balance."}</p>
      </article>
    </div>
    <div className={styles.hero} role="group" aria-label="Campaign recognition total">
      <div><p className={styles.eyebrow}>CAMPAIGN RECOGNITION</p><h2>{campaignMoney(ready ? data.effectiveCents : null)}</h2><p>Your saved campaign definition, including local adjustments.</p></div>
      <div className={styles.reconciliation}>
        <span>Original allocation total <strong>{campaignMoney(ready ? data.originalCents : null)}</strong></span>
        <span>Local adjustments <strong>{campaignMoney(ready ? data.effectiveCents-data.originalCents : null)}</strong></span>
        <small>{ready ? `${data.uniqueRows.toLocaleString()} unique allocations from ${data.rawRows.toLocaleString()} query rows` : "Connect the query to build the first complete snapshot."}</small>
      </div>
    </div>
    {(!metricReady(committed) || !metricReady(received)) && <p className={styles.muted}>Campaign recognition is shown separately until the commitment and payment rules are confirmed. Pledge balance alone cannot tell us which fiscal year a payment was received.</p>}
  </section>;
}
