"use client";

import { useEffect, useState } from "react";

export default function QueueImportLink({ onOpen, loadedRunId, loadedRowId, loading }) {
  const [runId, setRunId] = useState("");
  const [rowId, setRowId] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("queueRun") || "";
    if (/^[1-9]\d{0,17}$/.test(value)) setRunId(value);
    const row = new URLSearchParams(window.location.search).get("queueRow") || "";
    if (/^[1-9]\d{0,17}$/.test(row)) setRowId(row);
  }, []);
  if (!runId) return null;
  const loaded = String(loadedRunId || "") === runId && (!rowId || String(loadedRowId || "") === rowId);
  return <aside className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
    <p className="mb-3">{rowId ? `Saved import batch #${runId}, row ${rowId}.` : `Saved import batch #${runId}.`} {loaded ? "This batch is loaded below." : "Open this saved batch to continue its review, including older batches outside the recent list. Nothing is sent to NXT by opening a saved batch."}</p>
    {!loaded && <button type="button" disabled={loading} onClick={() => rowId ? onOpen(runId, { focusRowId: rowId, preload: false }) : onOpen(runId)} className="mr-4 rounded-lg border border-indigo-300 bg-white px-4 py-2 font-semibold disabled:opacity-50">{loading ? "Opening batch..." : rowId ? `Open saved row #${rowId}` : `Open saved batch #${runId}`}</button>}
  </aside>;
}
