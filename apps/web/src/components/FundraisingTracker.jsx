"use client";

import { useId, useState } from "react";
import { presentFundraisingTracker, TRACKER_BASIS } from "@/utils/fundraisingTracker";
import styles from "./fundraisingTracker.module.css";

const currency = (amount) => amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: amount % 1 ? 2 : 0 });

function CampaignDonors({ result }) {
  const headingId = useId();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("committedCents");
  const [page, setPage] = useState(0);
  const query = search.trim().toLocaleLowerCase("en-US");
  const matches = (result.donors || []).filter((row) => `${row.name} ${row.constituentId || ""}`.toLocaleLowerCase("en-US").includes(query))
    .sort((a, b) => (sort === "name" ? 0 : b[sort] - a[sort]) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  const pageCount = Math.max(1, Math.ceil(matches.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = matches.slice(currentPage * 25, (currentPage + 1) * 25);
  return <section className={styles.donors} aria-labelledby={headingId}>
    <h4 id={headingId}>Campaign donors</h4>
    {result.donors === null ? <p>{result.pending ? "Donor details are loading with the campaign refresh. Saved results stay visible until the refresh is complete." :
      "Donor details have not been loaded yet. A report manager can use Refresh data to load them with the campaign totals."}</p> : <>
      <p>One entry per donor, using the same funds and giving dates as the totals above. Pledged is the original pledge amount, not the unpaid balance. Received includes outright gifts and pledge payments; committed includes outright gifts and pledges. These columns overlap and should not be added together.</p>
      {result.donorNamesIncomplete && <p className={styles.donorNotice} role="status">Some donor names could not be loaded. Their giving is included under Donor unavailable. A report manager can refresh again to retry.</p>}
      {!result.donors.length ? <p>No countable gifts were found for these funds and giving dates.</p> : <>
        <div className={styles.donorTools}>
          <label>Find a donor<input type="search" placeholder="Name or constituent ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
          <label>Sort donors<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}>
            <option value="committedCents">Committed: highest first</option><option value="receivedCents">Received: highest first</option>
            <option value="pledgedCents">Pledged: highest first</option><option value="name">Donor name</option>
          </select></label>
        </div>
        <div className={styles.donorTableWrap} role="region" aria-label="Campaign donor amounts" tabIndex={0}>
          <table className={styles.donorTable}>
            <caption>Giving by donor. Totals include all entries, even when searching or viewing another page.</caption>
            <thead><tr><th scope="col">Donor</th><th scope="col">Pledged</th><th scope="col">Received</th><th scope="col">Committed</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.key}>
              <th scope="row">{row.name}{row.constituentId && <small>ID {row.constituentId}</small>}
                {row.kind !== "constituent" && <small>Combined giving</small>}</th>
              <td>{currency(row.pledgedCents / 100)}</td><td>{currency(row.receivedCents / 100)}</td><td>{currency(row.committedCents / 100)}</td>
            </tr>)}{!rows.length && <tr><td colSpan={4}>No donors match your search.</td></tr>}</tbody>
            <tfoot><tr><th scope="row">All campaign giving</th><td>{currency(result.pledgedCents / 100)}</td><td>{currency(result.receivedCents / 100)}</td><td>{currency(result.committedCents / 100)}</td></tr></tfoot>
          </table>
        </div>
        <div className={styles.donorPagination}>
          <span role="status">{matches.length ? `${currentPage * 25 + 1}-${Math.min((currentPage + 1) * 25, matches.length)} of ${matches.length} entries` : "0 matching entries"}</span>
          {pageCount > 1 && <div><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous donors</button>
            <button type="button" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Next donors</button></div>}
        </div>
      </>}
    </>}
  </section>;
}

