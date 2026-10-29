"use client";
import { useEffect, useRef, useState } from "react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { BOARD_DEFAULT_SOURCES, BOARD_INITIAL_SOURCE, BOARD_SERVICE_COLUMNS, BOARD_TRUSTEES_KEY, boardCashStatus, boardMoney, boardParticipation, boardParticipationChange, boardPercent, boardPeriodLabel, boardPointChange, boardSnapshotIsCurrent, boardYearLabel, boardYearStage } from "@/utils/boardTrustees";
import styles from "./trustees.module.css";

const API = "/api/reports/board-of-trustees";
async function request(options) {
  const response = await fetch(API, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || "The dashboard could not be loaded."), { status: response.status });
  return body;
}

function EligibilityDetails({ eligibility }) {
  const [search, setSearch] = useState(""), [page, setPage] = useState(0);
  const rows = [...eligibility.needsReview, ...eligibility.excluded].filter(row => `${row.name} ${row.id}`.toLowerCase().includes(search.toLowerCase().trim()));
  const pages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.min(page, pages - 1);
  return <details className={styles.details} open={eligibility.reviewCount > 0 ? true : undefined}>
    <summary>Eligibility details: {eligibility.includedCount} included, {eligibility.excludedCount} excluded, {eligibility.reviewCount} need review</summary>
    <p>Only the Trustee code establishes service. A blank Date To qualifies. A Date To within the selected FY qualifies after at least six calendar months of service in that FY, including the end date. Service ending before the FY is excluded; service continuing past the FY remains eligible. Trustee-Former dates are not used as service dates.</p>
    <label>Find an eligibility decision<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Name or constituent ID" /></label>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Trustee eligibility decisions"><table><thead><tr><th scope="col">Trustee</th><th scope="col">Decision</th><th scope="col">Trustee service dates</th><th scope="col">Reason</th></tr></thead><tbody>
      {rows.slice(current * 50, (current + 1) * 50).map(row => <tr key={row.id}><th scope="row">{row.name}<small>Constituent {row.id}</small></th><td>{row.status === "review" ? "Needs review" : "Excluded"}</td>
        <td>{row.serviceRecords.filter(record => record.code.toLowerCase() === "trustee").map((record, index) => <small key={index}>{record.start || "Start not recorded"} to {record.end || "Open"}</small>)}</td><td>{row.reason}</td></tr>)}
    </tbody></table></div>
    <p>Correct uncertain service dates in NXT, then refresh this fiscal year. This dashboard never changes constituency codes or dates.</p>
    <div className={styles.pagination}><p>{rows.length} decisions{pages > 1 ? ` / Page ${current + 1} of ${pages}` : ""}</p>{pages > 1 && <div className={styles.actions}><button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous decisions</button><button disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>Next decisions</button></div>}</div>
  </details>;
}

