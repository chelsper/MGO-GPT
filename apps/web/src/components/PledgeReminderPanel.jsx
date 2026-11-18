import { useEffect, useRef, useState } from "react";
import { formatCalendarDate, calendarDate } from "@/utils/prospectActivity";
import { PLEDGE_REMINDER_LIMIT, REMINDER_FIELDS, pledgeReminderIssue, pledgeReminderDraftIssue, pledgeReminderCsv } from "@/utils/pledgeReminders";
import { pledgeMoney } from "./PledgePaymentList";

const button = "min-h-11 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50";
export default function PledgeReminderPanel({ source, onClose }) {
  const [selected, setSelected] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [letterDate, setLetterDate] = useState(source.today);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const flight = useRef(false), stop = useRef(false), active = useRef(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; active.current?.abort(); }; }, []);
  useEffect(() => {
    if (!Object.keys(drafts).length || downloaded) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts, downloaded]);
  const selectedRows = source.rows.filter(row => selected.includes(row.id));
  const prepared = selectedRows.map(row => drafts[row.id]).filter(Boolean);
  const ready = prepared.filter(draft => !pledgeReminderDraftIssue(draft));
  const pending = selectedRows.filter(row => !drafts[row.id]);
  const eligible = source.rows.filter(row => !pledgeReminderIssue(row));
  function changed() { setReviewed(false); setDownloaded(false); setNotice(""); }
  function toggle(id) { changed(); setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  async function request(operation, rows) {
    const controller = new AbortController(); active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/pledge-payments/reminders", { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, jobId: source.jobId, view: source.view, today: source.today,
          pledges: rows.map(row => ({ id: row.id, refreshedAt: row.refreshedAt })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare reminders. Your current drafts are kept.");
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("The read took too long. Prepared drafts are kept; continue when ready. Nothing was sent or changed in NXT.");
      throw error;
    } finally { clearTimeout(timeout); if (active.current === controller) active.current = null; }
  }
  async function prepare() {
    if (flight.current || !pending.length) return;
    flight.current = true; stop.current = false; setBusy("prepare"); setError(""); changed();
    try {
      for (const [index, row] of pending.entries()) {
        if (stop.current || !mounted.current) break;
        setNotice(`Checking mailing details ${index + 1} of ${pending.length}...`);
        const { draft } = await request("prepare", [row]);
        if (!draft || draft.pledge?.id !== row.id || draft.pledge.refreshedAt !== row.refreshedAt) throw new Error("The returned reminder did not match this pledge. Reload the worklist.");
        if (mounted.current) setDrafts(current => ({ ...current, [row.id]: draft }));
      }
      if (mounted.current) setNotice(stop.current ? "Preparation paused. Drafts are kept here; continue when ready." : "Mailing details prepared. Review the reminders below before exporting.");
    } catch (error) { if (mounted.current) { setError(error.message); setNotice(""); } }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }
  async function download() {
    if (flight.current || !reviewed || !ready.length || pending.length || calendarDate(letterDate) !== letterDate) return;
    flight.current = true; setBusy("export"); setError("");
    try {
      const result = await request("check", ready.map(d => d.pledge));
      if (!result.verified) throw new Error("The saved pledge amounts could not be verified. Reload the worklist.");
      if (!mounted.current) return;
      const csv = pledgeReminderCsv(ready, letterDate, source.today);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `pledge-reminders-${source.view}-${letterDate}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      const revoke = URL.revokeObjectURL.bind(URL); setTimeout(() => revoke(url), 1000);
      setDownloaded(true); setNotice(`${ready.length} reminder rows exported. Nothing was sent, marked mailed, or changed in NXT.`);
    } catch (error) { if (mounted.current) setError(error.message); }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }
  function close() {
    if (!downloaded && Object.keys(drafts).length && !window.confirm("Close these reminder drafts? They are kept only on this page; download the CSV first if you need them.")) return;
    onClose();
  }
  return <section aria-label="Pledge reminder CSV" className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Create pledge reminder CSV</h2>
      <p className="mt-1 text-sm">{source.view === "pastDue" ? "Past Due: amount due includes all unpaid installments through today." : "Upcoming: amount due covers installments on the next due date only; past-due installments are not included."} One reminder row per pledge, not per household.</p></div>
      <button className={button} disabled={busy} onClick={close}>Close reminders</button></div>
    <p className="text-sm">Amounts use verified saved pledge data as of {formatCalendarDate(source.today)}, not a new balance check. Refresh the worklist before starting if payments have changed. Preparation reads the selected recipients' NXT mailing details only. No appeals, emails or NXT writes are made.</p>
    <label className="block text-sm font-semibold">Letter date<input type="date" value={letterDate} disabled={busy} onChange={e => { changed(); setLetterDate(e.target.value); }} className="ml-3 rounded-lg border border-gray-300 bg-white p-2" /></label>
    <div className="flex flex-wrap gap-3"><button className={button} disabled={busy || !eligible.length} onClick={() => { changed(); setSelected(eligible.slice(0, PLEDGE_REMINDER_LIMIT).map(row => row.id)); }}>Select up to {PLEDGE_REMINDER_LIMIT} eligible pledges</button>
      <button className={button} disabled={busy || !selected.length} onClick={() => { changed(); setSelected([]); }}>Clear reminder selection</button><span className="self-center text-sm">{selected.length} selected</span></div>
    <ul className="max-h-72 divide-y divide-gray-200 overflow-auto rounded-xl border border-gray-200 bg-white">
      {source.rows.map(row => { const issue = pledgeReminderIssue(row); return <li key={row.id} className="p-3"><label className="flex items-start gap-3">
        <input type="checkbox" checked={selected.includes(row.id)} disabled={busy || Boolean(issue) || (!selected.includes(row.id) && selected.length >= PLEDGE_REMINDER_LIMIT)} onChange={() => toggle(row.id)} aria-label={`Include pledge ${row.lookupId} for ${row.name}`} className="mt-1 h-4 w-4" />
        <span><strong>{row.name}</strong> / Pledge {row.lookupId}<span className="block text-sm">{row.fundDescriptions?.join("; ")} / Due {pledgeMoney(row.amountDueCents)} / {formatCalendarDate(row.dueDate)}</span><span className="block text-xs text-gray-600">Pledge checked {row.refreshedAt ? new Date(row.refreshedAt).toLocaleString() : "not available"}</span>{issue && <span className="block text-sm text-amber-900">{issue}</span>}</span>
      </label></li>; })}
    </ul>
    <div className="flex flex-wrap gap-3"><button className={`${button} !bg-indigo-600 !text-white`} disabled={busy || !pending.length} onClick={prepare}>{prepared.length ? "Continue reminder preparation" : "Prepare selected reminders"}</button>
      {busy === "prepare" && <button className={button} onClick={() => { stop.current = true; }}>Pause after current read</button>}</div>
    {notice && <p role="status" className="text-sm">{notice}</p>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {prepared.length > 0 && <><h3 className="font-bold">Review reminder details</h3><p className="text-sm">{ready.length} ready / {selected.length - ready.length} not included yet. Correct missing details below or clear that pledge's checkbox. Name and address edits affect this CSV only. These drafts are not saved after leaving this page.</p>
      {prepared.map(draft => { const issue = pledgeReminderDraftIssue(draft); return <details key={draft.pledge.id} className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold">{draft.pledge.name} / Pledge {draft.pledge.lookupId} / {issue ? "Needs review" : "Ready for review"}</summary>
        <p className="mt-3 text-sm">Pledged: {pledgeMoney(draft.pledge.totalCents)} / Paid: {pledgeMoney(draft.pledge.paidToDateCents)} / Amount due: {pledgeMoney(draft.pledge.amountDueCents)}</p>
        {issue && <p className="mt-2 text-sm text-amber-900">{issue}</p>}{draft.warnings.map(warning => <p key={warning} className="mt-2 text-sm text-amber-900">{warning}</p>)}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{REMINDER_FIELDS.map(field => <label key={field} className="text-sm font-semibold">{field.replaceAll("_", " ")}<textarea rows={field === "Addressee" || field === "Address_Line_2" ? 2 : 1} maxLength={500} value={draft.fields[field]} disabled={busy || Boolean(draft.blocked)} onChange={e => { changed(); const value = e.target.value; setDrafts(current => ({ ...current, [draft.pledge.id]: { ...current[draft.pledge.id], fields: { ...current[draft.pledge.id].fields, [field]: value } } })); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2 font-normal" /></label>)}</div>
      </details>; })}
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} className="mt-1 h-4 w-4" /><span>I reviewed the included recipients, addresses and saved pledge amounts, and will verify the template's date and payment instructions before mailing.</span></label>
      <button className={`${button} !bg-indigo-600 !text-white`} disabled={busy || !reviewed || !ready.length || pending.length > 0 || calendarDate(letterDate) !== letterDate} onClick={download}>Download {ready.length} pledge reminders CSV</button>
      <p className="text-xs text-gray-600">Merge using Addressee, Address_Line_1, Address_Line_2, City, State, Zip, Fund, Pledge_Amount, Amount_Paid_to_Date and Installment_Amount. Use Letter_Date instead of a typed date. Review Word's merged letters before printing; exporting does not record delivery.</p>
    </>}
  </section>;
}
