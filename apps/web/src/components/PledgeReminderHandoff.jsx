import { useEffect, useRef, useState } from "react";
import { calendarDate } from "@/utils/prospectActivity";
import { HANDOFF_LIFETIME_MS, reminderEmailLinks } from "@/utils/pledgeReminderHandoff";
import PledgeReminderRecord from "./PledgeReminderRecord";

const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50";
const input = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 font-normal";

export default function PledgeReminderHandoff({ drafts, source, letterDate, disabled, onBusy }) {
  const [choice, setChoice] = useState("");
  const draft = drafts.find(item => item.pledge.id === choice) || drafts[0];
  if (!draft) return null;
  // Editing names, addresses, dates, or the selected pledge invalidates the prepared handoff.
  const identity = JSON.stringify([source.jobId, source.today, source.view, letterDate, draft]);
  return <details className="rounded-xl border border-emerald-300 bg-white p-4">
    <summary className="cursor-pointer font-semibold text-emerald-900">Prepare a PDF and Outlook email</summary>
    <p className="mt-3 text-sm">One pledge at a time. Download the PDF, open the email, and attach the file yourself. Nothing is sent or recorded in NXT by this step. CSV export below is unchanged.</p>
    <label className="mt-3 block text-sm font-semibold">Reminder recipient
      <select className={input} value={draft.pledge.id} disabled={disabled} onChange={event => setChoice(event.target.value)}>
        {drafts.map(item => <option key={item.pledge.id} value={item.pledge.id}>{item.pledge.name} / Pledge {item.pledge.lookupId}</option>)}
      </select>
    </label>
    <SingleHandoff key={identity} draft={draft} source={source} letterDate={letterDate} disabled={disabled} onBusy={onBusy} />
  </details>;
}