export default function BoardTrusteesPage() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [year, setYear] = useState(2027), [search, setSearch] = useState(""), [sort, setSort] = useState("name"), [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(BOARD_INITIAL_SOURCE), [inspection, setInspection] = useState(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(null), locked = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    request({ signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => active.current?.abort();
  }, []);

  const saved = data?.years.find(entry => entry.source.fiscalYear === year);
  const source = saved?.source || BOARD_DEFAULT_SOURCES.find(entry => entry.fiscalYear === year);
  const snapshot = boardSnapshotIsCurrent(saved?.snapshot) ? saved.snapshot : null;
  const years = [...new Set([...BOARD_DEFAULT_SOURCES.map(entry => entry.fiscalYear), ...(data?.years || []).map(entry => entry.source.fiscalYear)])].sort((a, b) => b - a);
  const participation = boardParticipation(snapshot);
  const change = boardParticipationChange(data?.years || [], year);
  const rows = (snapshot?.trustees || []).filter(row => `${row.name} ${row.id}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) :
      (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity) || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(rows.length / 50)), currentPage = Math.min(page, pages - 1);

  async function command(operation, input) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    const controller = new AbortController(); active.current = controller;
    try {
      if (operation === "reload") { setData(await request({ signal: controller.signal })); return; }
      const result = await request({ method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, input, ...(operation === "refresh" ? { revision: data.revision } : {}) }) });
      if (operation === "fields") {
        setInspection(result);
        setDraft(previous => ({ fiscalYear: result.fiscalYear, queryId: result.queryId, queryName: result.queryName,
          columns: Object.fromEntries(["name", "cash", "commitments", ...Object.keys(BOARD_SERVICE_COLUMNS)].map(key => [key,
            result.fields.includes(previous.columns[key]) ? previous.columns[key] : result.suggested[key] || ""])) }));
      } else {
        setData(result); setYear(input.fiscalYear); setEditing(false); setInspection(null); setSearch(""); setPage(0);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e.message);
        if ([401, 403].includes(e.status)) { setData(null); setInspection(null); setDraft(BOARD_INITIAL_SOURCE); setEditing(false); }
      }
    } finally { locked.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  function openSetup() { setDraft(source); setInspection(null); setEditing(true); }
  function changeTarget(key, value) {
    setDraft(previous => ({ ...previous, [key]: value, queryName: "", columns: { name: "", cash: "", commitments: "", code: "", start: "", end: "" } }));
    setInspection(null);
  }

  return <main className={styles.page}><div className={styles.content}>
    <SharedReportHeader compact title={data?.title || "Board of Trustees"} activeReportKey={BOARD_TRUSTEES_KEY} reportSection="dashboards"
      description="Trustee names, giving and cash participation, with fiscal-year service eligibility."
      dashboardSwitchDisabled={busy} action={data?.canManage && <button disabled={busy || editing} onClick={openSetup}>Manage fiscal years</button>} />
    {error && <div role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => command("reload")}>Reload saved results</button></div>}
    {!data ? <p role="status">{error ? "Dashboard unavailable." : "Loading saved trustee giving..."}</p> : <>
      <section className={styles.toolbar} aria-label="Fiscal year controls">
        <label>Fiscal year<select disabled={busy || editing} value={year} onChange={e => { setYear(Number(e.target.value)); setSearch(""); setPage(0); }}>
          {years.map(value => <option key={value} value={value}>{boardYearLabel(value)}</option>)}
        </select></label>
        <div><strong>{boardPeriodLabel(year)}</strong><p>{snapshot ? `${boardYearStage(year, snapshot.refreshedAt)} / Last refreshed ${new Date(snapshot.refreshedAt).toLocaleString()}` : "Not refreshed yet. No giving figures have been assumed."}</p></div>
        {data.canManage && <button className={styles.primary} disabled={busy || editing} onClick={() => command("refresh", source)}>{busy ? "Working..." : `Refresh ${boardYearLabel(year)}`}</button>}
      </section>
      {busy && <p role="status">Working with the shared reporting account. Saved results stay visible. No NXT gifts or trustee records are changed.</p>}
      {editing && data.canManage && <section className={styles.setup} aria-labelledby="setup-heading">
        <h2 id="setup-heading">Connect a fiscal year</h2><p>Use a separate Constituent query for each year, including current and former trustees with the original Trustee service dates. The app filters eligibility. Giving summaries must use that year's July 1 through June 30 dates.</p>
        <form onSubmit={e => { e.preventDefault(); command("refresh", draft); }}><fieldset disabled={busy}>
          <legend>Fiscal year and query</legend><div className={styles.formGrid}>
            <label>Fiscal year ending<input type="number" min="2000" max="2100" required value={draft.fiscalYear || ""} onChange={e => changeTarget("fiscalYear", Number(e.target.value))} /></label>
            <label>NXT query system record ID<input required inputMode="numeric" pattern="[1-9][0-9]{0,9}" value={draft.queryId} onChange={e => changeTarget("queryId", e.target.value)} /></label>
          </div><button type="button" onClick={() => command("fields", { fiscalYear: draft.fiscalYear, queryId: draft.queryId })}>Load query fields</button>
          {inspection && <><p><strong>{inspection.queryName}</strong> ({inspection.queryId})</p>
            {inspection.warnings.map(warning => <p key={warning} className={styles.notice}>{warning}</p>)}
            <div className={styles.formGrid}>{[["name", "Trustee name"], ["cash", "Annual cash giving summary"], ["commitments", "Annual pledges / planned gifts summary"], ...Object.entries(BOARD_SERVICE_COLUMNS)].map(([key, label]) => <label key={key}>{label}
              <select required value={draft.columns[key]} onChange={e => setDraft({ ...draft, columns: { ...draft.columns, [key]: e.target.value } })}>
                <option value="">Choose a field</option>{inspection.fields.map(field => <option key={field} value={field}>{field}</option>)}
              </select></label>)}</div>
          </>}
          <p className={styles.help}>NXT supplies the constituent identity automatically. Repeated rows count once; conflicting rows stop the refresh. Other fiscal years are not changed.</p>
          <div className={styles.actions}><button type="submit" className={styles.primary} disabled={!inspection || Object.values(draft.columns).some(value => !value)}>Save year and refresh</button>
            <button type="button" onClick={() => { setEditing(false); setInspection(null); setDraft(source); }}>Cancel</button></div>
        </fieldset></form><p className={styles.help}>Choose who can view this dashboard in <a href="/report-configurations">Report configurations</a>. Only Admins and Advancement Services can manage sources.</p>
      </section>}
      {saved?.snapshot && !snapshot && <p role="status" className={styles.notice}>Refresh this fiscal year to apply the updated Trustee service-date rule. Previous query-only figures are not shown as eligible totals.</p>}
      <section className={styles.metrics} aria-label={`${boardYearLabel(year)} giving totals`} aria-busy={busy}>
        <article className={styles.primaryMetric}><p>{boardYearLabel(year)} CASH PARTICIPATION</p><strong>{snapshot ? boardPercent(participation.rate) : "Not refreshed"}</strong>
          <span>{snapshot ? `${participation.participants} of ${participation.total} included trustees with positive cash giving` : "Based on this year's eligible trustees"}</span>
          {participation.unknown > 0 && <span>{participation.unknown} cash amounts not reported; percentage withheld</span>}
          {snapshot && participation.total === 0 && <span>No trustees returned; no participation rate</span>}
          {snapshot && <span>{change === null ? `No complete ${boardYearLabel(year - 1)} comparison yet` : `${boardPointChange(change)} vs ${boardYearLabel(year - 1)}`}</span>}
        </article>
        <article><p>{boardYearLabel(year)} CASH GIVING CREDIT</p><strong>{snapshot ? boardMoney(snapshot.cashCents) : "Not refreshed"}</strong><span>As reported by the annual NXT cash summary</span></article>
        <article><p>PLEDGES &amp; PLANNED GIFT CREDIT</p><strong>{snapshot ? boardMoney(snapshot.commitmentCents) : "Not refreshed"}</strong><span>Separate commitments, not added to cash</span></article>
      </section>
      <nav className={styles.sectionLinks} aria-label="Trustee dashboard sections"><a href="#trustee-names">Trustee names</a><a href="#participation-history">Year-over-year participation</a></nav>
      <p className={styles.basis}>Cash participation uses eligible trustees only. Blank Trustee end dates are included; end dates within this FY require six or more months of service in this FY.</p>
      {snapshot?.eligibility.reviewCount > 0 && <p role="status" className={styles.notice}>{snapshot.eligibility.reviewCount} service-date decisions need review below. Giving totals and the participation percentage are withheld until eligibility is resolved; confirmed eligible names remain visible.</p>}
      {snapshot?.eligibility.openAndFormerCount > 0 && <p className={styles.notice}>{snapshot.eligibility.openAndFormerCount} included trustees also have a Trustee-Former code. They remain included because their Trustee end date is blank, as specified.</p>}
      {snapshot?.warnings.length > 0 && <details className={styles.notice}><summary>Check roster criteria: some trustees who served during the year may be missing.</summary>
        {snapshot.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
      {snapshot?.missingAmountCount > 0 && <p className={styles.notice}>{snapshot.missingAmountCount} trustee rows have an unreported amount. The affected total is withheld, not treated as zero.</p>}
      {snapshot ? <>
        <section id="trustee-names" className={styles.roster} aria-labelledby="roster-heading">
          <div className={styles.rosterHeader}><div><h2 id="roster-heading">{boardYearLabel(year)} trustee names &amp; giving</h2><p>{snapshot.trusteeCount} eligible trustees / {source.queryName} / Query {source.queryId}</p></div>
            <label>Find a trustee<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Name or constituent ID" /></label>
            <label>Sort by<select value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="name">Trustee name</option><option value="cashCents">Cash giving: high to low</option><option value="commitmentCents">Commitments: high to low</option></select></label></div>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Trustee giving table"><table><caption>Annual giving credit for eligible trustees in {boardYearLabel(year)}</caption>
            <thead><tr><th scope="col">Trustee</th><th scope="col">Cash giving credit</th><th scope="col">Pledges / planned gift credit</th><th scope="col">Cash participation</th></tr></thead>
            <tbody>{rows.slice(currentPage * 50, (currentPage + 1) * 50).map(row => <tr key={row.id}><th scope="row">{row.name}<small>Constituent {row.id}</small></th><td>{boardMoney(row.cashCents)}</td><td>{boardMoney(row.commitmentCents)}</td><td><span className={boardCashStatus(row) === "Participating" ? styles.participant : styles.nonparticipant}>{boardCashStatus(row)}</span></td></tr>)}</tbody>
          </table></div>
          {!rows.length && <p>{snapshot.trusteeCount ? "No trustees match your search." : "No confirmed eligible trustees. Check the eligibility decisions and NXT criteria below."}</p>}
          <div className={styles.pagination}><p>{rows.length ? `${currentPage * 50 + 1}-${Math.min((currentPage + 1) * 50, rows.length)} of ${rows.length} trustees` : "0 trustees"}</p>
            {pages > 1 && <div className={styles.actions}><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>}</div>
        </section>
        <EligibilityDetails key={`${year}-${snapshot.refreshedAt}`} eligibility={snapshot.eligibility} />
        <details className={styles.details}><summary>Source and counting rules</summary><p>The roster and giving follow {source.queryName} ({source.queryId}). Opening this dashboard or changing the fiscal-year selector does not contact NXT.</p>
          <p>These are giving-credit totals by trustee, not unduplicated campaign revenue. Cash and commitments are kept separate because pledge payments can overlap with pledge commitments.</p>
          <p>Participation is eligible trustees with a positive annual cash summary divided by all distinct eligible trustees in that fiscal year. Zero or negative net cash does not count. Unresolved service dates or a blank cash amount withhold the rate; a blank commitment amount does not. Searching or sorting never changes totals or percentages.</p>
          <p>Soft credit setting: {snapshot.credit.soft}. Matching-gift credit setting: {snapshot.credit.matching}. The same underlying gift may receive credit on more than one trustee's record. These summaries cannot remove cross-trustee gift-credit overlap.</p>
          <p>{snapshot.rawRows} source rows for {snapshot.eligibility.candidateCount} people; {snapshot.duplicateRows} additional code/duplicate rows consolidated. Each eligible person counts once. A zero is a reported zero; a blank is shown as Not reported.</p></details>
      </> : <section id="trustee-names" className={styles.roster}><h2>Start with {boardYearLabel(year)}</h2><p>{source.queryName}, query {source.queryId}, is ready to refresh. {data.canManage ? `Use Refresh ${boardYearLabel(year)} to load its trustee names and giving summaries.` : "Ask an Admin or Advancement Services to refresh this year."}</p></section>}
      <section id="participation-history" className={styles.roster} aria-labelledby="history-heading"><h2 id="history-heading">Year-over-year participation</h2><p>Each year uses its own eligible roster. Year-to-date results are not a same-period comparison with a completed fiscal year. All compared years must be refreshed with the service-date rule.</p>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Fiscal-year comparison table"><table><thead><tr><th scope="col">Fiscal year / saved coverage</th><th scope="col">Cash participants / trustees</th><th scope="col">Participation</th><th scope="col">Change vs prior FY</th></tr></thead><tbody>
          {years.map(value => {
            const entry = data.years.find(item => item.source.fiscalYear === value && boardSnapshotIsCurrent(item.snapshot));
            const stats = boardParticipation(entry?.snapshot);
            return <tr key={value}><th scope="row"><button disabled={busy || editing} onClick={() => { setYear(value); setSearch(""); setPage(0); }}>{boardYearLabel(value)}</button><small>{entry ? boardYearStage(value, entry.snapshot.refreshedAt) : "Not refreshed yet"}</small>{entry && <small>Updated {new Date(entry.snapshot.refreshedAt).toLocaleDateString()}</small>}</th>
              <td>{entry ? `${stats.participants} / ${stats.total}${stats.unknown ? ` (${stats.unknown} unknown)` : ""}` : "Not available"}</td><td>{entry ? boardPercent(stats.rate) : "Not available"}</td><td>{boardPointChange(boardParticipationChange(data.years, value))}</td></tr>;
          })}
        </tbody></table></div></section>
    </>}
  </div></main>;
}
