"use client";
import { useEffect, useRef, useState } from "react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { LIFETIME_QUERY_ID, LIFETIME_QUERY_NAME, LIFETIME_REPORT_KEY, filterLifetimeRows, lifetimeActiveGroupIds, lifetimeCoverage, lifetimeCsv, lifetimeDate, lifetimeFiscalYear, lifetimeVisibleRows, lifetimeMoney, lifetimeTypeLabel, lifetimeMatchesQueue } from "@/utils/lifetimeSocieties";
import LifetimeGiftReview from "./LifetimeGiftReview";
import styles from "./lifetime.module.css";

const API = "/api/reports/lifetime-giving-societies";
const defaultFilters = { search: "", society: "", constituentType: "", status: "attention", year: "" };
const queues = [["attention", "Needs attention"], ["provisional", "Ready to confirm"], ["review", "Needs investigation"], ["confirmed", "Confirmed"], ["", "All history"]];
async function request(options) {
  const response = await fetch(API, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || "The report could not be loaded."), { status: response.status });
  return body;
}
export default function LifetimeSocietiesPage() {
  const [data, setData] = useState(null), [inspection, setInspection] = useState(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(""), [filters, setFilters] = useState(defaultFilters), [page, setPage] = useState(0);
  const [households, setHouseholds] = useState(true), [groupSearch, setGroupSearch] = useState(""), [groupPage, setGroupPage] = useState(0), [confirmGroup, setConfirmGroup] = useState(null);
  const [archiveView, setArchiveView] = useState("active"), [pendingDecision, setPendingDecision] = useState(null);
  const [savedSearch, setSavedSearch] = useState(""), [savedPage, setSavedPage] = useState(0);
  const [detailRow, setDetailRow] = useState(null), [notice, setNotice] = useState("");
  const [pauseRequested, setPauseRequested] = useState(false);
  const active = useRef(null), locked = useRef(false);
  const pauseLinked = useRef(false);
  const checkingLinked = ["check-linked", "restart-linked"].includes(busy);
  const decisionPanel = useRef(null), decisionOrigin = useRef(null), detailOrigin = useRef(null);
  useEffect(() => {
    if (pendingDecision) { decisionPanel.current?.focus(); decisionPanel.current?.scrollIntoView?.({ block: "center" }); }
    else if (decisionOrigin.current?.isConnected) decisionOrigin.current.focus();
  }, [pendingDecision]);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    request({ signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => active.current?.abort();
  }, []);
  function accessDenied(message) {
    active.current?.abort(); active.current = null; locked.current = false;
    setBusy(""); setData(null); setInspection(null); setPendingDecision(null); setDetailRow(null); setError(message);
  }
  async function command(operation, values = {}) {
    if (locked.current || (operation !== "reload" && !data?.canManage)) return;
    locked.current = true; setBusy(operation); setError(""); setNotice("");
    const controller = new AbortController(); active.current = controller;
    try {
      if (["check-linked", "restart-linked"].includes(operation)) {
        pauseLinked.current = false; setPauseRequested(false);
        setPendingDecision(null); setConfirmGroup(null);
        let revision = data.revision;
        for (let turn = 0; turn < 60; turn++) {
          const result = await request({ method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: turn === 0 ? operation : "check-linked", revision, ...values }) });
          if (controller.signal.aborted) return;
          setData(result); revision = result.revision;
          const nextRow = [...(result.snapshot?.rows || []), ...(result.snapshot?.sharedGroups || []).flatMap(group => group.rows)].find(row => row.milestoneKey === values.milestoneKey);
          setDetailRow(current => current?.milestoneKey === values.milestoneKey ? nextRow || null : current);
          if (!result.canManage || !nextRow || nextRow.archived || result.linkedCheck?.status !== "running" || pauseLinked.current) break;
        }
        return;
      }
      const result = await request(operation === "reload" ? { signal: controller.signal } : {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...(operation !== "fields" ? { revision: data.revision } : {}), ...values }),
      });
      if (controller.signal.aborted) return;
      if (operation === "fields") setInspection(result);
      else { setData(result); setInspection(null); setPage(0); setConfirmGroup(null); setPendingDecision(null); setDetailRow(null);
        setNotice(operation === "confirm-date" ? "Entry date confirmed and saved. Find it under Confirmed; no repeat approval is needed." : operation === "archive-record" ? "Record archived from active recognition. Gift credit is retained. Find it under Archived records." : ""); }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e.message);
        if ([401, 403].includes(e.status)) accessDenied(e.message);
      }
    } finally {
      if (active.current === controller) { locked.current = false; if (!controller.signal.aborted) setBusy(""); }
    }
  }
  const snapshot = data?.snapshot, source = inspection || snapshot?.source;
  const confirmedIds = lifetimeActiveGroupIds(snapshot);
  const usingHouseholds = households && archiveView !== "archived" && confirmedIds.size > 0;
  const importedCoverage = lifetimeCoverage(lifetimeVisibleRows(snapshot, true, "all"));
  const automaticCount = (snapshot?.sharedGroups || []).filter(group => group.automatic && confirmedIds.has(group.id)).length;
  const householdReviews = [...new Map((snapshot?.rows || []).filter(row => row.householdNote).map(row => [row.id, row])).values()];
  const viewRows = lifetimeVisibleRows(snapshot, households, archiveView);
  const queueRows = filterLifetimeRows(viewRows, { ...filters, status: "" });
  const rows = filterLifetimeRows(viewRows, filters);
  const coverage = lifetimeCoverage(rows);
  const unclassified = lifetimeCoverage(filterLifetimeRows(viewRows, { society: filters.society })).unclassified;
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  const years = [...new Set(viewRows.filter(row => row.date).sort((a, b) => b.date.localeCompare(a.date)).map(row => lifetimeFiscalYear(row.date)))];
  const groupMatches = (snapshot?.sharedGroups || []).filter(group => group.members.some(member =>
    `${member.name} ${member.lookupId} ${member.systemId || ""}`.toLowerCase().includes(groupSearch.trim().toLowerCase())));
  const currentGroupPage = Math.min(groupPage, Math.max(0, Math.ceil(groupMatches.length / 10) - 1));
  const confirmedMembers = new Set((snapshot?.sharedGroups || []).filter(group => confirmedIds.has(group.id)).flatMap(group => group.members.map(member => member.id)));
  const savedEntries = [...(data?.savedDecisions?.milestones || []).map(entry => ({ ...entry, kind: "date" })),
    ...(data?.savedDecisions?.archives || []).map(entry => ({ ...entry, kind: "archive" }))]
    .filter(entry => `${entry.name} ${entry.societyName || ""} ${entry.lookupId || ""}`.toLowerCase().includes(savedSearch.trim().toLowerCase()));
  const savedCurrent = Math.min(savedPage, Math.max(0, Math.ceil(savedEntries.length / 20) - 1));
  function decide(operation, row) { if (locked.current || !data?.canManage) return; decisionOrigin.current = document.activeElement; setPendingDecision({ operation, row }); }
  function confirmDecision() {
    if (locked.current || !pendingDecision) return;
    const { operation, row } = pendingDecision;
    command(operation, operation.endsWith("date") ? { milestoneKey: row.milestoneKey || row.key } : { recordKey: row.recordKey || row.key });
  }
  function changeView(update) { if (locked.current) return; update(); setPage(0); setDetailRow(null); }
  function filter(key, value) { changeView(() => setFilters(previous => ({ ...previous, [key]: value }))); }
  function openDetails(row) { if (locked.current) return; detailOrigin.current = document.activeElement; setDetailRow(row); }
  function closeDetails() { if (locked.current) return; setDetailRow(null); if (detailOrigin.current?.isConnected) detailOrigin.current.focus(); }
  function download() {
    if (locked.current) return;
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
          <p>Confirm a supported entry date once to keep it fixed across refreshes. Unconfirmed calculations are provisional; complex histories stay in review rather than receiving a guessed date.</p>
          <small>Opening this report uses saved results and never starts or resumes an NXT check automatically. Archive records you do not actively recognize without removing anyone's gift credit.</small>
          <small>{snapshot ? `Gift query imported ${new Date(snapshot.refreshedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} Eastern. Linked checks save evidence separately.` : data.previousImport ? "Saved history is available; refresh once to apply the updated calculations." : "No gift history imported yet."}</small></div>
        {data.canManage && <div className={styles.actions}><button disabled={!!busy} onClick={() => command("fields")}>{busy === "fields" ? "Checking source..." : "Check query outputs"}</button>
          <button className={styles.primary} disabled={!!busy || source?.ready === false} onClick={() => command("refresh")}>{busy === "refresh" ? "Importing history..." : "Refresh gift history"}</button></div>}
      </section>
      {busy && <p role="status">{checkingLinked ? "Reading connected records in NXT and saving evidence in this app. NXT records and confirmed entry dates are unchanged." : busy === "refresh" ? "Reading the saved Gift query. Confirmed entry dates and archive choices are preserved. Nothing is changed in NXT." : busy === "fields" ? "Reading query definitions from NXT; no gift query is executed." : busy === "reload" ? "Reading saved information..." : "Saving this report-only choice. No NXT records are changed."}</p>}
      {notice && <p className={styles.importSummary} aria-live="polite">{notice}</p>}
      {data.staleRules && <p className={styles.notice}>Society rules changed. Refresh the history before using calculated dates; the previous calculations are not shown as current.</p>}
      {snapshot && <div className={styles.importSummary}><strong>History imported: {snapshot.peopleCount.toLocaleString()} constituents</strong>
        <p>{importedCoverage.confirmed} entry dates confirmed. {importedCoverage.provisional} provisional milestone dates. {importedCoverage.review} threshold checks need more history or reconciliation; this is not an import failure.</p>
        <small>{source?.fullRecognition ? "Full-gift recognition applies to each credited recipient." : "Recognition calculations follow the inspected query settings; unresolved allocations remain in review."} Households count each gift once. Companies stay separate; only gifts explicitly credited to a household member enter its history. Amounts marked as supported subtotals are not complete lifetime totals.</small></div>}
      <section className={styles.rules} aria-label="Society views">
        <button disabled={!!busy} aria-pressed={!filters.society} onClick={() => filter("society", "")}><span>Both societies</span><strong>All milestones</strong><small>View each society's threshold separately.</small></button>
        {data.societies.map(society => <button key={society.key} disabled={!!busy} aria-pressed={filters.society === society.key} onClick={() => filter("society", society.key)}>
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
          <p>{source.householdsReady ? "Spouse identifiers, marital status and individual/organization fields are available. Reciprocal married pairs will be grouped automatically on refresh." : "Automatic households need Spouse > Constituent ID and Constituent > Marital Status, together with Constituent ID and Key Indicator. You can still import individual giving history without these fields."}</p>
          <ul className={styles.checks}>{source.checks.map(check => <li key={check.key}><strong>{check.label}</strong>
            <span>{check.column || (check.required ? "Add to NXT query output" : "Optional")}</span>{!check.column && check.required && <small>{check.help}</small>}</li>)}</ul>
        </> : <p><strong>Refresh gift history</strong> validates the source automatically. Use <strong>Check query outputs</strong> if you want to inspect the field mapping first.</p>}
        <p>Choose viewers in <a href="/report-configurations">Report configurations</a>. Only Admins and Advancement Services can refresh, confirm dates or archive records.</p>
      </details>}
      {!snapshot && <p>{data.staleRules ? "Refresh needed for updated calculations" : "Not imported"}</p>}
      {source && <details className={styles.notes}><summary>How to interpret this report</summary><ul>{source.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        {snapshot && <p>{snapshot.rawRows.toLocaleString()} source rows; {snapshot.repeatedRows.toLocaleString()} repeated rows removed. Fund and installment rows do not multiply a gift.</p>}
        <p>Supported subtotals include uncomplicated gifts and verified linked-history recognition, net of verified dated reductions. They are not complete lifetime totals while other evidence is unresolved. Any unconfirmed crossing followed by giving below the threshold needs staff review, even if giving later recovers. Staff-confirmed dates stay locked.</p>
      </details>}
      {snapshot && <details className={styles.panel}>
        <summary>Households <span>{automaticCount} automatic / {confirmedIds.size - automaticCount} manually confirmed</span></summary>
        <p>Individuals with reciprocal NXT spouse IDs and either Married or Alum married to alum status on both records are grouped automatically. Companies, foundations and other organizations stay separate. A household includes its members' own gifts and gifts explicitly credited to either member, counting each gift once.</p>
        <small>Sharing a gift alone does not prove a marriage. Other individual-only suggestions require confirmation. Spouses missing from the query or with conflicting links stay separate. No NXT records are merged or changed.</small>
        {!!snapshot.groupsToReconfirm && <p className={styles.notice}>{snapshot.groupsToReconfirm} previous group confirmations were not carried forward because their rules, source or evidence changed. Company/person combinations are no longer available.</p>}
        {!!householdReviews.length && <details><summary>{householdReviews.length} records need spouse-link review</summary><ul>{householdReviews.map(row => <li key={row.id}>{row.name}: {row.householdNote}</li>)}</ul></details>}
        {!!snapshot.omittedSharedGroups && <p className={styles.notice}>{snapshot.omittedSharedGroups} additional large or excess shared-gift sets are not suggested automatically. Their constituents remain separate and visible.</p>}
        <label>Find a household or suggestion<input type="search" value={groupSearch} onChange={e => { setGroupSearch(e.target.value); setGroupPage(0); }} placeholder="Member name or constituent ID" /></label>
        {!groupMatches.length && <p>No households or suggestions match this view. Separate records remain unchanged.</p>}
        {groupMatches.slice(currentGroupPage * 10, (currentGroupPage + 1) * 10).map(group => {
          const confirmed = confirmedIds.has(group.id), overlap = !confirmed && group.members.some(member => confirmedMembers.has(member.id));
          return <article className={styles.group} key={group.id}>
            <h3>{group.members.map(member => member.name).join(" & ")}</h3>
            <p>{group.sharedGiftCount} shared gift{group.sharedGiftCount === 1 ? "" : "s"} / {group.automatic ? confirmed ? "NXT-linked married spouses / automatically grouped" : "NXT-linked spouses / kept separate by staff" : confirmed ? "Manually confirmed household" : "Suggested only; histories still separate"}</p>
            <ul>{group.members.map(member => <li key={member.id}>{member.name} / {lifetimeTypeLabel(member.constituentType)} / Constituent ID {member.lookupId || member.systemId}</li>)}</ul>
            {data.canManage && <>
              {confirmed ? <button disabled={!!busy} onClick={() => command("remove-group", { groupId: group.id })}>{group.automatic ? "Keep spouses separate" : "Undo grouping"}</button> :
                <button disabled={!!busy || overlap} onClick={() => { if (!locked.current) setConfirmGroup(group.id); }}>Review and confirm group</button>}
              {overlap && <small>A member is already in another confirmed group. Undo that grouping first.</small>}
              {!confirmed && confirmGroup === group.id && <div className={styles.groupConfirm}>
                <p>Confirm these {group.members.length} individuals as one household? This combines all gifts given by or explicitly credited to these individuals, counting each gift system ID once, not just the shared gifts listed above. No organization's unrelated giving is included. Unresolved pledge and adjustment histories still need reconciliation.</p>
                <div className={styles.actions}><button className={styles.primary} disabled={!!busy} onClick={() => command("confirm-group", { groupId: group.id })}>Confirm household</button>
                  <button disabled={!!busy} onClick={() => { if (!locked.current) setConfirmGroup(null); }}>Keep separate</button></div>
              </div>}
            </>}
          </article>;
        })}
        <div className={styles.pagination}><p>{groupMatches.length} households / suggestions. Page {currentGroupPage + 1} of {Math.max(1, Math.ceil(groupMatches.length / 10))}</p>
          <div className={styles.actions}><button disabled={currentGroupPage === 0} onClick={() => setGroupPage(currentGroupPage - 1)}>Previous groups</button>
            <button disabled={(currentGroupPage + 1) * 10 >= groupMatches.length} onClick={() => setGroupPage(currentGroupPage + 1)}>Next groups</button></div></div>
      </details>}
      {data.canManage && pendingDecision && <section ref={decisionPanel} tabIndex={-1} className={styles.groupConfirm} role="region" aria-label="Confirm report change">
        <h2>{pendingDecision.operation === "confirm-date" ? "Keep this entry date?" : pendingDecision.operation === "reopen-date" ? "Reopen date review?" : pendingDecision.operation === "archive-record" ? "Archive from this report?" : "Restore to the active report?"}</h2>
        <p><strong>{pendingDecision.row.name}</strong>{pendingDecision.operation.endsWith("date") && <> / {pendingDecision.row.societyName} / {lifetimeDate(pendingDecision.row.date)}</>}</p>
        <p>{pendingDecision.operation === "confirm-date" ? "Confirm only after reconciling the giving history and recognition settings. This date stays fixed across refreshes for this exact recipient or household and society. It does not establish an official induction date in NXT." :
          pendingDecision.operation === "reopen-date" ? "This removes the date lock, not gift history. If a refresh skipped this confirmed date's calculation, refresh gift history again before confirming a replacement. Other society dates stay fixed." :
          pendingDecision.operation === "archive-record" ? "Hide this individual or organization from the active separate-record view in both societies. All gifts and soft credits remain available to other recipients and households. A household stays visible while another member is active. You can restore this record later." :
          "Remove this report-only archive choice. If the record is absent from the latest query or is shown in a household, it may not appear as a separate row. No NXT records are changed."}</p>
        <div className={styles.actions}><button className={styles.primary} disabled={!!busy} onClick={confirmDecision}>{pendingDecision.operation === "confirm-date" ? "Confirm and keep date" : pendingDecision.operation === "reopen-date" ? "Reopen this date" : pendingDecision.operation === "archive-record" ? "Confirm archive" : "Confirm restore"}</button>
          <button disabled={!!busy} onClick={() => { if (!locked.current) setPendingDecision(null); }}>Cancel</button></div>
      </section>}
      {!!(data.savedDecisions?.archives.length || data.savedDecisions?.milestones.length) && <details className={styles.panel}>
        <summary>Saved dates &amp; archived records <span>{data.savedDecisions.milestones.length} confirmed dates / {data.savedDecisions.archives.length} archived records</span></summary>
        <p>Saved choices survive refreshes, including when a record leaves the query. Changed identity details are not matched by guesswork. Household dates are never transferred to individual members.</p>
        <label>Find saved decisions<input type="search" value={savedSearch} onChange={e => { setSavedSearch(e.target.value); setSavedPage(0); }} /></label>
        {savedEntries.slice(savedCurrent * 20, (savedCurrent + 1) * 20).map(entry => <article className={styles.group} key={`${entry.kind}:${entry.key}`}>
          <h3>{entry.name}</h3><p>{entry.kind === "date" ? `${entry.societyName}: ${lifetimeDate(entry.date)} / Staff-confirmed` : "Archived from active recognition / Gift credit retained"}</p>
          {!entry.matched && <small>No exact match in the current report. This saved decision is retained separately, not applied to another record.</small>}
          {data.canManage && <button disabled={!!busy} onClick={() => decide(entry.kind === "date" ? "reopen-date" : "restore-record", entry)}>{entry.kind === "date" ? "Reopen date review" : "Restore record"}</button>}
        </article>)}
        <div className={styles.pagination}><p>{savedEntries.length} saved decisions / Page {savedCurrent + 1} of {Math.max(1, Math.ceil(savedEntries.length / 20))}</p><div className={styles.actions}>
          <button disabled={!savedCurrent} onClick={() => setSavedPage(savedCurrent - 1)}>Previous decisions</button><button disabled={(savedCurrent + 1) * 20 >= savedEntries.length} onClick={() => setSavedPage(savedCurrent + 1)}>Next decisions</button></div></div>
      </details>}
      {snapshot && <section className={styles.panel} aria-labelledby="history-title">
        <div className={styles.tableHeader}><div><h2 id="history-title">Review workspace</h2><p>{filters.society ? data.societies.find(s => s.key === filters.society)?.name : "Both societies"}. {filters.society ? "One threshold check per recipient or household." : "Two threshold checks per recipient or household."} A missing date does not mean the donor is ineligible.</p></div>
          <button disabled={!rows.length || !!busy} onClick={download}>Export filtered history (CSV)</button></div>
        <div className={styles.reviewTabs} aria-label="Review queues">{queues.map(([value, label]) => <button key={value} disabled={!!busy} aria-pressed={filters.status === value} onClick={() => filter("status", value)}>{label} <span>{queueRows.filter(row => lifetimeMatchesQueue(row, value)).length}</span></button>)}</div>
        <p className={styles.queueHelp}>{filters.status === "provisional" ? "Supported provisional dates ready for staff review and explicit confirmation. Nothing is confirmed automatically." : filters.status === "review" ? "Open gift details for the reason and next action. Saved history needing reconciliation is not an import failure." : filters.status === "confirmed" ? "Saved entry dates stay fixed. A new history warning does not remove their confirmation." : filters.status === "attention" ? "Your working list: unconfirmed milestones and confirmed dates with new calculation warnings. Confirmed records without issues are out of the way, not deleted." : "All milestones in your selected society, recipient and visibility filters."}</p>
        <div className={styles.filters}>
          <label>Find a constituent<input disabled={!!busy} type="search" placeholder="Name or constituent ID" value={filters.search} onChange={e => filter("search", e.target.value)} /></label>
          <label>Constituent type<select disabled={!!busy} value={filters.constituentType} onChange={e => filter("constituentType", e.target.value)}>
            <option value="">Individuals &amp; organizations</option><option value="individual">Individuals only</option><option value="organization">Organizations only</option>
            {viewRows.some(row => row.constituentType === "mixed") && <option value="mixed">Mixed giving groups</option>}
            {(!!unclassified || filters.constituentType === "unknown") && <option value="unknown">Type not supplied / needs review</option>}
          </select></label>
          <label>Entry fiscal year<select disabled={!!busy} value={filters.year} onChange={e => filter("year", e.target.value)}><option value="">All years / undated</option>{years.map(year => <option key={year}>{year}</option>)}</select></label>
          <label>Report visibility<select disabled={!!busy} value={archiveView} onChange={e => changeView(() => { setArchiveView(e.target.value); setFilters(previous => ({ ...previous, status: e.target.value === "active" ? "attention" : "" })); })}><option value="active">Active records</option><option value="archived">Archived records</option><option value="all">Active &amp; archived</option></select></label>
        </div>
        <small>Archiving changes visibility only. Gifts from archived organizations still count for individuals who received credit. Archived view lists separate records for restoration.</small>
        {!!confirmedIds.size && <label className={styles.groupToggle}><input type="checkbox" disabled={!!busy || archiveView === "archived"} checked={households && archiveView !== "archived"} onChange={e => changeView(() => { setHouseholds(e.target.checked); setFilters(defaultFilters); })} />Show households instead of separate individuals</label>}
        {!!unclassified && <p className={styles.typeNote}>{unclassified} constituent{unclassified === 1 ? " has" : "s have"} no confirmed type. They remain in the combined view, not the individuals-only or organizations-only views.
          {data.canManage && <> Add <strong>Constituent &gt; Key Indicator</strong> to query 31118's output, then refresh gift history. Conflicting values need source review.</>}
          {" "}<button disabled={!!busy} onClick={() => changeView(() => setFilters({ ...defaultFilters, society: filters.society, constituentType: "unknown" }))}>View unclassified</button></p>}
        <section className={styles.metrics} aria-label="Filtered history coverage">
          <article><strong>{coverage.constituents.toLocaleString()}</strong><span>{usingHouseholds ? "Recipients / groups in this view" : "Constituents in this view"}</span></article>
          <article><strong>{coverage.provisional.toLocaleString()}</strong><span>Provisional milestone dates</span></article>
          <article><strong>{coverage.confirmed.toLocaleString()}</strong><span>Staff-confirmed entry dates</span></article>
          <article><strong>{coverage.review.toLocaleString()}</strong><span>Milestones needing review</span></article>
        </section>
        <div className={styles.scope}><p role="status">Showing {rows.length} threshold check{rows.length === 1 ? "" : "s"} for {coverage.constituents} {usingHouseholds ? "recipients / groups" : `constituent${coverage.constituents === 1 ? "" : "s"}`}. The CSV includes this entire filtered view.</p>
          {(Object.entries(filters).some(([key, value]) => value !== defaultFilters[key]) || archiveView !== "active") && <button disabled={!!busy} onClick={() => changeView(() => { setFilters(defaultFilters); setArchiveView("active"); })}>Clear filters</button>}</div>
        {detailRow && <LifetimeGiftReview key={detailRow.milestoneKey} row={detailRow} revision={data.revision} canManage={data.canManage} busy={!!busy}
          checkingLinked={checkingLinked} linkedCheck={checkingLinked ? data.linkedCheck : undefined} pauseRequested={pauseRequested}
          onPauseLinked={() => { if (checkingLinked && data.canManage) { pauseLinked.current = true; setPauseRequested(true); } }}
          onCheckLinked={(giftId, restart = false) => command(restart ? "restart-linked" : "check-linked", { giftId, milestoneKey: detailRow.milestoneKey })}
          onClose={closeDetails} onReload={() => command("reload")} onConfirm={() => decide("confirm-date", detailRow)}
          onAccessDenied={accessDenied} />}
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Lifetime society milestone history"><table>
          <thead><tr><th scope="col">Constituent</th><th scope="col">Society</th><th scope="col">Entry date</th><th scope="col">Imported qualifying history</th><th scope="col">Review notes</th></tr></thead>
          <tbody>{rows.slice(current * 50, (current + 1) * 50).map(row => <tr key={`${row.id}:${row.societyKey}`}>
            <th scope="row">{row.name}<small>{row.groupBasis === "spouse" ? "NXT-linked married household / " : row.members ? "Confirmed household / " : ""}{lifetimeTypeLabel(row.constituentType)}</small><small>{[row.systemId && `System ID ${row.systemId}`, row.lookupId && `Constituent ID ${row.lookupId}`].filter(Boolean).join(" / ")}</small>
              {row.archived && <small>Archived / Gift credit retained</small>}
              {row.members ? <details><summary>Group members</summary>{row.members.map(member => <div key={member.id}><small>{member.name} / Constituent ID {member.lookupId || member.systemId}{member.archived ? " / Archived from separate view; credit retained" : ""}</small>
                {data.canManage && <button disabled={!!busy} onClick={() => decide(member.archived ? "restore-record" : "archive-record", member)}>{member.archived ? "Restore record" : "Archive record"}</button>}</div>)}</details> : data.canManage &&
                <button disabled={!!busy} onClick={() => decide(row.archived ? "restore-record" : "archive-record", row)}>{row.archived ? "Restore record" : "Archive record"}</button>}</th><td>{row.societyName}</td>
            <td>{lifetimeDate(row.date)}{row.date && <small>{lifetimeFiscalYear(row.date)} / {row.status === "confirmed" ? "Staff-confirmed" : "Provisional"}</small>}
              {data.canManage && !row.archived && row.status === "provisional" && <button disabled={!!busy} onClick={() => decide("confirm-date", row)}>Confirm entry date</button>}
              {data.canManage && row.status === "confirmed" && <button disabled={!!busy} onClick={() => decide("reopen-date", row)}>Reopen date review</button>}
            </td><td>{lifetimeMoney(row.totalCents)}
              {row.totalCents === null && row.supportedCents != null && <small>Supported gifts subtotal: {lifetimeMoney(row.supportedCents)}. Excludes unresolved history; not a complete lifetime total.</small>}</td>
            <td><button disabled={!!busy} onClick={() => openDetails(row)}>Review gift details</button>{row.confirmationNote && <strong>{row.confirmationNote}</strong>}{row.reasons.length ? row.reasons.join(" ") : row.status !== "confirmed" ? "Reconcile historical adjustments and recognition settings before using this date." : ""}
              {row.constituentTypeNote && <small>{row.constituentTypeNote}</small>}
              {row.householdNote && <small>{row.householdNote}</small>}
              {!!row.crossingGiftIds.length && <details><summary>Milestone gift reference</summary><small>Gift system IDs: {row.crossingGiftIds.join(", ")}</small></details>}</td>
          </tr>)}</tbody></table></div>
        {!rows.length && <p>No history matches these filters.</p>}
        <div className={styles.pagination}><p>{rows.length} threshold check{rows.length === 1 ? "" : "s"} / Page {current + 1} of {Math.max(1, Math.ceil(rows.length / 50))}</p>
          <div className={styles.actions}><button disabled={!!busy || current === 0} onClick={() => { if (!locked.current) setPage(current - 1); }}>Previous</button><button disabled={!!busy || (current + 1) * 50 >= rows.length} onClick={() => { if (!locked.current) setPage(current + 1); }}>Next</button></div></div>
      </section>}
    </>}
  </div></main>;
}
