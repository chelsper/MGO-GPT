"use client";
import { useEffect, useState } from "react";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import styles from "@/components/relationshipOriginator.module.css";

const money = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? "Unavailable" :
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
export default function RelationshipOriginators() {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reports/relationship-originators", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load originator metrics.");
        if (!controller.signal.aborted) setReport(result);
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, []);
  async function refresh() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/reports/relationship-originators", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not refresh originator metrics.");
      setReport(result);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className={styles.report} aria-label="Relationship originator metrics">
    <div className={styles.heading}>
      <div><h2>Relationships that started with you</h2>
        <p>Constituents introduced by each fundraiser, and the giving received since those relationships began. Credit stays with the originator when a portfolio changes.</p></div>
      <button className={styles.button} type="button" disabled={busy} onClick={refresh}>{busy ? "Refreshing originators..." : "Refresh originator metrics"}</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {report?.refreshWarning && <p role="status">{report.refreshWarning}</p>}
    {report?.status === "refresh_required" && <p>No saved originator metrics yet. Refresh once to read existing Relationship Originator fields from NXT.</p>}
    {report?.generatedAt && <p className={styles.hint}>Saved {new Date(report.generatedAt).toLocaleString()}. Giving through {report.asOf}; gift checks may be cached for up to 24 hours.</p>}
    {report?.issueCount > 0 && <p role="status">{report.issueCount} constituent records need an Admin to check their originator or introduction date. They are excluded from the verified totals below.</p>}
    {!!report?.rows?.length && <div className={styles.tableWrap}><table>
      <thead><tr><th scope="col">Fundraiser</th><th scope="col">Introduced {report.fiscalYear?.label}</th><th scope="col">Giving {report.fiscalYear?.label}</th><th scope="col">Introduced lifetime</th><th scope="col">Giving since introduction</th></tr></thead>
      <tbody>{report.rows.map(row => <tr key={row.userId}>
        <td><strong>{row.name}</strong>{!row.active && <span> (inactive)</span>}</td>
        <td>{row.fiscalYearCount}</td><td>{money(row.fiscalYearGiving)}</td><td>{row.lifetimeCount}</td><td>{money(row.lifetimeGiving)}</td>
      </tr>)}</tbody>
    </table></div>}
    <details><summary>What counts?</summary>
      <p className={styles.hint}>One constituent, one originator. FY introductions use the date on the custom field, not the date someone entered it. FY giving includes gifts this fiscal year from all of the fundraiser's originated relationships, on or after their introduction dates. Lifetime giving starts at each introduction date.</p>
      <p className={styles.hint}>Direct received revenue only, without soft credits or unpaid pledges. These are attribution metrics, not a claim that the fundraiser caused every gift. They are separate from solicitor credit and do not change the standings score. Counts are constituents, not households, and may include organizations.</p>
    </details>
    {!!report?.issues?.length && <details><summary>Admin: records to check ({report.issues.length})</summary>
      {report.issues.map(issue => <p key={issue.constituentId}><a href={buildBlackbaudConstituentProfileUrl(issue.constituentId)} target="_blank" rel="noreferrer">Constituent {issue.constituentId}</a>: {issue.reason}. Correct in NXT, then refresh these metrics.</p>)}
    </details>}
  </section>;
}
