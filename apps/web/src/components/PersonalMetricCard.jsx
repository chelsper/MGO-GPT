import QueryResultsTable from "./QueryResultsTable";
import styles from "./personalDashboard.module.css";

export default function PersonalMetricCard({ card }) {
  if (card.unavailable || !card.metric) return <article className={styles.metric}>
    <h2>Metric unavailable</h2><p className={styles.muted}>This metric is no longer shared with you. You can remove it when editing your dashboard.</p>
  </article>;
  const { metric, result } = card;
  const date = result?.asOf ? new Date(result.asOf) : null;
  const asOf = date && Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : null;
  const unknown = !result || result.status === "missing" || (result.type !== "table" && !Number.isFinite(result.value));
  return <article className={`${styles.metric} ${result?.type === "table" ? styles.fullWidth : ""}`}>
    <h2>{metric.title}</h2>
    {metric.description && <p className={styles.muted}>{metric.description}</p>}
    {unknown ? <p className={styles.muted}>No saved value available yet.</p>
      : result.type === "table" ? <QueryResultsTable title={metric.title} headers={result.headers} rows={result.rows} columnSettings={result.columnSettings} compact />
      : <p className={styles.value}>{new Intl.NumberFormat("en-US", metric.format === "currency" ? { style: "currency", currency: "USD" } : { maximumFractionDigits: 6 }).format(result.value)}</p>}
    <p className={styles.timestamp}>{[asOf ? `As of ${asOf}` : null, result?.provenance === "manual" ? "Manual value" : null,
      result?.refreshPolicy === "frozen" ? "Frozen snapshot" : null, result?.status === "stale" ? "Last saved result" : null].filter(Boolean).join(" · ")}</p>
  </article>;
}
