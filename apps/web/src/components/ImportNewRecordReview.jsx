import { useState } from "react";
import { canChangeImportMatch, canReviewNewImportRecord, getReviewedNonmatchIds, getSelectedImportMatchId, getImportLocalDuplicate } from "@/utils/importMatchReview";

export default function ImportNewRecordReview({ row, importIntent, busy, onAction, onCorrectCsv, onReviewBatch }) {
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  if (!canReviewNewImportRecord(row)) {
    if (row.status === "Conflict" && canChangeImportMatch(row) && !getSelectedImportMatchId(row)) {
      return <section aria-label="Resolve unmatched constituent" className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-bold">Correct the source conflict first</h3>
        <p className="my-2 text-sm">This row has conflicting source values, not a confirmed NXT match. Correct the fields listed in its review requirements and prepare a new preview.</p>
        <button type="button" disabled={busy} onClick={onCorrectCsv} className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold">Choose corrected CSV</button>
      </section>;
    }
    return null;
  }
  const review = row.newRecordReview;
  const hasRejected = getReviewedNonmatchIds(row).length > 0;
  const clear = review?.status === "clear" && Date.now() - Date.parse(review.checkedAt) <= 30 * 60 * 1000;
  const allowedIntent = ["new", "mixed"].includes(importIntent);
  const disabled = busy || Boolean(working);
  const button = "rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50";

  async function run(mode) {
    setWorking(mode);
    setError("");
    try {
      await onAction(mode, { reviewToken: review?.token, reviewNote: note, confirmed });
      setConfirmed(false);
    } catch (failure) {
      setConfirmed(false);
      setError(failure.message || "Reload this row and retry checks before continuing.");
    } finally { setWorking(""); }
  }

  return <section className="my-4 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Resolve unmatched constituent">
    <h3 className="font-bold text-blue-950">Is this a new constituent?</h3>
    <p className="mt-2 text-sm text-slate-700">Select a suggested match above, or mark unrelated suggestions Not a match. Then run complete duplicate checks before confirming a new record. Checking does not create anything.</p>
    {!allowedIntent ? <>
      <p role="status" className="mt-3 text-sm font-bold">This run only updates existing records. To create new people, prepare a New or Mixed import.</p>
      <button type="button" className={`${button} mt-3`} disabled={disabled} onClick={onCorrectCsv}>Choose CSV for New or Mixed import</button>
    </> : <>
      {review?.message && <p role="status" className="mt-3 text-sm font-bold text-slate-800">{review.message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={disabled} onClick={() => run("review_new_check")}>{working === "review_new_check" ? "Checking NXT duplicates..." : review ? "Retry duplicate checks" : "Check for duplicates"}</button>
        {(review?.nextAction === "correct_csv" || error) && <button type="button" className={button} disabled={disabled} onClick={onCorrectCsv}>Choose corrected CSV</button>}
        {review?.nextAction === "review_batch" && !getImportLocalDuplicate(row) && <button type="button" className={button} disabled={disabled} onClick={onReviewBatch}>Review batch rows</button>}
      </div>
      {clear && <div className="mt-4 space-y-3 border-t border-blue-200 pt-4">
        <p className="text-sm text-slate-700">Create one individual with fresh NXT identifiers and the saved table-based name formats. Original CSV IDs remain in the audit only. Contacts, constituencies, education, and relationships remain staged for separate review.</p>
        {hasRejected && <label className="block text-sm font-bold">Why are the rejected matches different people?
          <textarea className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 font-normal" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Explain what you compared (at least 10 characters)." />
        </label>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the matches and confirm this is a new, separate constituent.</label>
        <button type="button" disabled={disabled || !confirmed || (hasRejected && note.trim().length < 10)} onClick={() => run("reviewed_new")} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{working === "reviewed_new" ? "Confirming and creating..." : "Confirm as new constituent"}</button>
        <p className="text-xs text-slate-600">Checks run again before creation. Any new match or failed lookup stops creation.</p>
      </div>}
    </>}
  </section>;
}
