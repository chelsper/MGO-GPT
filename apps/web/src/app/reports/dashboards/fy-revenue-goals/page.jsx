"use client";
import { useEffect, useRef, useState } from "react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { DEFAULT_PROJECTION, FY_REVENUE_KEY, FY_REVENUE_QUERY_ID, FY_REVENUE_QUERY_NAME, PROJECTION_LABEL, REVENUE_LABEL, revenueMoney } from "@/utils/fyRevenueGoals";
import styles from "./revenue.module.css";

const API = "/api/reports/fy-revenue-goals";
const initial = { queryId: FY_REVENUE_QUERY_ID, queryName: FY_REVENUE_QUERY_NAME, columns: { giftId: "", amount: "" }, projection: DEFAULT_PROJECTION, confirmed: false };
async function request(options) {
  const response = await fetch(API, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "The dashboard could not be loaded. Please try again."), { status: response.status });
  return data;
}

export default function FYRevenueGoalsPage() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [draft, setDraft] = useState(initial), [fields, setFields] = useState(null);
  const [busy, setBusy] = useState(false), [setup, setSetup] = useState(null);
  const active = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    request({ signal: controller.signal }).then(result => {
      setData(result); setDraft(result.source || initial);
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => active.current?.abort();
  }, []);
  async function command(operation, source) {
    if (busy) return;
    setBusy(true); setError("");
    const controller = new AbortController(); active.current = controller;
    try {
      if (operation === "reload") {
        const result = await request({ signal: controller.signal });
        setData(result); // Keep any unsaved mapping draft so recovery does not discard edits.
        return;
      }
      const result = await request({ method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...(operation === "refresh" ? { revision: data.revision, input: source } : {}) }) });
      if (operation === "fields") {
        setFields(result.fields);
        setDraft(previous => ({ ...previous, queryName: result.queryName, confirmed: false,
          columns: Object.fromEntries(["giftId", "amount"].map(key => [key, result.fields.includes(previous.columns[key]) ? previous.columns[key] : result.suggested[key]])) }));
      } else {
        setData(result); setDraft(result.source); setSetup(false);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        if ([401, 403].includes(e.status)) { setData(null); setFields(null); setDraft(initial); }
      }
    }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const snapshot = data?.snapshot;
  const editing = setup ?? !data?.source;
  const mode = data?.source?.projection || DEFAULT_PROJECTION;
  const formula = mode === "remaining" ? "Eligible gifts received minus 10% (90% remaining)" : "Eligible gifts received multiplied by 10% (amount set aside)";
  return <main className={styles.page}><div className={styles.content}>
    <SharedReportHeader compact activeReportKey={FY_REVENUE_KEY} reportSection="dashboards"
      title={data?.title || "FY Revenue Goals"} description="A clear view of eligible gift revenue and projected re-investment."
      dashboardSwitchDisabled={busy} action={data?.canManage && <button disabled={busy} aria-expanded={editing} aria-controls="revenue-source" onClick={() => setSetup(!editing)}>Manage source</button>} />
    {error && <div role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => command("reload")}>Reload saved totals</button></div>}
    {!data ? <p role="status">{error ? "Dashboard unavailable." : "Loading saved totals..."}</p> : <>
      <div className={styles.status}><p>{snapshot ? `Last refreshed ${new Date(snapshot.refreshedAt).toLocaleString()}` : "Ready to connect your first revenue source."}</p>
        {data.canManage && data.source && <button disabled={busy} onClick={() => command("refresh", data.source)}>{busy ? "Working..." : "Refresh totals"}</button>}</div>
      <section aria-label="Gift re-investment totals" className={styles.metrics} aria-busy={busy}>
        <article className={styles.metric}><p className={styles.eyebrow}>ELIGIBLE REVENUE</p><h2>{REVENUE_LABEL}</h2>
          <strong className={styles.amount}>{revenueMoney(snapshot?.receivedCents)}</strong>
          <p>{snapshot ? `${snapshot.giftCount.toLocaleString()} distinct gifts` : "Connect and refresh query 31074 to show this total."}</p></article>
        <article className={`${styles.metric} ${styles.projection}`}><p className={styles.eyebrow}>PROJECTED RE-INVESTMENT</p><h2>{PROJECTION_LABEL}</h2>
          <strong className={styles.amount}>{revenueMoney(snapshot?.projectedCents)}</strong><p>{formula}.</p></article>
      </section>
      <p className={styles.basis}>Gift eligibility and the fiscal period follow query 31074. This is a reporting calculation only; no gift amounts or other NXT records are changed.</p>
      {snapshot && <details className={styles.details}><summary>How these totals are calculated</summary>
        <p>Source: {data.source.queryName} (31074). Each gift system record ID is counted once, using its mapped whole-gift amount.</p>
        <p>{snapshot.rawRows.toLocaleString()} query rows checked; {snapshot.duplicateRows.toLocaleString()} repeated gift rows counted only once. Conflicting gift amounts stop the refresh rather than publishing an unreliable total.</p>
        <p>{formula}. The 10% amount is rounded to cents after totaling all gifts.</p>
      </details>}
      {data.canManage && editing && <section className={styles.setup} id="revenue-source" aria-labelledby="source-heading">
        <h2 id="source-heading">Gift re-investment source</h2><p><strong>{FY_REVENUE_QUERY_NAME}</strong><br />Saved Gift query 31074</p>
        <button disabled={busy} onClick={() => command("fields")}>{busy ? "Working..." : "Load query fields"}</button>
        <p className={styles.help}>Reads the output field names only. Choose the gift's internal system record ID and the full amount received for each gift, not a fund split or pledge balance.</p>
        <form onSubmit={e => { e.preventDefault(); command("refresh", draft); }}>
          <fieldset disabled={busy}><legend>Source fields and calculation</legend><div className={styles.formGrid}>
            {[["giftId", "Gift system record ID"], ["amount", "Whole-gift received amount"]].map(([key, label]) => <label key={key}>{label}
              <select required disabled={!fields} value={draft.columns[key]} onChange={e => setDraft({ ...draft, confirmed: false, columns: { ...draft.columns, [key]: e.target.value } })}>
                <option value="">Choose a query field</option>{!fields && draft.columns[key] && <option value={draft.columns[key]}>{draft.columns[key]}</option>}
                {(fields || []).map(name => <option key={name} value={name}>{name}</option>)}</select></label>)}
          </div><label>Projected re-investment calculation<select value={draft.projection} onChange={e => setDraft({ ...draft, projection: e.target.value, confirmed: false })}>
            <option value="set_aside">The 10% set aside for re-investment</option><option value="remaining">Amount remaining after taking out 10% (90%)</option>
          </select></label>
          <label className={styles.check}><input type="checkbox" checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} />
            This query contains received gifts for the intended fiscal period, not unpaid pledges or other commitments. The mapped amount is the whole-gift amount.</label>
          <button className={styles.primary} disabled={!draft.confirmed || !draft.columns.giftId || !draft.columns.amount || !fields} type="submit">Save source and refresh totals</button>
          </fieldset>
        </form><p className={styles.help}>The previous successful totals stay visible while refreshing. Source settings and new totals are saved together only after all rows pass validation. Manage viewers in <a href="/report-configurations">Report configurations</a>.</p>
      </section>}
      {busy && <p role="status">Working with the shared reporting account. Previous totals stay visible; no NXT gifts are changed.</p>}
    </>}
  </div></main>;
}
