import { useState } from "react";
import { validateNewRecordContacts } from "@/utils/newConstituentImport";

const buttonClass = "min-h-11 rounded-full border border-emerald-700 bg-white px-4 py-2 font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

export default function ImportContactRecovery({ run, rows, disabled, onOpen }) {
  const [saved, setSaved] = useState(null);
  const [selected, setSelected] = useState([]);
  const [defaults, setDefaults] = useState({ emailType: "", phoneType: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = disabled || busy;
  const sourceRunId = run.contactRecoverySourceRunId || rows.find((row) => row.contactRecovery)?.contactRecovery.sourceRunId;
  const show = sourceRunId || rows.some((row) => row.createdBlackbaudConstituentId || row.quickCreateStatus === "uncertain");
  if (!show) return null;

  async function check() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/constituency-import/runs/${run.id}/contact-recovery`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.error || "Could not load saved contacts.");
      setSaved(payload.rows);
      setSelected(payload.rows.filter((row) => row.hasOmittedContacts && !row.recoveryRunId && !row.blockers.length).map((row) => row.sourceRowId));
    } catch (error) {
      setError(error.message || "Could not load saved contacts. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function validation(row) {
    if (row.blockers.length) return row.blockers.join(" ");
    try {
      validateNewRecordContacts({
        emailUpdates: row.emailUpdates.map((value) => ({ ...value, type: value.type || defaults.emailType.trim() })),
        phoneUpdates: row.phoneUpdates.map((value) => ({ ...value, type: value.type || defaults.phoneType.trim() })),
      });
      return "";
    } catch (error) {
      return error.message;
    }
  }

  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/constituency-import/runs/${run.id}/contact-recovery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: selected, defaults, confirmed: true }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.runId) throw new Error(payload.error || "Could not prepare the correction.");
      const opened = await onOpen(payload.runId, { message: "Contact correction ready for review. No NXT records have changed." });
      if (!opened) throw new Error("The correction was saved. Check saved contacts again to reopen it.");
    } catch (error) {
      setError(error.message || "Check saved contacts again before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return <section id="import-contact-recovery" tabIndex={-1} className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" aria-label="Complete missing contact information">
    <h3 className="font-bold text-slate-900">{sourceRunId ? "Contact correction" : "Missing email addresses or phone numbers?"}</h3>
    <p className="text-sm text-slate-700">{sourceRunId
      ? `This update-only batch completes contacts omitted from import #${sourceRunId}. It uses the IDs already created, not a new constituent search. Review the contacts and primary settings below before sending.`
      : "Recover omitted email and phone fields from the saved upload. There is no need to upload again or copy the newly created IDs."}</p>
    {sourceRunId ? <button type="button" className={buttonClass} disabled={locked} onClick={() => onOpen(sourceRunId)}>Back to original import</button> : <>
      <button type="button" className={buttonClass} disabled={locked} onClick={check}>
        {busy ? "Working..." : saved ? "Check saved contacts again" : "Complete missing contact information"}
      </button>
      {saved && <>
        <p className="text-sm text-slate-700">Only omitted fields go into a correction. Contacts already staged or attempted stay in the original review and verification flow. Neither checking nor preparing sends anything to NXT.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[["emailType", "Email type", "emailUpdates"], ["phoneType", "Phone type", "phoneUpdates"]].filter(([, , key]) => saved.some((row) => !row.recoveryRunId && row[key].some((value) => !value.type))).map(([key, label]) =>
            <label key={key} className="grid gap-1 text-sm font-semibold text-slate-800">{label} for blank types
              <input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" value={defaults[key]} maxLength={100} disabled={locked} onChange={(event) => setDefaults({ ...defaults, [key]: event.target.value })} />
              <span className="font-normal text-slate-600">Enter the NXT type. Existing file values are kept.</span>
            </label>)}
        </div>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {saved.map((row) => {
            const problem = validation(row);
            return <div key={row.sourceRowId} className="rounded-xl border border-emerald-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 font-semibold">
                  {!row.recoveryRunId && row.hasOmittedContacts && <input type="checkbox" aria-label={`Include ${row.name}`} disabled={locked || row.blockers.length > 0} checked={selected.includes(row.sourceRowId)}
                    onChange={(event) => setSelected((prior) => event.target.checked ? [...prior, row.sourceRowId] : prior.filter((value) => value !== row.sourceRowId))} />}
                  {row.name}
                </label>
                {row.recoveryRunId && <button type="button" className={buttonClass} disabled={locked} onClick={() => onOpen(row.recoveryRunId)}>Open saved correction #{row.recoveryRunId}</button>}
              </div>
              <p className="mt-1 text-slate-600">{row.targetId ? `Created record ID ${row.targetId}` : "Creation needs verification"}</p>
              {[...row.emailUpdates.map((value) => ({ ...value, type: value.type || defaults.emailType.trim(), label: "Email", value: value.address })), ...row.phoneUpdates.map((value) => ({ ...value, type: value.type || defaults.phoneType.trim(), label: "Phone", value: value.number }))].map((value, index) =>
                <p key={index} className="mt-1 break-words">{value.label}: {value.value}{value.type ? ` (${value.type})` : " (type needed)"}{value.makePrimary === true ? " - make primary" : " - do not change the current primary"}</p>)}
              {row.stagedKinds.length > 0 && <p className="mt-1 text-slate-600">{row.stagedKinds.join(" and ")} already included in the original plan. Use its saved review, resume, or verification controls.</p>}
              {(row.stagedKinds.length > 0 || row.blockers.length > 0) && <button type="button" className={`${buttonClass} mt-2`} disabled={locked}
                onClick={() => onOpen(run.id, { focusRowId: row.sourceRowId })}>Review original row {row.rowNumber}</button>}
              {!row.hasOmittedContacts && !row.stagedKinds.length && <p className="mt-1 text-slate-600">No mapped email or phone values were saved for recovery.</p>}
              {problem && !row.recoveryRunId && <p className="mt-1 text-amber-800">{problem}</p>}
            </div>;
          })}
          {!saved.length && <p>No created records are available for contact recovery in this run.</p>}
        </div>
        <p className="text-sm text-slate-700">Primary flags from your file are retained. Existing contacts are not deleted. Blank primary flags leave the current primary unchanged.</p>
        <button type="button" className={`${buttonClass} !bg-emerald-800 !text-white`} onClick={prepare}
          disabled={locked || !selected.length || saved.some((row) => selected.includes(row.sourceRowId) && validation(row))}>
          Prepare contact correction ({selected.length})
        </button>
      </>}
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
