import { useState } from "react";
import { getImportLocalDuplicate } from "@/utils/importMatchReview";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";

export default function ImportLocalDuplicateDecision({ row, busy, onAction }) {
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const duplicate = getImportLocalDuplicate(row);
  if (!duplicate) return null;
  const review = row.localDuplicateReview;
  const ready = review?.token && review.duplicate?.fingerprint === duplicate.fingerprint && Date.now() - Date.parse(review.checkedAt) <= 30 * 60 * 1000;
  const disabled = busy || working;
  const button = "rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-bold disabled:opacity-50";

  async function run(mode) {
    setWorking(true); setError("");
    try {
      await onAction(mode, { blockerFingerprint: duplicate.fingerprint, reviewToken: review?.token, reviewNote: note, confirmed });
      setConfirmed(false); setNote("");
    } catch (failure) { setConfirmed(false); setError(failure.message || "Reload the comparison and retry."); }
    finally { setWorking(false); }
  }

  return <section aria-label="Review import history hold" className="mt-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
    <h4 className="font-bold">Resolve this import-history hold</h4>
    {duplicate.kind === "unconfirmed_creation" ? <p className="text-sm">The earlier creation has an uncertain outcome. Verify it in NXT first. This hold cannot be dismissed to create another record.</p> : <>
      <p className="text-sm">If this is the same person, use the existing record or skip the extra unsent CSV row. If it is a different person, compare the details and record that decision below. Reviewing a hold does not create or update anything in NXT.</p>
      <button type="button" className={button} disabled={disabled || !duplicate.fingerprint} onClick={() => run("review_local_check")}>{working ? "Working..." : ready ? "Reload comparison" : "Review this hold"}</button>
      {!duplicate.fingerprint && <p className="text-sm">Retry duplicate checks first to load this older hold for review.</p>}
      {ready && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0 break-words rounded-lg bg-white p-3 text-sm">
            <h5 className="font-bold">New constituent from this CSV</h5>
            <p>{row.input?.constituentName || [row.input?.firstName, row.input?.lastName].filter(Boolean).join(" ")}</p>
            <p>{[row.input?.email, row.input?.email2].filter(Boolean).join(" / ")}</p>
            <p>{[row.input?.addressLine1, row.input?.postalCode].filter(Boolean).join(", ")}</p>
            {row.input?.lookupId && <p>CSV Lookup ID: {row.input.lookupId}</p>}
          </div>
          <div className="min-w-0 break-words rounded-lg bg-white p-3 text-sm">
            <h5 className="font-bold">{review.current ? "Current NXT record" : "Other saved CSV row"}</h5>
            <p>{review.current?.name || duplicate.name}</p>
            <p>{review.current ? review.current.email || "No email in the current identity response" : duplicate.email}</p>
            <p>{review.current ? [review.current.address, review.current.postalCode].filter(Boolean).join(", ") : duplicate.address}</p>
            <p>{review.current ? `Current Lookup ID: ${review.current.lookupId}` : duplicate.lookupId ? `CSV Lookup ID: ${duplicate.lookupId}` : "No CSV Lookup ID"}</p>
            {review.current && <a className="font-bold underline" target="_blank" rel="noopener noreferrer" href={buildBlackbaudConstituentProfileUrl(review.current.blackbaudConstituentId)}>Open current NXT record</a>}
          </div>
        </div>
        <label className="block text-sm font-bold">Why is this a different person?
          <textarea disabled={disabled} className="mt-1 block w-full rounded-lg border border-amber-300 bg-white p-3 font-normal" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Explain the identity or contact differences you verified (at least 10 characters)." />
        </label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={disabled} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I compared these records and confirm they are different people.</label>
        <button type="button" className={button} disabled={disabled || !confirmed || note.trim().length < 10} onClick={() => run("review_local_reject")}>Different person - continue checks</button>
      </div>}
    </>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