function SingleHandoff({ draft, source, letterDate, disabled, onBusy }) {
  const [confirmed, setConfirmed] = useState(false), [working, setWorking] = useState(false);
  const [result, setResult] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [subject, setSubject] = useState(""), [message, setMessage] = useState("");
  const [downloaded, setDownloaded] = useState(false), [now, setNow] = useState(Date.now());
  const flight = useRef(false), controller = useRef(null), mounted = useRef(true), url = useRef(null);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => { mounted.current = false; clearInterval(timer); controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); if (flight.current) onBusy(false); };
  }, []);
  function clearResult() {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null; setResult(null); setDownloaded(false);
  }
  async function prepare() {
    if (flight.current || !confirmed || calendarDate(letterDate) !== letterDate) return;
    flight.current = true; setWorking(true); onBusy(true); setError(""); setNotice(""); clearResult();
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 25000);
    try {
      const response = await fetch("/api/pledge-payments/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ operation: "pdf", confirm: true, jobId: source.jobId, view: source.view, today: source.today, letterDate,
          fields: draft.fields, pledges: [{ id: draft.pledge.id, refreshedAt: draft.pledge.refreshedAt }] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The reminder could not be prepared. Nothing was sent.");
      const item = data.handoff;
      if (!item || item.pledgeId !== draft.pledge.id || item.refreshedAt !== draft.pledge.refreshedAt || item.letterDate !== letterDate ||
        !Number.isFinite(Date.parse(item.checkedAt)) || Math.abs(Date.now() - Date.parse(item.checkedAt)) > HANDOFF_LIFETIME_MS ||
        !/^pledge-reminder-[A-Za-z0-9_-]+\.pdf$/.test(item.filename) || typeof item.pdf !== "string" || item.pdf.length > 4 * 1024 * 1024 ||
        !item.email || typeof item.email.address !== "string" || typeof item.email.reason !== "string" ||
        typeof item.subject !== "string" || typeof item.message !== "string")
        throw new Error("The returned PDF did not match this reminder. Prepare it again; no email was opened.");
      const decoded = atob(item.pdf);
      if (!decoded.startsWith("%PDF-") || !decoded.slice(-1024).includes("%%EOF")) throw new Error("The PDF was incomplete. Prepare it again; no email was opened.");
      if (!mounted.current) return;
      url.current = URL.createObjectURL(new Blob([Uint8Array.from(decoded, char => char.charCodeAt(0))], { type: "application/pdf" }));
      setResult({ ...item, url: url.current }); setSubject(item.subject); setMessage(item.message); setNow(Date.now());
    } catch (error) {
      if (mounted.current) setError(abort.signal.aborted ? "Preparation took too long. Try again when ready. No email or NXT action was created." : error.message);
    } finally {
      clearTimeout(timeout); flight.current = false;
      if (mounted.current) { setWorking(false); onBusy(false); }
    }
  }
  const expired = result && now - Date.parse(result.checkedAt) >= HANDOFF_LIFETIME_MS;
  const links = result && !expired && !result.email.reason ? reminderEmailLinks(result.email.address, subject, message) : null;
  const locked = disabled || working;
  const canOpen = links && downloaded && !locked;
  async function copy() {
    try { await navigator.clipboard.writeText(`To: ${result.email.address}\nSubject: ${subject}\n\n${message}`); if (mounted.current) setNotice("Email text copied. Attach the matching PDF before sending."); }
    catch { if (mounted.current) setNotice("Copy was unavailable. Select the subject and message below and copy them manually."); }
  }
  return <div className="mt-3 space-y-3">
    <p className="text-sm">This PDF uses the letter wording, pledge statement, and JU online-giving link. Bank and stock-transfer instructions remain in your existing Word template. Saved pledge amounts are rechecked, not refreshed from NXT; the primary email and recipient status are checked in NXT.</p>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={locked} onChange={event => { setConfirmed(event.target.checked); clearResult(); }} className="mt-1 h-4 w-4" />
      <span>I checked this recipient's details and saved pledge amounts for the reminder.</span></label>
    <button type="button" className={button} disabled={locked || !confirmed || calendarDate(letterDate) !== letterDate} onClick={prepare}>{working ? "Preparing PDF and email..." : result ? "Prepare again" : "Prepare PDF & email"}</button>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {result && <div className="space-y-3 border-t border-gray-200 pt-4">
      <p role="status" className="font-semibold text-emerald-900">Prepared, not sent</p>
      {expired ? <p role="alert" className="text-sm text-amber-900">This handoff is over 15 minutes old. Prepare again before downloading or opening email. Previously downloaded files and Outlook messages are not updated automatically.</p> : <>
        <a className={button} href={result.url} download={result.filename} onClick={() => setDownloaded(true)}>Download reminder PDF</a>
        <p className="break-all text-xs text-gray-600">Attach this file: {result.filename}</p>
      </>}
      {result.email.reason ? <p role="alert" className="text-sm text-amber-900">{result.email.reason} No email link is available.</p> : <>
        <label className="block text-sm font-semibold">To (primary NXT email)<input className={input} readOnly value={result.email.address} /></label>
        <label className="block text-sm font-semibold">Email subject<input className={input} value={subject} maxLength={160} disabled={locked || expired} onChange={event => setSubject(event.target.value)} /></label>
        <label className="block text-sm font-semibold">Email message<textarea className={input} rows={10} value={message} maxLength={2000} disabled={locked || expired} onChange={event => setMessage(event.target.value)} /></label>
        {!expired && !links && <p role="alert" className="text-sm text-amber-900">Shorten the email and check the subject before opening it. Email links support plain text only.</p>}
        <div className="flex flex-wrap gap-3">
          {canOpen ? <><a className={button} href={links.outlook} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open Outlook on the web</a>
            <a className={button} href={links.desktop}>Open default email app</a></> : <button type="button" className={button} disabled>Open Outlook on the web</button>}
          <button type="button" className={button} disabled={!canOpen} onClick={copy}>Copy email text</button>
        </div>
        <p className="text-sm">{downloaded ? "Attach the downloaded PDF yourself, check the sending account and recipient, then send in Outlook. Reopening the email link may create another draft." : "Download the PDF first to enable the email links."} The desktop link uses your default email app. If Outlook does not populate correctly, copy the email text instead.</p>
        <p className="text-xs text-gray-600">The app cannot tell whether you sent the email. No sent status or NXT action is recorded automatically. If a payment arrives or details change before sending, prepare a new PDF and replace any older attachment yourself.</p>
        {result.recording?.snapshotId ? <PledgeReminderRecord snapshotId={result.recording.snapshotId} />
          : <p className="text-sm text-amber-900">Saved NXT logging is unavailable for this preparation. The PDF and email links still work; no action has been recorded.</p>}
      </>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </div>}
  </div>;
}
