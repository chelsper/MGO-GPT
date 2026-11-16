"use client";
import { useEffect, useRef, useState } from "react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { LIFETIME_QUERY_ID, LIFETIME_QUERY_NAME, LIFETIME_REPORT_KEY, filterLifetimeRows, lifetimeCoverage, lifetimeCsv, lifetimeDate, lifetimeFiscalYear, lifetimeMoney, lifetimeTypeLabel } from "@/utils/lifetimeSocieties";
import styles from "./lifetime.module.css";

const API = "/api/reports/lifetime-giving-societies";
const defaultFilters = { search: "", society: "", constituentType: "", status: "", year: "" };
async function request(options) {
  const response = await fetch(API, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || "The report could not be loaded."), { status: response.status });
  return body;
}
export default function LifetimeSocietiesPage() {
  const [data, setData] = useState(null), [inspection, setInspection] = useState(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(""), [filters, setFilters] = useState(defaultFilters), [page, setPage] = useState(0);
  const active = useRef(null), locked = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    request({ signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => active.current?.abort();
  }, []);
  async function command(operation) {
    if (locked.current) return;
    locked.current = true; setBusy(operation); setError("");
    const controller = new AbortController(); active.current = controller;
    try {
      const result = await request(operation === "reload" ? { signal: controller.signal } : {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...(operation === "refresh" ? { revision: data.revision } : {}) }),
      });
      if (controller.signal.aborted) return;
      if (operation === "fields") setInspection(result);
      else { setData(result); setInspection(null); setPage(0); }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e.message);
        if ([401, 403].includes(e.status)) { setData(null); setInspection(null); }
      }
    } finally { locked.current = false; if (!controller.signal.aborted) setBusy(""); }
  }
  const snapshot = data?.snapshot, source = inspection || snapshot?.source;
  const rows = filterLifetimeRows(snapshot?.rows || [], filters);
  const coverage = lifetimeCoverage(rows);
  const unclassified = lifetimeCoverage(filterLifetimeRows(snapshot?.rows || [], { society: filters.society })).unclassified;
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  const years = [...new Set((snapshot?.rows || []).map(row => lifetimeFiscalYear(row.date)).filter(Boolean))].sort().reverse();
  function filter(key, value) { setFilters(previous => ({ ...previous, [key]: value })); setPage(0); }
  function download() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", lifetimeCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "lifetime-society-history-review.csv";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className={styles.page}><div className={styles.content}>
    <SharedReportHeader compact title={data?.title || "Lifetime Giving Societies"} activeReportKey={LIFETIME_REPORT_KEY} reportSection="dashboards"
      description="Trace the gift history behind 1934 Club and Frances Bartlett Kinne Society milestones."
      dashboardSwitchDisabled={!!busy} />
    {error && <div className={styles.error} role="alert">{error} <button disabled={!!busy} onClick={() => command("reload")}>Reload saved report</button></div>}
    {!data ? <p role="status">{error ? "Report unavailable." : "Loading saved history..."}</p> : <>
      <section className={styles.intro}>
        <div><p className={styles.eyebrow}>STEWARDSHIP / HISTORY REVIEW</p><h2>When did the relationship reach a milestone?</h2>
          <p>Calculated qualification dates are provisional, not official induction dates. Complex histories stay in review rather than receiving a guessed date.</p>
          <small>{snapshot ? `Last updated ${new Date(snapshot.refreshedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} Eastern` : "No gift history imported yet."}</small></div>
        {data.canManage && <div className={styles.actions}><button disabled={!!busy} onClick={() => command("fields")}>{busy === "fields" ? "Checking source..." : "Check query outputs"}</button>
          <button className={styles.primary} disabled={!!busy || !source?.ready} onClick={() => command("refresh")}>{busy === "refresh" ? "Importing history..." : "Refresh gift history"}</button></div>}
      </section>
      {busy && <p role="status">{busy === "refresh" ? "Reading the saved Gift query. Previous results stay visible; nothing is changed in NXT." : "Reading saved information..."}</p>}
      {data.staleRules && <p className={styles.notice}>Society rules changed. Refresh the history before using calculated dates; the previous calculations are not shown as current.</p>}
      <section className={styles.rules} aria-label="Society views">
        <button aria-pressed={!filters.society} onClick={() => filter("society", "")}><span>Both societies</span><strong>All milestones</strong><small>View each society's threshold separately.</small></button>
        {data.societies.map(society => <button key={society.key} aria-pressed={filters.society === society.key} onClick={() => filter("society", society.key)}>
          <span>{society.name}</span><strong>{lifetimeMoney(society.minimumAmount * 100)}</strong>
          <small>{[...society.countSources].sort((a, b) => a.localeCompare(b)).map(value => ({ committed: "Committed giving", recognition_credit: "recognition credit", received_revenue: "received revenue", planned_gift: "planned gifts" })[value] || value).join(" + ")}</small>
        </button>)}
      </section>
      {data.canManage && <details className={styles.panel} open={!snapshot || !!inspection}>
        <summary>Source readiness <span>{LIFETIME_QUERY_NAME} / {LIFETIME_QUERY_ID}</span></summary>
        <p>Outputs are matched by their NXT field paths, not by a similar-looking column name. No manual mapping is needed.</p>
        {source ? <>
          <p className={styles.notice}>{source.ready ? "Required identity and history fields are available. Importing will identify records that need further reconciliation." : "A source update is needed before gift history can be imported. Existing saved results are kept."}</p>
          {source.identityMode === "lookup" && <p>Using the existing <strong>Constituent ID</strong> to group this report. You do not need to add a constituent system record ID; this does not create NXT profile links or update records.</p>}
          <ul className={styles.checks}>{source.checks.map(check => <li key={check.key}><strong>{check.label}</strong>
            <span>{check.column || (check.required ? "Add to NXT query output" : "Optional")}</span>{!check.column && check.required && <small>{check.help}</small>}</li>)}</ul>
        </> : <p>Select <strong>Check query outputs</strong> to validate the existing source before the first import.</p>}
        <p>Choose viewers in <a href="/report-configurations">Report configurations</a>. Only Admins and Advancement Services can refresh the source.</p>
      </details>}
      {!snapshot && <p>Not imported</p>}
      {source && <details className={styles.notes}><summary>How to interpret this report</summary><ul>{source.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        {snapshot && <p>{snapshot.rawRows.toLocaleString()} source rows; {snapshot.repeatedRows.toLocaleString()} repeated rows removed. Fund and installment rows do not multiply a gift.</p>}
        <p>This first release calculates only uncomplicated direct-gift histories. Pledges, linked payments, write-offs, planned gifts and soft-credit histories remain visible with review notes, not assumed dates or totals.</p>
      </details>}
      {snapshot && <section className={styles.panel} aria-labelledby="history-title">
        <div className={styles.tableHeader}><div><h2 id="history-title">{filters.society ? data.societies.find(s => s.key === filters.society)?.name : "Milestone history"}</h2><p>{filters.society ? "One threshold check per constituent in this society view." : "Two threshold checks per constituent in the combined view."} A missing date does not mean the donor is ineligible.</p></div>
          <button disabled={!rows.length || !!busy} onClick={download}>Export filtered history (CSV)</button></div>
        <div className={styles.filters}>
          <label>Find a constituent<input type="search" placeholder="Name or constituent ID" value={filters.search} onChange={e => filter("search", e.target.value)} /></label>
          <label>Constituent type<select value={filters.constituentType} onChange={e => filter("constituentType", e.target.value)}>
            <option value="">Individuals &amp; organizations</option><option value="individual">Individuals only</option><option value="organization">Organizations only</option>
            {(!!unclassified || filters.constituentType === "unknown") && <option value="unknown">Type not supplied / needs review</option>}
          </select></label>
          <label>Review status<select value={filters.status} onChange={e => filter("status", e.target.value)}><option value="">All history</option><option value="provisional">Provisional date available</option><option value="review">Needs review</option></select></label>
          <label>Calculated fiscal year<select value={filters.year} onChange={e => filter("year", e.target.value)}><option value="">All years / undated</option>{years.map(year => <option key={year}>{year}</option>)}</select></label>
        </div>
        {!!unclassified && <p className={styles.typeNote}>{unclassified} constituent{unclassified === 1 ? " has" : "s have"} no confirmed type. They remain in the combined view, not the individuals-only or organizations-only views.
          {data.canManage && <> Add <strong>Constituent &gt; Key Indicator</strong> to query 31118's output, then refresh gift history. Conflicting values need source review.</>}
          {" "}<button onClick={() => { setFilters({ ...defaultFilters, society: filters.society, constituentType: "unknown" }); setPage(0); }}>View unclassified</button></p>}
        <section className={styles.metrics} aria-label="Filtered history coverage">
          <article><strong>{coverage.constituents.toLocaleString()}</strong><span>Constituents in this view</span></article>
          <article><strong>{coverage.provisional.toLocaleString()}</strong><span>Provisional milestone dates</span></article>
          <article><strong>{coverage.review.toLocaleString()}</strong><span>Milestones needing review</span></article>
        </section>
        <div className={styles.scope}><p role="status">Showing {rows.length} threshold check{rows.length === 1 ? "" : "s"} for {coverage.constituents} constituent{coverage.constituents === 1 ? "" : "s"}. The CSV includes this entire filtered view.</p>
          {Object.values(filters).some(Boolean) && <button onClick={() => { setFilters(defaultFilters); setPage(0); }}>Clear filters</button>}</div>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Lifetime society milestone history"><table>
          <thead><tr><th scope="col">Constituent</th><th scope="col">Society</th><th scope="col">Calculated qualification date</th><th scope="col">Imported qualifying history</th><th scope="col">Review notes</th></tr></thead>
          <tbody>{rows.slice(current * 50, (current + 1) * 50).map(row => <tr key={`${row.id}:${row.societyKey}`}>
            <th scope="row">{row.name}<small>{lifetimeTypeLabel(row.constituentType)}</small><small>{[row.systemId && `System ID ${row.systemId}`, row.lookupId && `Constituent ID ${row.lookupId}`].filter(Boolean).join(" / ")}</small></th><td>{row.societyName}</td>
            <td>{lifetimeDate(row.date)}{row.date && <small>{lifetimeFiscalYear(row.date)} / Provisional</small>}</td><td>{lifetimeMoney(row.totalCents)}</td>
            <td>{row.reasons.length ? row.reasons.join(" ") : "Reconcile historical adjustments and recognition settings before using this date."}
              {row.constituentTypeNote && <small>{row.constituentTypeNote}</small>}
              {!!row.crossingGiftIds.length && <details><summary>Milestone gift reference</summary><small>Gift system IDs: {row.crossingGiftIds.join(", ")}</small></details>}</td>
          </tr>)}</tbody></table></div>
        {!rows.length && <p>No history matches these filters.</p>}
        <div className={styles.pagination}><p>{rows.length} threshold check{rows.length === 1 ? "" : "s"} / Page {current + 1} of {Math.max(1, Math.ceil(rows.length / 50))}</p>
          <div className={styles.actions}><button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><button disabled={(current + 1) * 50 >= rows.length} onClick={() => setPage(current + 1)}>Next</button></div></div>
      </section>}
    </>}
  </div></main>;
}