export function FundraisingTrackerCard({ panel, saved }) {
  const result = presentFundraisingTracker(panel, saved);
  const known = result.committedCents !== null && result.receivedCents !== null;
  const modes = panel.display === "both" ? ["committed", "received"] : [panel.display];
  return <div className={styles.tracker}>
    <div className={styles.targets}><div><span>Campaign goal</span><strong>{currency(panel.goal)}</strong></div>
      {panel.milestone !== null && <div><span>Milestone</span><strong>{currency(panel.milestone)} <small>{Math.round(panel.milestone / panel.goal * 100)}%</small></strong></div>}</div>
    <div className={`${styles.totals} ${modes.length === 1 ? styles.single : ""}`}>
      {modes.map((mode) => {
        const amount = known ? result[`${mode}Cents`] / 100 : null;
        const percent = known ? Math.round(amount / panel.goal * 100) : null;
        return <section key={mode} className={mode === "received" ? styles.received : styles.committed} aria-label={`Revenue ${mode}`}>
          <h4>Revenue {mode}</h4><strong className={styles.amount}>{known ? currency(amount) : "Not refreshed"}</strong>
          {known && <><div className={styles.progressWrap}><progress aria-label={`${mode} toward campaign goal`} value={Math.min(panel.goal, Math.max(0, amount))} max={panel.goal} />
            {panel.milestone !== null && <span className={styles.milestoneMark} style={{ left: `${panel.milestone / panel.goal * 100}%` }} aria-hidden="true" />}</div>
            <p>{percent}% of goal <span>{amount >= panel.goal ? "Goal reached" : `${currency(panel.goal - amount)} to go`}</span></p>
            {panel.milestone !== null && <p className={styles.milestoneStatus}>{amount >= panel.milestone ? "Milestone reached" : `${currency(panel.milestone - amount)} to milestone`}</p>}</>}
        </section>;
      })}
    </div>
    {panel.funds.length > 0 && <CampaignDonors key={result.fingerprint} result={result} />}
    <div className={styles.footer}><p>{panel.period === "all_time" ? "All-time giving (no date filter)" : `Giving dates: ${panel.startDate} to ${panel.endDate}`}</p>
      <p>{panel.funds.length ? panel.funds.map((fund) => fund.name).join(" · ") : "Choose the campaign fund or funds in Configure."}</p>
      {known && <p>Updated {new Date(result.refreshedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>}
      {result.pending && <p role="status">Refresh in progress. Complete saved totals stay visible.</p>}
      {result.error && <p role="status">{known ? "Showing the last successful totals. A refresh is needed." : "Totals are not available yet. Please refresh the report."}</p>}
      <details><summary>What counts toward this campaign?</summary><p>{TRACKER_BASIS} Only gift splits assigned to the selected funds count. Soft-credit recipients do not multiply campaign revenue.</p></details>
    </div>
  </div>;
}

export function FundraisingTrackerEditor({ panel, onChange, disabled }) {
  const [directory, setDirectory] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState(panel.title === "The A-Train Campaign" ? "A-Train" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/reports/fundraising-funds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset }) });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.funds)) throw new Error("NXT funds could not be loaded. Try again later.");
      setDirectory((previous) => [...new Map([...previous, ...result.funds].map((f) => [f.id, f])).values()]);
      setOffset(result.nextOffset); setLoaded(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const matches = directory.filter((fund) => `${fund.name} ${fund.lookupId} ${fund.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <fieldset className={styles.editor} disabled={disabled}>
    <legend>Campaign setup</legend>
    <p>The panel title is your campaign name. This does not create or change an NXT campaign record.</p>
    <div className={styles.fields}>
      <label>Goal (USD)<input type="number" min="0.01" step="0.01" value={panel.goal ?? ""} onChange={(e) => onChange({ goal: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      <label>Milestone (USD, optional)<input type="number" min="0.01" step="0.01" value={panel.milestone ?? ""} onChange={(e) => onChange({ milestone: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      <label>Show revenue<select value={panel.display} onChange={(e) => onChange({ display: e.target.value })}><option value="both">Committed and received, side by side</option><option value="committed">Committed only</option><option value="received">Received only</option></select></label>
      <label>Giving period<select value={panel.period} onChange={(e) => onChange({ period: e.target.value, startDate: "", endDate: "" })}><option value="all_time">All time (no start date)</option><option value="date_range">Date range</option></select></label>
      {panel.period === "date_range" && <><label>Start date<input type="date" value={panel.startDate} onChange={(e) => onChange({ startDate: e.target.value })} /></label><label>End date<input type="date" value={panel.endDate} onChange={(e) => onChange({ endDate: e.target.value })} /></label></>}
    </div>
    <div className={styles.selected}><strong>Selected funds ({panel.funds.length}/25)</strong>
      {!panel.funds.length && <p>No fund selected. This draft will not show a zero total or fetch all gifts.</p>}
      {panel.funds.map((fund) => <div key={fund.id}>{fund.name}<button type="button" aria-label={`Remove ${fund.name}`} onClick={() => onChange({ funds: panel.funds.filter((f) => f.id !== fund.id) })}>Remove</button></div>)}
    </div>
    <label className={styles.search}>Find a fund<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fund name or ID" /></label>
    <button type="button" disabled={disabled || busy || offset === null || offset > 20000} onClick={load}>{busy ? "Loading funds..." : loaded ? "Load more NXT funds" : "Load NXT funds"}</button>
    <p>{loaded ? `${directory.length} funds loaded${offset === null ? ". All funds loaded." : ". Load more if the fund is not listed."}` : "Funds load only when you ask. Selecting funds does not change NXT."}</p>
    {error && <p role="alert">{error}</p>}
    {loaded && !matches.length && <p>No matching fund in the loaded results.</p>}
    <div className={styles.funds}>{matches.map((fund) => {
      const selected = panel.funds.some((f) => f.id === fund.id);
      return <label key={fund.id}><input type="checkbox" checked={selected} disabled={!selected && panel.funds.length >= 25} onChange={(e) => onChange({ funds: e.target.checked ? [...panel.funds, { id: fund.id, name: fund.name }] : panel.funds.filter((f) => f.id !== fund.id) })} /><span>{fund.name}<small>{fund.lookupId || fund.id}{fund.inactive ? " · Inactive" : ""}</small></span></label>;
    })}</div>
    <details><summary>Revenue definitions and refresh behavior</summary><p>{TRACKER_BASIS}</p><p>Opening a dashboard uses saved totals only. Explicit and scheduled refreshes are bounded and preserve last-good totals; partial results are never shown as complete. Fund or date changes require a new refresh.</p></details>
  </fieldset>;
}
