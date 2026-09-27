"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import useUser from "@/utils/useUser";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { formatCalendarDate } from "@/utils/prospectActivity";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import {
  currentPipelineFiscalYear, PIPELINE_OUTCOMES, PIPELINE_REPORT_KEY,
  pipelineFiscalWindow, pipelineTotals, selectPipelineRows,
} from "@/utils/pipelineReport";
import styles from "./pipeline.module.css";

const PAGE_SIZE = 25;
const money = (value) => value === null ? "Not recorded" : new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
}).format(value);
const date = (value) => formatCalendarDate(value, { month: "short", day: "numeric", year: "numeric" }) || "Not recorded";

async function fetchPipeline({ signal }) {
  const response = await fetch("/api/reports/opportunity-pipeline", { signal, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Could not load the opportunity pipeline.");
  if (!Array.isArray(payload?.opportunities)) throw new Error("The report response was incomplete. Please reload saved data.");
  return payload;
}

export function PipelineReport({ report, reload, refreshing = false }) {
  const [year, setYear] = useState(String(report.currentYear || currentPipelineFiscalYear()));
  const [view, setView] = useState("active");
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const [stage, setStage] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("expected");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const allRows = report.opportunities;
  const rows = selectPipelineRows(allRows, { year, view, search, owner, stage, status, sort });
  const totals = pipelineTotals(rows);
  const funded = pipelineTotals(rows.filter((row) => row.status === "Funded"), "fundedAmount");
  const fiscalWindow = pipelineFiscalWindow(year);
  const yearOptions = [...new Set([...(report.years || []), ...(fiscalWindow ? [fiscalWindow.year] : [])])].sort((a, b) => b - a);
  const fundraisers = [...new Map(allRows.flatMap((row) => row.fundraisers).map((user) => [user.id, user])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const stages = [...new Set(selectPipelineRows(allRows, { year, view }).map((row) => row.stage))].sort();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visibleRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const counts = Object.fromEntries(["active", "archive", "undated"].map((key) => [key, selectPipelineRows(allRows, { year, view: key }).length]));
  const breakdown = [...new Set(rows.map((row) => view === "archive" ? row.status : row.stage))].sort()
    .map((key) => ({ label: key, ...pipelineTotals(rows.filter((row) => (view === "archive" ? row.status : row.stage) === key)) }));
  const resetPage = () => { setPage(1); setExpanded(null); };
  const changeYear = (value) => { setYear(value); setStage("all"); resetPage(); };
  const changeView = (value) => { setView(value); setStage("all"); setStatus("all"); resetPage(); };

  return <>
    <SharedReportHeader activeReportKey={PIPELINE_REPORT_KEY} eyebrow="Organization-wide report"
      title={report.title || "Opportunity Pipeline"}
      description="Every saved app opportunity, across workspaces. Explore the expected fiscal year without waiting for a new NXT pull."
      action={<button className={styles.button} onClick={reload} disabled={refreshing}><RefreshCw size={16} aria-hidden="true" />{refreshing ? "Reloading..." : "Reload saved data"}</button>} />

    <section className={styles.period} aria-label="Fiscal year selection">
      <div><p className={styles.eyebrow}>Expected pipeline</p><h2>{view === "undated" ? "Needs a fiscal year or identity review" : fiscalWindow ? `${fiscalWindow.label} opportunity pipeline` : "All fiscal years"}</h2>
        <p>{view === "undated" ? "Across all years. These records are not included in fiscal-year totals." : fiscalWindow ? `${date(fiscalWindow.startsOn)} through ${date(fiscalWindow.endsOn)}` : "All dated opportunities in the saved app records."}</p>
      </div>
      <div className={styles.yearControls}>
        <button className={styles.button} aria-label="Previous fiscal year" disabled={!fiscalWindow || fiscalWindow.year <= 1900 || view === "undated"} onClick={() => changeYear(String(Number(year) - 1))}><ChevronLeft size={18} /></button>
        <label>Fiscal year<select value={year} disabled={view === "undated"} onChange={(event) => changeYear(event.target.value)}>
          <option value="all">All fiscal years</option>{yearOptions.map((value) => <option key={value} value={value}>{pipelineFiscalWindow(value)?.label} ({value})</option>)}
        </select></label>
        <button className={styles.button} aria-label="Next fiscal year" disabled={!fiscalWindow || fiscalWindow.year >= 9998 || view === "undated"} onClick={() => changeYear(String(Number(year) + 1))}><ChevronRight size={18} /></button>
        <button className={styles.button} onClick={() => { changeYear(String(report.currentYear)); changeView("active"); }}>Current FY</button>
      </div>
    </section>

    <div className={styles.tabs} role="group" aria-label="Pipeline view">
      <button className={view === "active" ? styles.selected : ""} aria-pressed={view === "active"} onClick={() => changeView("active")}>Active <span>{counts.active}</span></button>
      <button className={view === "archive" ? styles.selected : ""} aria-pressed={view === "archive"} onClick={() => changeView("archive")}>Closed &amp; archived <span>{counts.archive}</span></button>
      <button className={view === "undated" ? styles.selected : ""} aria-pressed={view === "undated"} onClick={() => changeView("undated")}>Needs FY / review <span>{counts.undated}</span></button>
    </div>

    <section className={styles.filters} aria-label="Filter pipeline">
      <label className={styles.search}>Search opportunities<input type="search" value={search} placeholder="Constituent, opportunity, or fundraiser" onChange={(event) => { setSearch(event.target.value); resetPage(); }} /></label>
      <label>Fundraiser<select value={owner} onChange={(event) => { setOwner(event.target.value); resetPage(); }}><option value="all">All fundraisers</option>{fundraisers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <label>Stage<select value={stage} onChange={(event) => { setStage(event.target.value); resetPage(); }}><option value="all">All stages</option>{stages.map((value) => <option key={value}>{value}</option>)}</select></label>
      {view !== "active" && <label>Outcome<select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}><option value="all">All outcomes</option>{(view === "undated" ? ["Active", ...PIPELINE_OUTCOMES] : PIPELINE_OUTCOMES).map((value) => <option key={value}>{value}</option>)}</select></label>}
      <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }}><option value="expected">Expected date</option><option value="amount">Largest ask</option><option value="name">Constituent name</option></select></label>
    </section>

    <section className={styles.metrics} aria-label="Filtered opportunity totals">
      <div><span>Opportunities</span><strong>{totals.count}</strong><small>{search || owner !== "all" || stage !== "all" || status !== "all" ? "Matching your filters" : "Shared opportunities count once"}</small></div>
      <div><span>{totals.unknownCount ? "Known ask amount" : "Ask amount"}</span><strong>{money(totals.knownAmount)}</strong><small>{totals.unknownCount ? `${totals.unknownCount} without a verified amount; total is incomplete` : "Unweighted asks, not revenue received"}</small></div>
      {view === "archive" ? <div><span>Recorded funded amount</span><strong>{money(funded.knownAmount)}</strong><small>{funded.unknownCount ? `${funded.unknownCount} funded amounts not recorded` : "Funded opportunities only, not a gift ledger"}</small></div> : <div><span>Constituents</span><strong>{new Set(rows.filter((row) => row.constituentId).map((row) => row.constituentId)).size}</strong><small>Distinct known NXT constituent IDs</small></div>}
    </section>

    {breakdown.length > 0 && <details className={styles.breakdown}><summary>{view === "archive" ? "Totals by outcome" : "Totals by stage"}</summary><div>{breakdown.map((item) => <p key={item.label}><strong>{item.label}</strong><span>{item.count} opportunities</span><span>{money(item.knownAmount)}{item.unknownCount ? ` + ${item.unknownCount} unknown` : ""}</span></p>)}</div></details>}

    <section className={styles.results} aria-label="Opportunity results">
      <div className={styles.resultHeading}><h2>{view === "active" ? "Open opportunities" : view === "archive" ? "Closed and archived opportunities" : "Undated and held opportunities"}</h2><span>{rows.length ? `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, rows.length)} of ${rows.length}` : "0 results"}</span></div>
      {visibleRows.length === 0 ? <div className={styles.empty}><h3>No opportunities in this view</h3><p>Try another fiscal year, clear a filter, or check Needs FY / review for opportunities without an expected date.</p></div> : <div className={styles.tableScroll}><table>
        <caption className={styles.srOnly}>Saved opportunities with constituent, fundraiser, stage, ask amount, and expected date</caption>
        <thead><tr><th scope="col">Constituent / opportunity</th><th scope="col">Fundraiser</th><th scope="col">{view === "active" ? "Stage" : "Outcome / stage"}</th><th scope="col">Ask amount</th><th scope="col">Expected date</th><th scope="col"><span className={styles.srOnly}>Details</span></th></tr></thead>
        <tbody>{visibleRows.map((row) => <PipelineRow key={row.id} row={row} view={view} expanded={expanded === row.id} toggle={() => setExpanded(expanded === row.id ? null : row.id)} />)}</tbody>
      </table></div>}
      {pages > 1 && <div className={styles.pagination}><button className={styles.button} disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1); setExpanded(null); }}>Previous page</button><span aria-live="polite">Page {currentPage} of {pages}</span><button className={styles.button} disabled={currentPage >= pages} onClick={() => { setPage(currentPage + 1); setExpanded(null); }}>Next page</button></div>}
    </section>

    <p className={styles.source}>Saved app opportunities only; opportunities that exist only in NXT are not included. Fiscal year follows each opportunity&apos;s expected date, not the prospect&apos;s legacy FY label.</p>
    <details className={styles.method}><summary>Report definitions and saved-data details</summary><p>All open stages are included. Closed and archived records stay separate; if their expected date is missing, their recorded close date is used and labeled. No date is inferred for an open opportunity.</p><p>Explicit shared or NXT opportunity identities count once, using the most recently saved version. {report.copiesCollapsed} extra workspace copies were combined. Fundraiser filters include joint owners; adding separate fundraiser subtotals can therefore double count joint asks.</p><p>Past fiscal years show the current saved status of those opportunities, not a point-in-time historical snapshot. Reopening this report does not synchronize NXT. Reload saved data reads the app database only.</p><p>Loaded {report.loadedAt ? new Date(report.loadedAt).toLocaleString("en-US") : "just now"}. Individual NXT check dates are in row details.</p></details>
  </>;
}

