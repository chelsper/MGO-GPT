"use client";
import { useEffect, useRef, useState } from "react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { CAMPAIGN_REPORT_KEY, CAMPAIGN_PRIORITIES, campaignMoney, priorityLabel } from "@/utils/campaignPriorities";
import CampaignSourceEditor from "./CampaignSourceEditor";
import CampaignFundAssignments from "./CampaignFundAssignments";
import CampaignOverview from "./CampaignOverview";
import CampaignFiscalYears from "./CampaignFiscalYears";
import CampaignPillars from "./CampaignPillars";
import styles from "./campaign.module.css";

const API = "/api/reports/campaign-priorities";
async function readJson(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load the campaign. Try again.");
  return data;
}
const priorityOptions = <>{CAMPAIGN_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}<option value="unassigned">Unassigned</option></>;
const readCampaignFields = queryId => readJson(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "fields", input: { queryId } }) });

function GiftEditor({ row, command, pending, onClose, saveError }) {
  const [priority, setPriority] = useState(row.override_priority || "inherit");
  const [amount, setAmount] = useState(row.override_cents == null ? "" : (row.override_cents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const dialog = useRef(null);
  useEffect(() => { const element = dialog.current; const previous = document.activeElement; element.showModal?.(); element.querySelector("select")?.focus(); return () => { element.close?.(); previous?.focus?.(); }; }, []);
  const save = async revert => {
    if (await command("override", { itemKey: row.item_key, priority: priority === "inherit" ? null : priority, amount: amount.trim() ? amount : null, reason, revert }, row)) onClose();
  };
  return <dialog ref={dialog} open={typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal} className={styles.dialog} aria-labelledby="campaign-gift-title" onCancel={e => { e.preventDefault(); if (!pending) onClose(); }}>
    <div className={styles.sectionHead}><div><h2 id="campaign-gift-title">Campaign-only gift exception</h2><p>{row.donor_name || `Gift ${row.gift_id}`} · {row.fund_name}</p></div><button onClick={onClose} disabled={pending}>Close</button></div>
    <p>Gift {row.gift_id}{row.split_id ? ` / split ${row.split_id}` : ""}. Original allocation amount: <strong>{campaignMoney(row.amount_cents)}</strong>.</p>
    {row.needs_review && <p className={styles.notice}>This allocation changed in NXT. Its previous exception is not included in totals. Review the new source amount and fund before saving a replacement.</p>}
    <div className={styles.formGrid}><label>Priority<select value={priority} onChange={e => setPriority(e.target.value)}><option value="inherit">Use fund priority ({priorityLabel(row.fund_priority)})</option>{priorityOptions}</select></label>
      <label>Adjusted campaign amount (USD)<input inputMode="decimal" placeholder="Leave blank to use the source amount" value={amount} onChange={e => setAmount(e.target.value)} /></label></div>
    <label>Reason for this change<textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
    <p className={styles.muted}>Only this allocation changes in this dashboard. Nothing is written to NXT or other reports. Blank amount uses the source amount; 0 is a deliberate zero.</p>
    <div className={styles.toolbar}><button className={styles.primary} disabled={pending || !reason.trim()} onClick={() => save(false)}>Save campaign exception</button>{row.has_override && <button disabled={pending || !reason.trim()} onClick={() => save(true)}>Restore fund priority and source amount</button>}
      <button disabled={pending} onClick={async () => { try { setHistory((await readJson(`${API}?history=${encodeURIComponent(row.item_key)}`)).events); } catch (e) { setError(e.message); } }}>View change history</button></div>
    {(error || saveError) && <p role="alert" className={styles.error}>{error || saveError} Your draft has not been discarded. Close this editor and reload saved data before retrying a conflicting edit.</p>}
    {history && <section aria-label="Gift exception history"><h3>Change history</h3>{!history.length ? <p>No campaign exceptions have been saved.</p> : <ol>{history.map(event => <li key={event.id}><strong>{event.actor_name}</strong> · {new Date(event.created_at).toLocaleString()}<p>{event.operation}: {event.reason}</p>
      <small>{event.after_value?.revert ? "Restored source amount and fund priority" : `${priorityLabel(event.after_value?.priority)}; ${event.after_value?.amountCents === null ? "source amount" : campaignMoney(event.after_value?.amountCents)}`}</small></li>)}</ol>}</section>}
  </dialog>;
}

export default function CampaignPrioritiesPage() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [pending, setPending] = useState(false), [setup, setSetup] = useState(null), [funds, setFunds] = useState(false), [edit, setEdit] = useState(null);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState({ search: "", fund: "", priority: "", page: 1 });
  const [autoContinue, setAutoContinue] = useState(false), [confirmed, setConfirmed] = useState(false);
  const requestId = useRef(0);
  async function load() {
    const id = ++requestId.current;
    try {
      const result = await readJson(`${API}?${new URLSearchParams(Object.entries(filter).map(([k, v]) => [k, String(v)]))}`);
      if (id === requestId.current) { setData(result); setError(""); }
      return result;
    } catch (e) { if (id === requestId.current) setError(e.message); return null; }
  }
  useEffect(() => { load(); return () => { requestId.current++; }; }, [filter]);
  async function command(operation, input, snapshot) {
    if (pending || !data) return false;
    setPending(true); setError("");
    try {
      const result = await readJson(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, version: snapshot?._version ?? data.version, runId: snapshot?._runId ?? data.runId, input }) });
      const latest = await load();
      if (!latest) { setAutoContinue(false); return false; }
      if (result.stage === "failed" || latest?.job?.stage === "failed") { setAutoContinue(false); return false; }
      return true;
    } catch (e) { setAutoContinue(false); setError(e.message); return false; } finally { setPending(false); }
  }
  useEffect(() => {
    if (!autoContinue || pending || !data || !["waiting", "downloading", "resolving"].includes(data.job?.stage)) return;
    const timer = setTimeout(() => command("continue"), Math.max(1500, Date.parse(data.job.nextCheckAt || "") - Date.now() || 1500));
    return () => clearTimeout(timer);
  }, [autoContinue, pending, data]);
  const ready = Boolean(data?.runId);
  const reviewCount = data?.priorities.reduce((sum, p) => sum + p.needs_review, 0) || 0;
  const active = ["starting", "waiting", "downloading", "resolving"].includes(data?.job?.stage);
  const setupOpen = setup ?? !data?.config?.sourceKey;
  return <main className={styles.page}><div className={styles.content}>
    <SharedReportHeader activeReportKey={CAMPAIGN_REPORT_KEY} reportSection="dashboards" title={data?.title || "Future. Made. Campaign"} description="The whole campaign, year by year, and the five priorities it supports." />
    {error && <div className={styles.error} role="alert">{error} <button onClick={load} disabled={pending}>Reload saved data</button></div>}
    {!data ? <p role="status">{error ? "Campaign unavailable." : "Loading saved campaign..."}</p> : <>
      <nav className={styles.segmentNav} aria-label="Campaign sections"><a href="#campaign-overview">Overview</a><a href="#campaign-fiscal-years">Fiscal years</a><a href="#campaign-pillars">Five pillars</a><a href="#campaign-gifts">Gift detail</a></nav>
      <div className={styles.sectionHead}><p className={styles.muted}>{data.updatedAt ? `Last refreshed ${new Date(data.updatedAt).toLocaleString()}` : "No saved campaign data yet."}</p>{data.canManage && <div className={styles.toolbar}><button onClick={() => setFunds(!funds)} disabled={!ready || pending}>{funds ? "Hide fund assignments" : "Assign funds to priorities"}</button><button onClick={() => setSetup(!setupOpen)} disabled={pending}>{setupOpen ? "Hide source setup" : "Source & refresh"}</button><a href={`/report-configurations?report=${CAMPAIGN_REPORT_KEY}&tab=Access`}>Manage viewers</a></div>}</div>
      {data.sourceChanged && <p className={styles.notice}>Source settings changed. These are the previous complete results; finish a refresh before making assignments or exceptions.</p>}
      {reviewCount > 0 && <p className={styles.notice}>{reviewCount} exceptions need review because their source amount or fund changed. Those exceptions are not applied to totals.</p>}
      {data.orphaned > 0 && <p className={styles.muted}>{data.orphaned} saved exceptions belong to allocations no longer in this query. They are retained in history but excluded from totals.</p>}
      {data.canManage && setupOpen && <CampaignSourceEditor data={data} pending={pending} command={command} readFields={readCampaignFields} onClose={() => setSetup(false)} />}
      {data.canManage && data.config?.sourceKey && <section className={styles.refresh} aria-label="Campaign refresh"><details open={setup || active || Boolean(data.job?.error)}><summary>Refresh campaign data</summary><p>Run the saved Gift query using the shared reporting account. Last complete results stay visible while it runs. No gifts, funds, or query settings in NXT are changed.</p>
        {data.job?.error && <p role="alert" className={styles.error}>{data.job.error}</p>}
        {active ? <><p role="status">{pending ? "Loading campaign data..." : data.job.stage === "waiting" ? "NXT is preparing the campaign query." : data.job.stage === "resolving" ? "Checking split gifts against their NXT fund allocations." : "Campaign refresh is in progress."} {autoContinue ? "This page will continue automatically." : "Resume when you are ready."}</p><div className={styles.toolbar}><button disabled={pending || data.busy} onClick={async () => { setAutoContinue(true); await command("continue"); }}>Continue refresh</button><button disabled={pending || data.busy} onClick={async () => { setAutoContinue(false); await command("cancel"); }}>Cancel this refresh</button><button disabled={pending} onClick={load}>Reload saved status</button></div></>
          : <><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />This query defines our campaign. I reviewed the mapped gift IDs, funds, and amount basis.</label><button className={styles.primary} disabled={pending || data.busy || !confirmed} onClick={async () => { setAutoContinue(true); await command("start", { confirmed: true }); }}>Refresh campaign</button></>}
      </details></section>}
      {funds && data.canManage && ready && <CampaignFundAssignments key={data.runId} data={data} command={command} pending={pending} />}
      <CampaignOverview data={data} />
      <CampaignFiscalYears data={data} />
      <CampaignPillars data={data} selectedPriority={filter.priority} onSelect={priority => setFilter(f => ({ ...f, priority, page: 1 }))} />
      {ready && <section id="campaign-gifts" className={styles.card} aria-label="Campaign gifts"><h2>Gifts behind the priorities</h2><p className={styles.muted}>Filters below apply to gift detail only. The overview, fiscal years, and pillars always show the whole campaign.</p><form className={styles.toolbar} onSubmit={e => { e.preventDefault(); setFilter(f => ({ ...f, search, page: 1 })); }}>
        <label>Find a donor, gift ID or fund<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><button type="submit" disabled={pending}>Search</button><label>Priority<select value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value, page: 1 }))}><option value="">All priorities</option>{priorityOptions}</select></label><label>Fund<select value={filter.fund} onChange={e => setFilter(f => ({ ...f, fund: e.target.value, page: 1 }))}><option value="">All funds</option>{data.funds.map(f => <option key={f.fund_id} value={f.fund_id}>{f.fund_name}</option>)}</select></label></form>
        <p className={styles.muted}>{data.total.toLocaleString()} allocations across {data.gifts.toLocaleString()} gifts match these filters. Split gifts may appear in multiple priorities; amounts, not gift counts, reconcile.</p>
        <div className={styles.tableWrap}><table><thead><tr><th>Gift / donor</th><th>Fund</th><th>Priority</th><th>Original</th><th>Campaign amount</th>{data.canManage && <th>Exception</th>}</tr></thead><tbody>{data.rows.map(row => <tr key={row.item_key}>
          <td><strong>{row.donor_name || "Donor not included"}</strong><small>Gift {row.gift_id}{row.split_id ? ` / split ${row.split_id}` : ""}</small><small>{row.gift_date} {row.gift_type}</small></td><td>{row.fund_name}</td><td>{priorityLabel(row.priority)}</td><td>{campaignMoney(row.amount_cents)}</td><td><strong>{campaignMoney(row.effective_cents)}</strong>{row.has_override && <small>{row.needs_review ? "Exception needs review" : "Campaign-only exception"}</small>}</td>
          {data.canManage && <td><button disabled={pending || data.sourceChanged} onClick={() => { setError(""); setEdit({ ...row, _version: data.version, _runId: data.runId }); }}>{row.has_override ? "Review exception" : "Adjust allocation"}</button></td>}</tr>)}</tbody></table></div>
        {!data.rows.length && <p>No allocations match these filters.</p>}<div className={styles.pagination}><button disabled={pending || filter.page <= 1} onClick={() => setFilter(f => ({ ...f, page: f.page-1 }))}>Previous page</button><span>Page {filter.page} of {Math.max(1, Math.ceil(data.total/25))}</span><button disabled={pending || filter.page*25 >= data.total} onClick={() => setFilter(f => ({ ...f, page: f.page+1 }))}>Next page</button></div>
      </section>}
      <p className={styles.muted}>Campaign recognition follows the saved query's definition, not a recalculation of cash received or commitments. Gifts returned under multiple funds use their verified NXT split amounts. Local adjustments affect this dashboard only and retain their original NXT amounts.</p>
      {edit && <GiftEditor key={`${edit._runId}:${edit.item_key}`} row={edit} command={command} pending={pending} saveError={error} onClose={() => setEdit(null)} />}
    </>}
  </div></main>;
}
