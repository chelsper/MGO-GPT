"use client";

import { useEffect, useState } from "react";

export default function QueueImportLink({ onOpen, loadedRunId, loading }) {
  const [runId, setRunId] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("queueRun") || "";
    if (/^[1-9]\d{0,17}$/.test(value)) setRunId(value);
  }, []);
  if (!runId) return null;
  const loaded = String(loadedRunId || "") === runId;
  return <aside className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
    <p className="mb-3">From the Work Queue: import batch #{runId}. {loaded ? "This batch is loaded below." : "Open this saved batch to continue its review, including older batches outside the recent list."}</p>
    {!loaded && <button type="button" disabled={loading} onClick={() => onOpen(runId)} className="mr-4 rounded-lg border border-indigo-300 bg-white px-4 py-2 font-semibold disabled:opacity-50">{loading ? "Opening batch..." : `Open saved batch #${runId}`}</button>}
    <a href="/submissions" className="font-semibold underline">Return to Work Queue</a>
  </aside>;
}
