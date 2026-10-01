"use client";
import { useEffect, useRef, useState } from "react";
import useUser from "@/utils/useUser";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";
import { HISTORY_COLUMNS, historyMapping, isCompletedHistoryValue } from "@/utils/stewardshipHistoryImport";

const endpoint = "/api/stewardship/gift-history-import";
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900";
const statusLabels = { new: "New", existing: "Already imported", corrected: "Previously corrected; stays excluded", conflict: "Source conflict; resolve mapping", possible_app_match: "Possible app receipt; skipped" };
const ownRule = (rules, category) => Object.hasOwn(rules, category) ? rules[category] : {};

export function GiftHistoryImport({ sessionKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [queryId, setQueryId] = useState("");
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [columns, setColumns] = useState({});
  const [rules, setRules] = useState({});
  const [completedValue, setCompletedValue] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(Date.now());
  const flight = useRef(false);
  const job = data?.state?.job;
  const table = job?.table;
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || result.sessionKey !== sessionKey || !result.state || !Array.isArray(result.items)) throw new Error(result.error || "Your sign-in changed. Reload this page.");
      if (controller.signal.aborted) return;
      setData(result); setQueryId(result.state.config?.queryId || "");
      const mapping = result.state.config?.mapping;
      setColumns(mapping?.columns || {}); setCompletedValue(mapping?.completedValue || "");
      setRules(Object.fromEntries((mapping?.rules || []).map(rule => [rule.category, rule])));
      setReviewed(false); setApproved(false); setPage(0);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [sessionKey, reload]);
  useEffect(() => {
    const due = Date.parse(job?.nextCheckAt || "");
    if (!Number.isFinite(due)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [job?.nextCheckAt]);

  async function act(operation, payload = {}) {
    if (flight.current || !data || data.state.busy) return;
    flight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, version: data.state.version, viewerKey: data.viewerKey, ...payload }) });
      const result = await response.json();
      if (!response.ok || result.sessionKey !== sessionKey || result.viewerKey !== data.viewerKey || !result.state) throw new Error(result.error || "Saved status could not be confirmed. Reload before continuing.");
      setData(previous => ({ ...previous, state: result.state })); setApproved(false); setPage(0); setNow(Date.now());
      if (operation === "start") setReviewed(false);
    } catch (failure) { setError(failure.message); }
    finally { flight.current = false; setBusy(false); }
  }
  const locked = busy || data?.state?.busy || !!error;
  const canContinue = !locked && job?.canContinue;
  const categoryIndex = table?.headers.indexOf(columns.category);
  const valueIndex = table?.headers.indexOf(columns.value);
  const categories = categoryIndex >= 0 ? [...new Set(table.rows.map(row => row[categoryIndex].trim()).filter(Boolean))].sort() : [];
  const tooManyCategories = categories.length > 100;
  const rows = job?.preview?.rows || [];
  const newCount = rows.filter(row => row.status === "new").length;
  const conflicts = rows.filter(row => row.status === "conflict").length;
  const previewMapping = () => ({ columns, completedValue, confirmed: reviewed,
    rules: categories.filter(category => ownRule(rules, category).itemId).map(category => ({ category, ...ownRule(rules, category) })) });
  function editColumns(key, value) {
    setColumns(previous => ({ ...previous, [key]: value })); setReviewed(false); setApproved(false);
    if (["category", "value"].includes(key)) setRules({});
  }
  function editRule(category, patch) {
    setRules(previous => ({ ...previous, [category]: { ...ownRule(previous, category), ...patch } })); setReviewed(false); setApproved(false);
  }
  const dirty = job?.stage === "preview" && JSON.stringify(historyMapping(previewMapping())) !== JSON.stringify(job.preview.mapping);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
    <WorkflowReturnLink href="/stewardship/inventory/recipients" />
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Stewardship</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Import NXT gift history</h1>
        <p className="mt-2 max-w-2xl text-gray-600">Bring earlier gift recipients into Received Items. Load a query, review what counts as received, then import.</p></div>
      <button className={button} disabled={busy} onClick={() => setReload(value => value + 1)}>Reload saved status</button>
    </header>
    <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">This reads NXT only. No actions or donor records change, no gifts are sent, and current stock is not reduced. Imported history is staff-only until fundraiser ownership can be verified.</p>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-950">{error}</p>}
    {!data && !error && <p role="status">Loading import settings...</p>}
    {data && <>
      {data.state.busy && <p role="status">An import step is still working. Reload saved status shortly; do not start another query yet.</p>}
      {job?.error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-950">{job.error}</p>}
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">1. Load a saved query</h2>
        <details><summary className="cursor-pointer text-sm font-semibold text-emerald-800">Query fields to include</summary>
          <p className="mt-3 text-sm text-gray-600">Use an Action query with gift custom fields, one attribute per row, not one column per gift. Include the action system record ID and custom-field Import ID under All Custom Fields. If the constituent system ID is unavailable, leave that mapping blank; the app reads each selected action to verify its recipient. Never substitute Constituent ID, Import ID, or Integration ID. Dates accept YYYY-MM-DD or M/D/YYYY.</p>
          <ul className="mt-2 list-inside list-disc text-sm">{Object.values(HISTORY_COLUMNS).map(label => <li key={label}>{label}</li>)}</ul>
          <p className="mt-2 text-sm text-gray-600">Up to 10,000 query rows, 2,000 distinct gift records, and 4 MB per run. Repeat date ranges are safe: the same action/custom-field ID is not imported twice.</p>
        </details>
        <label className="grid max-w-sm gap-2 text-sm font-semibold">NXT query system record ID<input className={input} value={queryId} disabled={locked} inputMode="numeric" maxLength={18} onChange={event => { setQueryId(event.target.value); setSourceConfirmed(false); }} /></label>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={sourceConfirmed} disabled={locked} onChange={event => setSourceConfirmed(event.target.checked)} />My connected NXT account and this query belong to this organization, not another database or sandbox.</label>
        <button className={button} disabled={locked || !/^[1-9]\d{0,17}$/.test(queryId) || !sourceConfirmed} onClick={() => act("start", { queryId, confirmed: true })}>{busy ? "Working..." : job ? "Load a fresh query" : "Load query"}</button>
        {job && <p className="text-sm text-gray-500">Loading a fresh query replaces this import preview, not previously imported receipts.</p>}
      </section>
      {job?.stage === "query" && <section className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <h2 className="font-bold">NXT is preparing your query</h2><p className="text-sm">You can leave and return. Nothing imports automatically.</p>
        <button className={button} disabled={!canContinue || now < Date.parse(job.nextCheckAt)} onClick={() => act("check")}>Check query status</button>
        <p className="text-sm">Next check: {new Date(job.nextCheckAt).toLocaleTimeString()}. Continue with the staff account that started this query.</p>
      </section>}
      {table && <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">2. Match fields and gift items</h2><p className="text-sm text-gray-600">{table.rows.length.toLocaleString()} query rows loaded. These settings are saved when you create the preview.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(HISTORY_COLUMNS).map(([key, label]) => <label key={key} className="grid min-w-0 gap-2 text-sm font-semibold">{label}
          <select className={input} value={columns[key] || ""} disabled={!canContinue} onChange={event => editColumns(key, event.target.value)}><option value="">{key === "constituentId" ? "Verify recipient from its NXT action" : key === "value" ? "Use reviewed field presence instead" : "Choose a returned field"}</option>{table.headers.map(header => <option key={header}>{header}</option>)}</select></label>)}</div>
        {!columns.value && <p className="text-sm text-amber-900">Only use field presence when this category's existence means an item was received. If values such as No, False, or Planned are possible, return and map the value field instead.</p>}
        <label className="grid max-w-sm gap-2 text-sm font-semibold">Value that means action completed<select className={input} value={completedValue} disabled={!canContinue} onChange={event => { setCompletedValue(event.target.value); setReviewed(false); setApproved(false); }}>
          <option value="">Choose a returned Yes / True / 1 value</option>{[...new Set(table.rows.map(row => row[table.headers.indexOf(columns.completed)]?.trim()).filter(isCompletedHistoryValue))].map(value => <option key={value}>{value}</option>)}</select></label>
        {tooManyCategories && <p role="alert">More than 100 categories were returned. Narrow the query to gift-item custom fields.</p>}
        {!!categories.length && !tooManyCategories && <div className="space-y-2">
          <button className={button} disabled={!canContinue} onClick={() => {
            const matches = Object.fromEntries(categories.flatMap(category => {
              const found = data.items.filter(item => item.name.trim().toLowerCase() === category.toLowerCase());
              return found.length === 1 ? [[category, { itemId: found[0].id, anyValue: !columns.value, value: "" }]] : [];
            }));
            setRules(matches); setReviewed(false); setApproved(false);
          }}>Match exact item names</button>
          <p className="text-sm text-gray-600">Matches only identical catalog names. Unmatched categories stay excluded. Review the choices and confirm the receipt rules below.</p>
        </div>}
        {!tooManyCategories && categories.map(category => {
          const values = [...new Set(table.rows.filter(row => row[categoryIndex].trim() === category).map(row => row[valueIndex]?.trim()).filter(Boolean))].sort();
          const rule = ownRule(rules, category);
          return <div key={category} className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-semibold">{category}<select className={input} value={rule.itemId || ""} disabled={!canContinue} onChange={event => editRule(category, { itemId: event.target.value })}>
            <option value="">Do not import this category</option>{data.items.map(item => <option key={item.id} value={item.id}>{item.name}{item.archived_at ? " (archived)" : ""}</option>)}</select></label>
            <label className="grid min-w-0 gap-2 text-sm font-semibold">Value that means this gift was received<select className={input} value={rule.anyValue ? "__any_populated__" : rule.value || ""} disabled={!canContinue || !rule.itemId} onChange={event => editRule(category, { anyValue: event.target.value === "__any_populated__", value: event.target.value === "__any_populated__" ? "" : event.target.value })}>
              <option value="">Choose a received-gift rule</option><option value="__any_populated__">{columns.value ? "Any populated value (only if reviewed)" : "Field presence confirms receipt (reviewed)"}</option>{values.slice(0,100).map(value => <option key={value}>{value}</option>)}</select></label></div>;
        })}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} disabled={!canContinue} onChange={event => setReviewed(event.target.checked)} />I verified these IDs, dates, and completed-action values, and that each chosen category/value records an item actually received, not just planned.</label>
        <button className={button} disabled={!canContinue || !reviewed || tooManyCategories || !categories.some(category => ownRule(rules, category).itemId)} onClick={() => act("preview", { mapping: previewMapping() })}>Save mappings and preview</button>
      </section>}
      {job?.stage === "resolving" && <section className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <h2 className="font-bold">Verify gift recipients</h2>
        <p>{rows.filter(row => row.constituentId).length} of {rows.length} gift records verified. Each check reads only selected gift actions, in small batches. Progress is saved; NXT is unchanged.</p>
        <button className={button} disabled={!canContinue || now < Date.parse(job.nextCheckAt || "")} onClick={() => act("resolve")}>Continue recipient checks</button>
      </section>}
      {job?.stage === "preview" && <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">3. Review and import</h2>
        <p className="font-semibold">{newCount} new records · {rows.length - newCount - conflicts} skipped · {conflicts} conflicts</p>
        <p className="text-sm text-gray-600">{job.preview.totals.repeated} repeated query rows consolidated. {job.preview.totals.notCompleted} not completed, {job.preview.totals.notMapped} unmapped, and {job.preview.totals.valueNotMatched} unmatched-value rows excluded. Distinct gift actions remain separate even for the same person.</p>
        <p className="text-sm text-gray-600">Possible app matches are skipped, not confirmed as duplicates. Check Received Items before handling those separately. Previously corrected imports stay excluded.</p>
        {!!conflicts && <p role="alert" className="text-amber-900">An existing source record disagrees with this mapping or date. No import can proceed until the conflict is resolved.</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Gift history import preview</caption><thead><tr>{["Recipient", "Item", "Date", "NXT action / field", "Result"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.slice(page * 50, page * 50 + 50).map(row => <tr className="border-t" key={row.key}><td className="p-2">{row.name}<br /><span className="text-xs text-gray-500">#{row.constituentId}</span></td><td className="p-2">{row.item.name}</td><td className="p-2 whitespace-nowrap">{row.date}</td><td className="p-2">{row.actionId} / {row.fieldId}</td><td className="p-2">{statusLabels[row.status]}</td></tr>)}</tbody></table></div>
        <nav aria-label="Preview pages" className="flex flex-wrap items-center gap-3"><button className={button} disabled={!page} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 50))}</span><button className={button} disabled={(page + 1) * 50 >= rows.length} onClick={() => setPage(value => value + 1)}>Next</button></nav>
        {dirty && <p className="text-sm text-amber-900">Mappings changed. Save mappings and preview again before importing.</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={!canContinue || dirty || !!conflicts || !!job.error} checked={approved} onChange={event => setApproved(event.target.checked)} />Import the new records shown in this preview into this app's Received Items history. Do not change NXT or stock.</label>
        <button className={`${button} bg-emerald-50`} disabled={!canContinue || !approved || dirty || !!conflicts || !newCount || !!job.error} onClick={() => act("commit", { confirmed: true })}>Import {newCount} new records</button>
      </section>}
      {job?.stage === "committed" && <section role="status" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-bold">History imported</h2><p>{job.inserted} records added. {job.skipped} already present or held for review. NXT and stock are unchanged.</p><a className={button} href="/stewardship/inventory/recipients">View Received Items</a></section>}
    </>}
  </main>;
}
export default function GiftHistoryImportPage() {
  const { data: user, loading } = useUser();
  const sessionKey = user ? String(user.id || user.email) : null;
  if (loading) return <p role="status" className="p-8">Loading workspace...</p>;
  if (!sessionKey) return <a href="/account/signin" className="p-8 underline">Sign in to import gift history</a>;
  return <GiftHistoryImport key={sessionKey} sessionKey={sessionKey} />;
}