function PipelineRow({ row, view, expanded, toggle }) {
  const nxtHref = row.constituentId ? buildBlackbaudConstituentProfileUrl(row.constituentId) : "";
  return <>
    <tr>
      <td><strong>{row.constituentName}</strong><span className={styles.secondary}>{row.title}</span></td>
      <td>{row.fundraisers.map((user) => user.name).join(", ") || "Unassigned"}</td>
      <td>{view !== "active" && <span className={styles.outcome}>{row.status}</span>}<span>{row.stage}</span></td>
      <td className={styles.amount}>{money(row.amount)}</td>
      <td>{date(row.expectedDate)}{row.yearBasis === "closed" && <span className={styles.secondary}>FY from close date: {date(row.closedDate)}</span>}</td>
      <td><button className={styles.button} aria-expanded={expanded} aria-controls={`pipeline-detail-${row.id}`} aria-label={`${expanded ? "Hide" : "Show"} details for ${row.title}`} onClick={toggle}>{expanded ? "Hide" : "Details"}</button></td>
    </tr>
    {expanded && <tr><td colSpan={6} className={styles.detail}><div id={`pipeline-detail-${row.id}`}>
      {row.identityConflict && <p role="status">Linked copies have conflicting constituent or opportunity IDs. This record is held outside fiscal-year totals until those links are reviewed.</p>}
      <dl><div><dt>NXT opportunity ID</dt><dd>{row.nxtOpportunityId || "Not linked"}</dd></div><div><dt>Last saved check or edit</dt><dd>{date(row.savedAt)}</dd></div><div><dt>NXT last checked</dt><dd>{date(row.nxtCheckedAt)}</dd></div>
        {row.status !== "Active" && <div><dt>Closed date</dt><dd>{date(row.closedDate)}</dd></div>}{row.status === "Funded" && <div><dt>Recorded funded amount</dt><dd>{money(row.fundedAmount)}</dd></div>}
        <div><dt>Workspace records</dt><dd>{row.copyCount} {row.copyCount > 1 ? "copies counted once" : "record"}</dd></div></dl>
      {nxtHref && <a href={nxtHref} target="_blank" rel="noreferrer">Open constituent in NXT</a>}
    </div></td></tr>}
  </>;
}

export default function OpportunityPipelinePage() {
  const { data: user, loading: loadingUser } = useUser();
  useEffect(() => { if (!loadingUser && !user) window.location.href = "/account/signin"; }, [loadingUser, user]);
  const query = useQuery({ queryKey: [PIPELINE_REPORT_KEY, user?.id, user?.email], queryFn: fetchPipeline, enabled: Boolean(user), staleTime: 60000, refetchOnWindowFocus: false, retry: false });
  return <main className={styles.page}>
    {loadingUser || !user || query.isPending ? <p role="status">Loading saved pipeline...</p> : query.isError ? <><SharedReportHeader activeReportKey={PIPELINE_REPORT_KEY} title="Opportunity Pipeline" /><p role="alert">{query.error.message}</p><button className={styles.button} onClick={() => query.refetch()}>Try again</button></> : <PipelineReport key={`${user.id}:${user.email}`} report={query.data} reload={() => query.refetch()} refreshing={query.isFetching} />}
  </main>;
}
