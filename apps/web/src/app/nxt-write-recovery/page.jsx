"use client";

import { useEffect, useState } from "react";

const labels = { processing: "Submission started", review: "Needs verification", created: "NXT ID saved; app completion unconfirmed", complete: "App workflow completed", verified: "Existing NXT record verified" };
export default function NxtWriteRecoveryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState({});
  async function load() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/nxt-write-recovery", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (e) { setError(e.message || "Saved submissions could not be loaded."); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  async function verify(row) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/nxt-write-recovery", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId: row.id, remoteId: row.remoteId || ids[row.id], workspaceId: data.workspace.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(previous => ({ ...previous, receipts: previous.receipts.map(item => item.id === row.id ? result.receipt : item) }));
    } catch (e) { setError(e.message || "Verification could not finish."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <a href="/action-opportunity-update" className="font-semibold text-indigo-700">Back to Log Update</a>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold text-gray-900">Saved NXT submissions</h1>
        <p className="mt-2 text-gray-600">{data?.workspace.name || "Current workspace"}. Check existing actions and opportunities without sending them again.</p></div>
      <button disabled={busy} onClick={load} className="rounded-xl border px-4 py-3 font-semibold disabled:opacity-50">{busy ? "Checking..." : "Reload saved submissions"}</button>
    </header>
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">Verification reads NXT and saves the result here only. It does not repeat app updates, complete reminders, or send email. If app completion was interrupted, ask an administrator to reconcile it separately. Do not change the form to resend the same action or opportunity.</p>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {!data && !error && <p role="status">Loading saved submissions...</p>}
    {data && !data.receipts.length && <p>No protected submissions in this workspace yet. Only submissions made after this safeguard was enabled appear here.</p>}
    {data?.receipts.map(row => <article key={row.id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{row.title}</h2><span className="rounded-full bg-gray-100 px-3 py-1 text-sm">{labels[row.state]}</span></div>
      <p className="text-sm text-gray-600">Submission {row.id} · {row.kind} · {new Date(row.createdAt).toLocaleString()}</p>
      <a href={`https://renxt.blackbaud.com/constituents/${encodeURIComponent(row.constituentId)}`} target="_blank" rel="noreferrer" className="inline-block font-semibold text-indigo-700 underline">Open constituent in NXT (new tab)</a>
      {row.remoteId && <p>NXT {row.kind} ID: {row.remoteId}</p>}
      {!["complete", "verified"].includes(row.state) && <div className="flex flex-wrap items-end gap-3">
        {!row.remoteId && <label className="block text-sm font-semibold">Existing NXT {row.kind} system ID
          <input inputMode="numeric" value={ids[row.id] || ""} onChange={event => setIds({ ...ids, [row.id]: event.target.value })} className="mt-1 block rounded-lg border p-3" />
          <span className="mt-1 block max-w-xl font-normal text-gray-600">No ID was returned. Find the existing record in NXT first. If none can be confirmed, leave this held for administrator review; do not create another.</span>
        </label>}
        <button disabled={busy || !/^[1-9]\d*$/.test(row.remoteId || ids[row.id] || "")} onClick={() => verify(row)} className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Verify existing record only</button>
      </div>}
      {row.state === "verified" && <p role="status" className="text-green-800">Existing NXT record verified. Nothing was resent. App updates and reminders were not changed.</p>}
    </article>)}
    {data?.receipts.length === 100 && <p className="text-sm text-gray-600">Showing up to 100 submissions, unresolved first.</p>}
  </main>;
}
