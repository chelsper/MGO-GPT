import { useEffect, useRef, useState } from "react";
import { revenueMoney } from "@/utils/fyRevenueGoals";
import { BUDGET_PLEDGE_QUERY_ID, BUDGET_PLEDGE_QUERY_NAME, PLEDGE_COLUMNS, installmentDateLabel, suggestPledgeColumns } from "@/utils/fyBudgetPledges";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import styles from "./revenue.module.css";

const API = "/api/reports/fy-revenue-goals/budget-pledges";
const newSource = () => ({ queryId: BUDGET_PLEDGE_QUERY_ID, queryName: BUDGET_PLEDGE_QUERY_NAME, columns: suggestPledgeColumns([]), confirmed: false });
const settings = source => JSON.stringify(source && { queryName: source.queryName, columns: source.columns });
async function request(url = API, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options }), data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Pledge installments could not be loaded."), { status: response.status });
  return data;
}
export default function BudgetPledgePanel({ onDataChange } = {}) {
  const [data, setData] = useState(null), [draft, setDraft] = useState(newSource), [fields, setFields] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [setup, setSetup] = useState(false), [automatic, setAutomatic] = useState(false);
  const [search, setSearch] = useState(""), [appliedSearch, setAppliedSearch] = useState("");
  const active = useRef(null), working = useRef(false);
  useEffect(() => { onDataChange?.(data); }, [data, onDataChange]);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    request(API, { signal: controller.signal }).then(result => { setData(result); setDraft(result.job?.source || result.source || newSource()); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => active.current?.abort();
  }, []);
  async function command(operation, { input, page = 1, term = appliedSearch } = {}) {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    if (operation === "refresh") setAutomatic(true);
    const controller = new AbortController(); active.current = controller;
    try {
      const result = operation === "reload"
        ? await request(`${API}?${new URLSearchParams({ page: String(page), search: term })}`, { signal: controller.signal })
        : await request(API, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation, ...(operation === "fields" ? {} : { revision: data.revision, ...(operation === "refresh" ? { input } : {}) }) }) });
      if (operation === "fields") {
        setFields(result.fields);
        setDraft(previous => ({ ...previous, queryName: result.queryName, confirmed: false,
          columns: Object.fromEntries(Object.keys(PLEDGE_COLUMNS).map(key => [key, result.fields.includes(previous.columns[key]) ? previous.columns[key] : result.suggested[key]])) }));
      } else {
        setData(result);
        if (operation === "reload") { setAppliedSearch(term); if (!data) setDraft(result.job?.source || result.source || newSource()); }
        else { setDraft(result.job?.source || result.source || newSource()); setSetup(false); setSearch(""); setAppliedSearch(""); }
        if (operation !== "reload" && !(result.job && (result.job.status === "running" || (result.job.status === "paused" && result.job.resumeAfter)))) setAutomatic(false);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message); setAutomatic(false);
        if ([401, 403].includes(e.status)) { setData(null); setDraft(newSource()); setFields(null); setSearch(""); setAppliedSearch(""); }
      }
    } finally { working.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    if (!automatic || busy || !data?.job || !data.canManage) return;
    const delay = data.job.resumeAfter ? Math.max(1000, Date.parse(data.job.resumeAfter) - Date.now()) : 400;
    const timer = setTimeout(() => command("continue"), Math.min(delay, 2147483647));
    return () => clearTimeout(timer);
  }, [automatic, busy, data]);
  const snapshot = data?.snapshot, job = data?.job, source = job?.source || data?.source;
  const unsaved = Boolean(source && settings(draft) !== settings(source));
  const period = getStandingsPeriods().fiscalYear;
  const staleYear = snapshot && (snapshot.period.startsOn !== period.startsOn || snapshot.period.endsOn !== period.endsOn);
  return <section className={styles.cashPanel} aria-labelledby="budget-pledge-heading">
    <header className={styles.cashHeader}><div><p className={styles.eyebrow}>EXPECTED THIS FISCAL YEAR</p><h2 id="budget-pledge-heading">Budget-relieving pledge installments</h2>
      <p className={styles.help}>Query 31076 · Unpaid balances, not cash received</p></div>
      {data?.canManage && <div className={styles.cashActions}>
        {source && <button disabled={busy || automatic || unsaved} onClick={() => command("refresh", { input: source })}>{job ? "Start a new pledge refresh" : "Refresh pledge installments"}</button>}
        <button disabled={busy || automatic} aria-expanded={setup} aria-controls="budget-pledge-source" onClick={() => { setSetup(!setup); if (!setup && !fields) command("fields"); }}>{source ? "Manage pledge source" : "Connect pledge query"}</button>
      </div>}</header>
    {error && <div role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => command("reload")}>Reload saved pledge status</button></div>}
    {unsaved && <p role="status" className={styles.goalNotice}>You have unsaved pledge-source changes. Save and refresh to apply them. Displayed totals still use the last completed refresh.</p>}
    {!data ? <p role="status">{error ? "Pledge panel unavailable. Cash totals are unchanged." : "Loading saved pledge installments..."}</p> : <>
      {job && <div className={styles.pledgeProgress} role="status"><strong>{job.completed} of {job.total} pledges checked</strong>
        <p>{job.error || "Checking remaining installment balances in small batches. The previous complete results stay visible."}</p>
        {job.resumeAfter && <p>NXT pause until {new Date(job.resumeAfter).toLocaleString()}.</p>}
        {automatic ? <button onClick={() => setAutomatic(false)}>Pause balance checks</button>
          : job.status !== "blocked" && <button disabled={busy} onClick={() => setAutomatic(true)}>Resume balance checks</button>}
        {job.status === "blocked" && <p>Correct the issue, then use Start a new pledge refresh. No partial total has been published.</p>}
        <p className={styles.help}>You can leave and resume here. Nothing is written to NXT or sent to donors.</p>
      </div>}
      <div className={styles.cashTotal}><strong className={styles.amount}>{revenueMoney(snapshot?.outstandingCents)}</strong>
        <p>{snapshot ? `${snapshot.installmentCount.toLocaleString()} unpaid installments across ${snapshot.pledgeCount.toLocaleString()} pledges · ${snapshot.period.label} · Last refreshed ${new Date(snapshot.refreshedAt).toLocaleString()}`
          : "Connect the query to include verified unpaid installments in Received + expected this FY."}</p></div>
      {staleYear && <p role="status" className={styles.goalNotice}>These saved installments belong to {snapshot.period.label}, not {period.label}. They are not included in the current-year projection. Update the query for this fiscal year and refresh.</p>}
      <p className={styles.help}>The total uses each installment's remaining NXT balance. Paid or written-off balances are not added again. Only due dates from {installmentDateLabel(snapshot?.period.startsOn || period.startsOn)} through {installmentDateLabel(snapshot?.period.endsOn || period.endsOn)} are included.</p>
      {snapshot && <details className={styles.details}><summary>View names, amounts, funds, and due dates</summary>
        <form className={styles.pledgeSearch} onSubmit={e => { e.preventDefault(); command("reload", { term: search }); }}>
          <label>Find a donor, fund, or pledge ID<input type="search" maxLength={150} value={search} onChange={e => setSearch(e.target.value)} /></label>
          <button disabled={busy || automatic}>Search installments</button>
          {appliedSearch && <button disabled={busy || automatic} type="button" onClick={() => { setSearch(""); command("reload", { term: "" }); }}>Clear search</button>}
        </form>
        <p>{data.matchedCount.toLocaleString()} installments{appliedSearch ? " match your search" : " in this total"}. Searching does not change the dashboard totals.</p>
        <div className={styles.cashTableScroll} role="region" aria-label="Installment details" tabIndex={0}><table className={styles.cashTable}>
          <caption>Unpaid budget-relieving installments due in {snapshot.period.label}</caption><thead><tr><th scope="col">Donor</th><th scope="col">Fund description</th><th scope="col">Due date</th><th scope="col">Amount still due</th></tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.key}><th scope="row">{row.name || "Name not returned"}<small>Pledge {row.giftId}</small></th><td>{row.fundName}</td>
            <td>{installmentDateLabel(row.dueDate)}</td><td>{revenueMoney(row.outstandingCents)}{row.scheduledCents !== row.outstandingCents && <small>Scheduled: {revenueMoney(row.scheduledCents)}</small>}</td></tr>)}</tbody>
        </table></div>
        {!data.rows.length && <p>No unpaid installments{appliedSearch ? " match this search" : " were returned for this fiscal year"}.</p>}
        <div className={styles.pledgePagination}><button disabled={busy || automatic || data.page <= 1} onClick={() => command("reload", { page: data.page - 1 })}>Previous installments</button>
          <span>Page {data.page} of {data.pages}</span><button disabled={busy || automatic || data.page >= data.pages} onClick={() => command("reload", { page: data.page + 1 })}>Next installments</button></div>
        <p>{snapshot.checkedPledges} pledges verified against NXT schedules; {snapshot.settledCount} settled installments excluded. {snapshot.duplicateRows} repeated query rows counted once; {snapshot.outsidePeriodRows} rows outside this fiscal year excluded.</p>
      </details>}
      {data.canManage && setup && <div className={styles.setup} id="budget-pledge-source"><h3>Pledge installment source</h3>
        <p>{draft.queryName} (31076)</p><button disabled={busy} onClick={() => command("fields")}>Reload pledge query fields</button>
        <form onSubmit={e => { e.preventDefault(); command("refresh", { input: draft }); }}><fieldset disabled={busy}><legend>Check the suggested fields</legend>
          <div className={styles.formGrid}>{Object.entries(PLEDGE_COLUMNS).map(([key, label]) => <label key={key}>{label}<select required disabled={!fields} value={draft.columns[key] || ""}
            onChange={e => setDraft({ ...draft, confirmed: false, columns: { ...draft.columns, [key]: e.target.value } })}>
            <option value="">Choose a query field</option>{!fields && draft.columns[key] && <option value={draft.columns[key]}>{draft.columns[key]}</option>}
            {(fields || []).map(field => <option key={field} value={field}>{field}</option>)}</select></label>)}</div>
          <p className={styles.help}>Map Installment Amount Due to the scheduled amount. The app reads each pledge's NXT schedule to find the actual unpaid balance and unique installment IDs. It will not guess balances or divide a multi-fund pledge.</p>
          <label className={styles.check}><input type="checkbox" checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} />
            This query identifies budget-relieving pledge installments for {period.label}, with the primary donor and one fund per pledge. These expected amounts are separate from cash already received.</label>
          <button className={styles.primary} disabled={!fields || !draft.confirmed || Object.keys(PLEDGE_COLUMNS).some(key => !draft.columns[key])}>Save and refresh pledge installments</button>
        </fieldset></form></div>}
      {busy && <p role="status">Working with the shared reporting account. Saved cash and campaign totals are unchanged.</p>}
    </>}
  </section>;
}
