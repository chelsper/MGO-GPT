import { useEffect, useRef, useState } from "react";
import PledgeReminderRecord from "./PledgeReminderRecord";

export default function PledgeReminderHistory() {
  const [open, setOpen] = useState(false), [rows, setRows] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const flight = useRef(false), active = useRef(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);
  async function load() {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError(""); const controller = new AbortController(); active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/pledge-payments/reminders/sent", { signal: controller.signal });
      const data = await response.json(); if (!response.ok || !Array.isArray(data.reminders)) throw new Error("Could not load your saved reminders. Nothing was sent or recorded.");
      if (mounted.current) setRows(data.reminders);
    } catch { if (mounted.current) setError("Could not load your saved reminders. Nothing was sent or recorded."); }
    finally { clearTimeout(timeout); flight.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="rounded-xl border border-gray-200 bg-white p-4">
    <button className="min-h-11 font-semibold text-emerald-900" aria-expanded={open} onClick={() => { setOpen(!open); if (!open && rows === null) load(); }}>Saved pledge reminders and NXT logging</button>
    {open && <div className="mt-3 space-y-3"><p className="text-sm">Your latest 50 prepared PDF/email reminders. Prepared does not mean sent. Read saved details or record an email you actually sent; this does not refresh NXT balances.</p>
      <button className="min-h-11 rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={load}>{busy ? "Loading saved reminders..." : "Reload saved reminders"}</button>
      {error && <p role="alert">{error}</p>}{rows?.length === 0 && <p>No PDF/email reminders have been saved by your account yet.</p>}
      {rows?.map(row => <div key={row.snapshotId}><h3 className="mb-2 font-semibold">{row.name} / Pledge {row.lookupId} / Letter date {row.letterDate}</h3><PledgeReminderRecord snapshotId={row.snapshotId} /></div>)}
    </div>}
  </section>;
}
