"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { DEFAULT_EXPORT_COLUMNS, PROSPECT_EXPORT_COLUMNS } from "@/utils/prospectExport";

export function readExportPreferences(viewerId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`prospect-export-v1:${viewerId}`));
    if (Array.isArray(saved?.columns)) return {
      columns: PROSPECT_EXPORT_COLUMNS.filter((c) => c.required || saved.columns.includes(c.key)).map((c) => c.key),
      format: saved.format === "csv" ? "csv" : "xlsx",
    };
  } catch { /* Preferences are optional, including in private browsing. */ }
  return { columns: DEFAULT_EXPORT_COLUMNS, format: "xlsx" };
}

const fieldClass = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";
export function ProspectExportForm({ viewerId, ownerIds, master = false, prospectIds = [], workspaceName = "this workspace" }) {
  const prefix = useId();
  const [preferences, setPreferences] = useState(() => readExportPreferences(viewerId));
  const [scope, setScope] = useState(master ? "master" : "filtered");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeClosedOpportunities, setIncludeClosedOpportunities] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const abort = useRef(null);
  useEffect(() => () => abort.current?.abort(), []);
  function updatePreferences(next) {
    setPreferences(next);
    try { localStorage.setItem(`prospect-export-v1:${viewerId}`, JSON.stringify(next)); } catch { /* Nonessential. */ }
  }
  async function download(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/prospects/export", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.current.signal,
        body: JSON.stringify({ scope, ownerIds, prospectIds: scope === "filtered" ? prospectIds : [],
          ...preferences, includeInactive: scope !== "filtered" && includeInactive, includeClosedOpportunities }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Export failed. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `top-prospects-${master ? "master-" : ""}${new Date().toISOString().slice(0, 10)}.${preferences.format}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage("Export downloaded. It contains saved data only; no NXT refresh was run.");
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "Export failed.");
    } finally { setBusy(false); }
  }
  const noSelection = !ownerIds.length || (!master && scope === "filtered" && !prospectIds.length);
  return <form onSubmit={download} className="space-y-5">
    <p className="text-sm text-gray-600">Export {master ? "the selected MGO workspaces" : workspaceName} using saved data. Nothing is changed in the app or NXT.</p>
    <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
      <div className="grid gap-4 sm:grid-cols-2">
        {!master && <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${prefix}-scope`}>Prospects to export
          <select id={`${prefix}-scope`} className={fieldClass} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="filtered">Current filtered list ({prospectIds.length})</option>
            <option value="active">{includeInactive ? "All prospects (including closed/archived)" : "All active prospects"}</option>
          </select>
        </label>}
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${prefix}-format`}>File format
          <select id={`${prefix}-format`} className={fieldClass} value={preferences.format}
            onChange={(e) => updatePreferences({ ...preferences, format: e.target.value })}>
            <option value="xlsx">Excel workbook (.xlsx)</option><option value="csv">CSV (summary only)</option>
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        {preferences.format === "xlsx" ? "Three sheets: Prospect Summary, Opportunity Detail, and Export Notes. Amounts stay numeric, with filters and frozen headings." : "CSV includes Prospect Summary only, without opportunity detail or notes. Saved timestamps travel with each row. Choose Excel for the full workbook."}
        {master && <p className="mt-2">One prospect row per MGO. Shared prospects/opportunities may appear for more than one MGO; these are not unique institution-wide totals.</p>}
      </div>
      {scope !== "filtered" && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
        Include closed and archived prospects (off by default)
      </label>}
      {preferences.format === "xlsx" && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={includeClosedOpportunities} onChange={(e) => setIncludeClosedOpportunities(e.target.checked)} />
        Include closed opportunities in Opportunity Detail (open only by default)
      </label>}
      <fieldset>
        <legend className="mb-2 font-semibold">Prospect Summary columns</legend>
        <p className="mb-3 text-sm text-gray-600">Column and format choices are remembered on this browser. Optional contact and cached details may be unavailable; blank does not mean zero.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROSPECT_EXPORT_COLUMNS.map((column) => <label key={column.key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={preferences.columns.includes(column.key)} disabled={column.required}
              onChange={(e) => updatePreferences({ ...preferences, columns: e.target.checked
                ? [...preferences.columns, column.key] : preferences.columns.filter((key) => key !== column.key) })} />
            <span>{column.label}{column.required ? " (required)" : ""}</span>
          </label>)}
        </div>
      </fieldset>
    </fieldset>
    <p className="text-sm text-gray-600">Internal fundraising use only. Share exported donor information only with authorized people. Pipeline is open ask amount, not FY revenue.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
    {noSelection && <p className="text-sm text-gray-600">{master ? "Select at least one MGO to export." : "Choose all active prospects or adjust your filters to include a prospect."}</p>}
    <button type="submit" disabled={busy || noSelection} className="inline-flex items-center gap-2 rounded-xl bg-[#5B4BFA] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
      <Download size={18} aria-hidden="true" />{busy ? "Preparing export..." : `Download ${preferences.format === "xlsx" ? "Excel" : "CSV"}${master ? " master" : ""}`}
    </button>
  </form>;
}

export default function ProspectExportButton({ viewerId, workspaceId, workspaceName, prospectIds }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const labelId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return <>
    <button type="button" disabled={!viewerId || !workspaceId} onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">
      <Download size={16} aria-hidden="true" />Export prospects
    </button>
    <dialog ref={dialog} aria-labelledby={labelId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}
      className="m-auto max-h-[90dvh] w-[min(1000px,94vw)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/40 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id={labelId} className="text-xl font-bold">Export Top Prospects</h2>
        <button type="button" aria-label="Close export" onClick={() => setOpen(false)} className="rounded-lg border p-2"><X size={20} /></button>
      </div>
      {open && <ProspectExportForm key={`${viewerId}:${workspaceId}`} viewerId={viewerId} ownerIds={[String(workspaceId)]}
        workspaceName={workspaceName} prospectIds={prospectIds.map(String)} />}
    </dialog>
  </>;
}
