"use client";

import { useEffect, useState } from "react";
import { ProspectExportForm } from "@/components/ProspectExport";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";
import { useWorkspaceLabels } from "@/components/WorkspaceTerminology";

const selectionButton = "min-h-11 rounded-lg px-2 py-2 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

export default function ProspectExportsPage() {
  const labels = useWorkspaceLabels();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/prospects/export", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load workspaces.");
      setData(payload);
    }).catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [attempt]);
  const searchTerm = search.trim().toLowerCase();
  const visible = (data?.users || []).filter((u) => `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(searchTerm));
  const hiddenSelectionCount = selected.filter((id) => !visible.some((u) => String(u.id) === id)).length;
  const activeCount = (data?.users || []).filter((u) => selected.includes(String(u.id))).reduce((sum, u) => sum + u.active_count, 0);
  return <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 text-gray-900 sm:px-8">
    <WorkflowReturnLink href="/" />
    <header>
      <p className="mb-2 break-words text-sm font-semibold uppercase tracking-wide text-gray-500">{labels.advancement_services}</p>
      <h1 className="text-3xl font-bold">Top Prospect Exports</h1>
      <p className="mt-2 text-gray-600">Build one master workbook from the workspaces you choose. Each prospect and opportunity remains labeled by workspace.</p>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
      <p>{error}</p><button className="mt-2 underline" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
    </div>}
    {!data && !error && <p role="status">Loading available workspaces...</p>}
    {data && <div className="grid items-start gap-6 xl:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
      <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">1. Choose workspaces</h2>
        <p role="status" className="mt-2 text-sm text-gray-600">{selected.length} selected / {activeCount} active prospects</p>
        <label htmlFor="export-mgo-search" className="mt-4 block text-sm font-semibold">Find a workspace</label>
        <input id="export-mgo-search" type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2" />
        <div className="my-3 flex flex-wrap gap-2 text-sm font-semibold text-indigo-700">
          <button className={selectionButton} disabled={!visible.length} onClick={() => setSelected((current) => [...new Set([...current, ...visible.map((u) => String(u.id))])])}>Select all shown</button>
          <button className={selectionButton} disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button>
          {search && <button className={selectionButton} onClick={() => setSearch("")}>Clear search</button>}
        </div>
        {hiddenSelectionCount > 0 && <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {hiddenSelectionCount} selected {hiddenSelectionCount === 1 ? "workspace is" : "workspaces are"} hidden by this search and will still be exported. Clear search to review all selections.
        </p>}
        <div className="max-h-[480px] space-y-2 overflow-y-auto">
          {visible.map((user) => <label key={user.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
            <input type="checkbox" className="mt-1" checked={selected.includes(String(user.id))}
              onChange={(e) => setSelected((current) => e.target.checked ? [...current, String(user.id)] : current.filter((id) => id !== String(user.id)))} />
            <span className="min-w-0 break-words"><span className="block font-semibold">{user.name || user.email}</span>
              <span className="block break-words text-sm text-gray-500">{user.email}</span>
              <span className="block text-sm text-gray-600">{user.active_count} active prospects</span>
            </span>
          </label>)}
          {!visible.length && <p className="text-sm text-gray-600">{data.users?.length ? "No workspaces match this search. Clear search to see all available workspaces." : "No active workspaces are available to export."}</p>}
        </div>
        <p className="mt-3 break-words text-xs text-gray-500">Includes active users with the {labels.mgo} role. These counts reflect when this page loaded; the export reads saved records again.</p>
      </section>
      <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">2. Choose export options</h2>
        <ProspectExportForm viewerId={data.viewerId} ownerIds={selected} master />
      </section>
    </div>}
  </main>;
}
