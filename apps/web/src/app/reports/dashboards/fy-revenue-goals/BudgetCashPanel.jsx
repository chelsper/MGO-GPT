import { useEffect, useRef, useState } from "react";
import { revenueMoney } from "@/utils/fyRevenueGoals";
import { BUDGET_CASH_GROUPS, BUDGET_CASH_QUERY_ID, BUDGET_CASH_QUERY_NAME, defaultBudgetFundNames, suggestBudgetColumns } from "@/utils/fyBudgetCash";
import styles from "./revenue.module.css";

const API = "/api/reports/fy-revenue-goals/budget-cash";
const newSource = () => ({ queryId: BUDGET_CASH_QUERY_ID, queryName: BUDGET_CASH_QUERY_NAME, mode: "gift", columns: suggestBudgetColumns([]), fundNames: defaultBudgetFundNames(), confirmed: false });
async function request(options) {
  const response = await fetch(API, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Budget cash totals could not be loaded."), { status: response.status });
  return data;
}
export default function BudgetCashPanel() {
  const [data, setData] = useState(null), [draft, setDraft] = useState(newSource), [fields, setFields] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [setup, setSetup] = useState(false);
  const active = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    request({ signal: controller.signal }).then(result => { setData(result); setDraft(result.source || newSource()); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => active.current?.abort();
  }, []);
  async function command(operation, source) {
    if (busy) return;
    setBusy(true); setError("");
    const controller = new AbortController(); active.current = controller;
    try {
      if (operation === "reload") {
        const saved = await request({ signal: controller.signal });
        setData(saved);
        if (!data) setDraft(saved.source || newSource());
        return;
      }
      const result = await request({ method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...(operation === "refresh" ? { input: source, revision: data.revision } : {}) }) });
      if (operation === "fields") {
        setFields(result.fields);
        setDraft(previous => {
          const suggested = suggestBudgetColumns(result.fields, previous.mode);
          return { ...previous, queryName: result.queryName, confirmed: false,
            columns: Object.fromEntries(Object.keys(suggested).map(key => [key, result.fields.includes(previous.columns[key]) ? previous.columns[key] : suggested[key]])) };
        });
      } else { setData(result); setDraft(result.source); setSetup(false); }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        if ([401, 403].includes(e.status)) { setData(null); setDraft(newSource()); setFields(null); }
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const snapshot = data?.snapshot;
  const canChart = snapshot?.receivedCents > 0 && snapshot.groups.every(group => group.receivedCents >= 0);
  const columnLabels = [["giftId", "Gift system record ID"], ["fundId", "Fund system record ID"], ["fundName", "Fund name / description"],
    ["amount", draft.mode === "split" ? "Fund-split amount" : "Whole-gift amount"], ...(draft.mode === "split" ? [["splitId", "Gift split system record ID"]] : [])];
  return <section className={styles.cashPanel} aria-labelledby="budget-cash-heading">
    <header className={styles.cashHeader}><div><p className={styles.eyebrow}>BUDGET SUPPORT</p><h2 id="budget-cash-heading">Budget-relieving cash received</h2>
      <p className={styles.help}>Query 31075 · {BUDGET_CASH_QUERY_NAME}</p></div>
      {data?.canManage && <div className={styles.cashActions}>
        {data.source && <button disabled={busy} onClick={() => command("refresh", data.source)}>Refresh cash totals</button>}
        <button disabled={busy} aria-expanded={setup} aria-controls="budget-cash-source" onClick={() => setSetup(!setup)}>{data.source ? "Manage cash source" : "Connect cash query"}</button>
      </div>}</header>
    {error && <div role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => command("reload")}>Reload saved cash totals</button></div>}
    {!data ? <p role="status">{error ? "Budget cash panel unavailable. Other dashboard totals are unchanged." : "Loading saved cash totals..."}</p> : <>
      <div className={styles.cashTotal}><strong className={styles.amount}>{revenueMoney(snapshot?.receivedCents)}</strong>
        <p>{snapshot ? `${snapshot.giftCount.toLocaleString()} distinct gifts · Last refreshed ${new Date(snapshot.refreshedAt).toLocaleString()}` : "Connect and refresh the cash query to load the total and fund breakdown."}</p></div>
      <table className={styles.cashTable}><caption>Budget-relieving cash received by fund</caption><thead><tr><th scope="col">Fund</th><th scope="col">Cash received</th></tr></thead>
        <tbody>{BUDGET_CASH_GROUPS.map(group => {
          const saved = snapshot?.groups.find(item => item.key === group.key);
          return <tr key={group.key}><th scope="row"><span>{group.label}</span>
            {saved && group.key !== "other" && !saved.fundCount && <small>No matching fund in the saved query</small>}
            {canChart && <span className={styles.cashBarTrack} aria-hidden="true"><span style={{ width: `${100 * saved.receivedCents / snapshot.receivedCents}%` }} /></span>}
          </th><td>{revenueMoney(saved?.receivedCents)}</td></tr>;
        })}</tbody><tfoot><tr><th scope="row">Total budget-relieving cash received</th><td>{revenueMoney(snapshot?.receivedCents)}</td></tr></tfoot>
      </table>
      <p className={styles.help}>All remaining funds returned by this query are included in Other Scholarships. These six amounts add up to the cash total. This panel is separate from eligible re-investment gifts; the two totals may overlap and are not added together.</p>
      {snapshot && <details className={styles.details}><summary>View included funds and calculation details</summary>
        <p>{snapshot.rawRows.toLocaleString()} rows checked; {snapshot.duplicateRows.toLocaleString()} repeated rows counted only once. {data.source.mode === "split" ? "Each gift split is counted once at its fund amount. A gift spanning funds is still one gift in the overall gift count." : "Each gift is counted once under its returned fund. Gifts returned under multiple funds require split outputs instead."}</p>
        <div className={styles.cashTableScroll} role="region" aria-label="Included fund details" tabIndex={0}><table className={styles.cashTable}>
          <thead><tr><th scope="col">NXT fund</th><th scope="col">Group</th><th scope="col">Cash received</th></tr></thead>
          <tbody>{snapshot.funds.map(fund => <tr key={fund.id}><td>{fund.name}<small>System ID {fund.id}</small></td><td>{BUDGET_CASH_GROUPS.find(group => group.key === fund.groupKey)?.label}</td><td>{revenueMoney(fund.receivedCents)}</td></tr>)}</tbody>
        </table></div><p>The fiscal period and cash eligibility follow query 31075. Named groups match NXT fund names, ignoring capitalization, spacing, periods, and curly apostrophes. No gifts or fund records are changed.</p>
      </details>}
      {data.canManage && setup && <div className={styles.setup} id="budget-cash-source"><h3>Budget cash source</h3>
        <button disabled={busy} onClick={() => command("fields")}>Load cash query fields</button><p className={styles.help}>Reads output names only. No query results or NXT records are changed.</p>
        <form onSubmit={e => { e.preventDefault(); command("refresh", draft); }}><fieldset disabled={busy}><legend>Source amounts and funds</legend>
          <label>Amount basis<select value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value, confirmed: false,
            columns: { ...draft.columns, amount: suggestBudgetColumns(fields || [], e.target.value).amount, splitId: suggestBudgetColumns(fields || [], e.target.value).splitId } })}>
            <option value="gift">Whole gifts, one fund per gift</option><option value="split">Fund allocations, using split IDs and amounts</option>
          </select></label>
          <div className={styles.formGrid}>{columnLabels.map(([key, label]) => <label key={key}>{label}<select required disabled={!fields} value={draft.columns[key] || ""}
            onChange={e => setDraft({ ...draft, confirmed: false, columns: { ...draft.columns, [key]: e.target.value } })}>
            <option value="">Choose a query field</option>{!fields && draft.columns[key] && <option value={draft.columns[key]}>{draft.columns[key]}</option>}
            {(fields || []).map(name => <option key={name} value={name}>{name}</option>)}</select></label>)}</div>
          <details className={styles.details}><summary>Match the five named funds</summary><p>The requested fund names are already filled in. Only change these if NXT uses a different name; every other fund stays in Other Scholarships.</p>
            <div className={styles.formGrid}>{BUDGET_CASH_GROUPS.filter(group => group.key !== "other").map(group => <label key={group.key}>NXT fund name for {group.label}
              <input required maxLength={250} value={draft.fundNames[group.key]} onChange={e => setDraft({ ...draft, confirmed: false, fundNames: { ...draft.fundNames, [group.key]: e.target.value } })} />
            </label>)}</div></details>
          <label className={styles.check}><input type="checkbox" checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} />
            This query contains budget-relieving cash received for the intended fiscal period, not unpaid commitments. {draft.mode === "gift" ? "Each gift belongs to one fund and the amount is its whole-gift amount." : "Each row identifies its gift split and the amount belongs to that fund allocation."}</label>
          <button className={styles.primary} type="submit" disabled={!fields || !draft.confirmed || columnLabels.some(([key]) => !draft.columns[key])}>Save cash source and refresh</button>
        </fieldset></form><p className={styles.help}>Only this panel refreshes. Its previous successful totals stay visible until the entire query validates. Nothing is written to NXT.</p>
      </div>}
      {busy && <p role="status">Checking the cash query with the shared reporting account. Previous totals stay visible.</p>}
    </>}
  </section>;
}
