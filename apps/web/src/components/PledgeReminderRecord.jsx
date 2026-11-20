import { useEffect, useRef, useState } from "react";

const button = "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50";
const input = "mt-1 block w-full rounded-lg border border-gray-300 p-2 font-normal";
export default function PledgeReminderRecord({ snapshotId }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [sentDate, setSentDate] = useState("");
  const [actionId, setActionId] = useState(""), [attempted, setAttempted] = useState(false);
  const flight = useRef(false), mounted = useRef(true), controller = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function request(operation = null) {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError("");
    if (operation === "record") setAttempted(true);
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 85000);
    try {
      const response = await fetch(`/api/pledge-payments/reminders/sent${operation ? "" : `?snapshotId=${encodeURIComponent(snapshotId)}`}`, {
        method: operation ? "POST" : "GET", signal: abort.signal,
        ...(operation ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId, operation,
          ...(operation === "record" ? { confirm: confirmed, sentDate } : { actionId: data?.receipt?.actionId || actionId }) }) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Saved status could not be confirmed.");
      if (!mounted.current) return;
      if (operation) {
        if (!result.receipt || !["processing", "review", "saved"].includes(result.receipt.state)) throw new Error("Reload saved status before continuing.");
        setData(current => ({ ...current, receipt: result.receipt })); setConfirmed(false);
      } else {
        if (result.reminder?.snapshotId !== snapshotId) throw new Error("The saved reminder did not match. No action was submitted.");
        setData(result); setSentDate(current => current || result.today); setAttempted(false); setConfirmed(false);
      }
    } catch (error) {
      if (mounted.current) setError(operation === "record"
        ? "The result was not confirmed. Reload saved status before doing anything else. Do not create another NXT action or resend the email."
        : abort.signal.aborted ? "The check took too long. Reload saved status when ready; nothing was resent." : error.message);
    } finally { clearTimeout(timer); flight.current = false; if (mounted.current) setBusy(false); }
  }
  const receipt = data?.receipt, reminder = data?.reminder;
  return <section className="rounded-xl border border-emerald-200 bg-white p-4">
    <button className={button} type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (!open && !data) request(); }}>Record reminder sent in NXT</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm">Only after you sent the email yourself with the matching PDF attached. This creates a completed Email / Stewardship action, not another email, payment, appeal or MGO assignment.</p>
      {error && <p role="alert" className="text-sm text-amber-900">{error}</p>}
      {busy && <p role="status">Checking or saving status...</p>}
      {reminder && <p className="text-sm">{reminder.name} / Pledge {reminder.lookupId} / Letter date {reminder.letterDate}<br />To: {reminder.email}<br />Saved amount due: {(reminder.amountDueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>}
      {receipt ? <>
        <p role="status" className="text-sm font-semibold">{receipt.message}</p>
        {receipt.actionId && <p className="text-sm">NXT action ID: {receipt.actionId} / Sending date: {receipt.sentDate}</p>}
        {receipt.otherStaff && <p className="text-sm">Another staff member has already recorded or started recording this reminder. Ask them to check their saved status.</p>}
        {receipt.state !== "saved" && !receipt.otherStaff && <>
          {!receipt.actionId && <label className="block text-sm">Existing NXT action system record ID<input className={input} value={actionId} disabled={busy} inputMode="numeric" onChange={event => setActionId(event.target.value)} /></label>}
          <button className={button} disabled={busy || !/^[1-9]\d*$/.test(receipt.actionId || actionId)} onClick={() => request("verify")}>Verify existing NXT action only</button>
          <p className="text-xs">Verification only reads the existing action. It never creates, edits or resends anything.</p>
        </>}
      </> : reminder && !attempted && <>
        <label className="block text-sm font-semibold">Actual sending date<input className={input} type="date" min={reminder.preparedOn} max={data.today} value={sentDate} disabled={busy} onChange={event => { setSentDate(event.target.value); setConfirmed(false); }} /></label>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>I sent this reminder to the recipient shown, with the matching PDF attached. Record it in NXT as staff-confirmed, not delivery-verified.</span></label>
        <button className={button} disabled={busy || !confirmed || !sentDate || sentDate < reminder.preparedOn || sentDate > data.today} onClick={() => request("record")}>I sent this - record in NXT</button>
      </>}
      <button className={button} disabled={busy} onClick={() => request()}>Reload saved status</button>
    </div>}
  </section>;
}
