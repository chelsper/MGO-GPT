"use client";

import { useState } from "react";
import { presentFundraisingTracker, TRACKER_BASIS } from "@/utils/fundraisingTracker";
import styles from "./fundraisingTracker.module.css";

const currency = (amount) => amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: amount % 1 ? 2 : 0 });

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
