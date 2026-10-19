import { useEffect, useRef, useState } from "react";
import { revenueMoney } from "@/utils/fyRevenueGoals";
import { BUDGET_CASH_GROUPS, BUDGET_CASH_QUERY_ID, BUDGET_CASH_QUERY_NAME, correctedBudgetFundNames, defaultBudgetFundNames, normalizeBudgetFundName, suggestBudgetColumns } from "@/utils/fyBudgetCash";
import styles from "./revenue.module.css";

const API = "/api/reports/fy-revenue-goals/budget-cash";
const newSource = () => ({ queryId: BUDGET_CASH_QUERY_ID, queryName: BUDGET_CASH_QUERY_NAME, mode: "gift", columns: suggestBudgetColumns([]), fundNames: defaultBudgetFundNames(), confirmed: false });
async function request(options) {
  const response = await fetch(API, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Budget cash totals could not be loaded."), { status: response.status });
  return data;
}
export default function BudgetCashPanel({ onDataChange } = {}) {
  const [data, setData] = useState(null), [draft, setDraft] = useState(newSource), [fields, setFields] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [setup, setSetup] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(null);
  useEffect(() => { onDataChange?.(data); }, [data, onDataChange]);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    request({ signal: controller.signal }).then(result => { setData(result); setDraft(result.source || newSource()); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => active.current?.abort();
  }, []);
  async function command(operation, source) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
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
      } else { setData(result); setDraft(result.source); setSetup(false); setNotice("Cash source saved and totals refreshed. The fund breakdown now uses the saved names."); }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        if ([401, 403].includes(e.status)) { setData(null); setDraft(newSource()); setFields(null); }
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const snapshot = data?.snapshot;
  const groupLabel = key => data?.source?.fundNames?.[key] || BUDGET_CASH_GROUPS.find(group => group.key === key)?.label;
  const settings = source => JSON.stringify(source && { mode: source.mode, queryName: source.queryName, columns: source.columns, fundNames: source.fundNames });
  const unsaved = Boolean(data?.source && settings(draft) !== settings(data.source));
  const correctedNames = correctedBudgetFundNames(draft.fundNames);
  const hasNameCorrections = JSON.stringify(correctedNames) !== JSON.stringify(draft.fundNames);
  const returnedNames = [...new Set((snapshot?.funds || []).map(fund => fund.name))].sort((a, b) => a.localeCompare(b));
  const unmatched = snapshot?.groups.filter(group => group.key !== "other" && !group.fundCount) || [];
  const canChart = snapshot?.receivedCents > 0 && snapshot.groups.every(group => group.receivedCents >= 0);
  const columnLabels = [["giftId", "Gift system record ID"], ["fundId", "Fund system record ID"], ["fundName", "Fund name / description"],
    ["amount", draft.mode === "split" ? "Fund-split amount" : "Whole-gift amount"], ...(draft.mode === "split" ? [["splitId", "Gift split system record ID"]] : [])];
  return <section className={styles.cashPanel} aria-labelledby="budget-cash-heading">
    <header className={styles.cashHeader}><div><p className={styles.eyebrow}>BUDGET SUPPORT</p><h2 id="budget-cash-heading">Budget-relieving cash received</h2>
      <p className={styles.help}>Query 31075 · {BUDGET_CASH_QUERY_NAME}</p></div>
      {data?.canManage && <div className={styles.cashActions}>
        {data.source && <button disabled={busy || unsaved} onClick={() => command("refresh", data.source)}>Refresh cash totals</button>}
        <button disabled={busy} aria-expanded={setup} aria-controls="budget-cash-source" onClick={() => setSetup(!setup)}>{data.source ? "Manage cash source" : "Connect cash query"}</button>
      </div>}</header>
    {error && <div role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => command("reload")}>Reload saved cash totals</button></div>}
    {unsaved ? <div role="status" className={styles.goalNotice}>You have unsaved cash-source changes. Use Save cash source and refresh to apply them. The totals below still use the saved settings.
      {!setup && <button disabled={busy} onClick={() => setSetup(true)}>Continue editing cash source</button>}</div>
      : notice && <p role="status" className={styles.help}>{notice}</p>}
    {!data ? <p role="status">{error ? "Budget cash panel unavailable. Other dashboard totals are unchanged." : "Loading saved cash totals..."}</p> : <>
      <div className={styles.cashTotal}><strong className={styles.amount}>{revenueMoney(snapshot?.receivedCents)}</strong>
        <p>{snapshot ? `${snapshot.giftCount.toLocaleString()} distinct gifts · Last refreshed ${new Date(snapshot.refreshedAt).toLocaleString()}` : "Connect and refresh the cash query to load the total and fund breakdown."}</p></div>
      <table className={styles.cashTable}><caption>Budget-relieving cash received by fund</caption><thead><tr><th scope="col">Fund</th><th scope="col">Cash received</th></tr></thead>
        <tbody>{BUDGET_CASH_GROUPS.map(group => {
          const saved = snapshot?.groups.find(item => item.key === group.key);
          return <tr key={group.key}><th scope="row"><span>{groupLabel(group.key)}</span>
            {saved && group.key !== "other" && !saved.fundCount && <small>No matching fund returned in the last refresh</small>}
            {canChart && <span className={styles.cashBarTrack} aria-hidden="true"><span style={{ width: `${100 * saved.receivedCents / snapshot.receivedCents}%` }} /></span>}
          </th><td>{revenueMoney(saved?.receivedCents)}</td></tr>;
        })}</tbody><tfoot><tr><th scope="row">Total budget-relieving cash received</th><td>{revenueMoney(snapshot?.receivedCents)}</td></tr></tfoot>
      </table>
      {unmatched.length > 0 && <p className={styles.goalNotice}>The last query refresh did not return a matching fund for: {unmatched.map(group => groupLabel(group.key)).join("; ")}. Check the names and query 31075's criteria if you expected gifts here. Changing a name cannot add gifts that are absent from the query results.</p>}
      <p className={styles.help}>All remaining funds returned by this query are included in Other Scholarships. These six amounts add up to the cash total. The unrestricted goal combines this cash total with only the 10% re-investment amount, not the full eligible-gifts total.</p>
      {snapshot && <details className={styles.details}><summary>View included funds and calculation details</summary>
        <p>{snapshot.rawRows.toLocaleString()} rows checked; {snapshot.duplicateRows.toLocaleString()} repeated rows counted only once. {data.source.mode === "split" ? "Each gift split is counted once at its fund amount. A gift spanning funds is still one gift in the overall gift count." : "Each gift is counted once under its returned fund. Gifts returned under multiple funds require split outputs instead."}</p>
        <div className={styles.cashTableScroll} role="region" aria-label="Included fund details" tabIndex={0}><table className={styles.cashTable}>
          <thead><tr><th scope="col">NXT fund</th><th scope="col">Group</th><th scope="col">Cash received</th></tr></thead>
          <tbody>{snapshot.funds.map(fund => <tr key={fund.id}><td>{fund.name}<small>System ID {fund.id}</small></td><td>{groupLabel(fund.groupKey)}</td><td>{revenueMoney(fund.receivedCents)}</td></tr>)}</tbody>
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
          <details className={styles.details} open><summary>Match the five named funds</summary><p>Choose a name from the last saved query results or type the exact NXT fund name. Saving updates both the displayed name and its grouping; every other fund stays in Other Scholarships. You do not need to reload query fields just to edit names.</p>
            {hasNameCorrections && <p>The original defaults used JU Parent Fund and Future Rising Scholarship Fund. <button type="button" onClick={() => setDraft({ ...draft, confirmed: false, fundNames: correctedNames })}>Use corrected standard names</button></p>}
            <datalist id="budget-cash-returned-funds">{returnedNames.map(name => <option key={name} value={name} />)}</datalist>
            <div className={styles.formGrid}>{BUDGET_CASH_GROUPS.filter(group => group.key !== "other").map(group => {
              const matches = snapshot?.funds.filter(fund => normalizeBudgetFundName(fund.name) === normalizeBudgetFundName(draft.fundNames[group.key]));
              return <div key={group.key}><label htmlFor={`budget-fund-${group.key}`}>NXT fund name for {group.label}</label>
                <input id={`budget-fund-${group.key}`} required maxLength={250} list="budget-cash-returned-funds" aria-describedby={`budget-fund-match-${group.key}`}
                  value={draft.fundNames[group.key]} onChange={e => setDraft({ ...draft, confirmed: false, fundNames: { ...draft.fundNames, [group.key]: e.target.value } })} />
                <p id={`budget-fund-match-${group.key}`} className={styles.help}>{!matches ? "No saved results yet. Matching is checked when you save and refresh."
                  : matches.length ? `Matches ${matches.length} saved fund${matches.length === 1 ? "" : "s"}: ${matches.map(fund => `${fund.name} (ID ${fund.id})`).join(", ")}.`
                    : "No match in the saved results. Check the name, or save and refresh if the fund was recently added to the query."}</p>
              </div>;
            })}</div></details>
          <label className={styles.check}><input type="checkbox" checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} />
            This query contains budget-relieving cash received for the intended fiscal period, not unpaid commitments. {draft.mode === "gift" ? "Each gift belongs to one fund and the amount is its whole-gift amount." : "Each row identifies its gift split and the amount belongs to that fund allocation."}</label>
          <button className={styles.primary} type="submit" disabled={(!fields && !data.source) || !draft.confirmed || columnLabels.some(([key]) => !draft.columns[key])}>Save cash source and refresh</button>
        </fieldset></form><p className={styles.help}>Only this panel refreshes. Its previous successful totals stay visible until the entire query validates. Nothing is written to NXT.</p>
      </div>}
      {busy && <p role="status">Checking the cash query with the shared reporting account. Previous totals stay visible.</p>}
    </>}
  </section>;
}
