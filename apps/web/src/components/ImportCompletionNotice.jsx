import { canFinishImportWithoutSending, isImportVerificationComplete } from "@/utils/importCompletion";

export default function ImportCompletionNotice({ row, busy, reviewer, onVerify }) {
  const complete = row.status === "Applied";
  const verified = isImportVerificationComplete(row);
  const canVerify = canFinishImportWithoutSending(row);
  return (
    <section className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Finish import without resending">
      <h3 className="font-bold text-sky-900">
        {complete ? "Import complete" : "Already sent to NXT? Verify without resending"}
      </h3>
      <p className="text-sm text-sky-900">
        {complete
          ? verified ? "The requested details were verified in NXT. Nothing more needs to be sent for this row." : "This row is imported. You can check its saved details against NXT without sending them again."
          : "Some changes were already attempted. If the record is correct in NXT, verify every requested detail and primary setting to finish this row and move on. This only reads NXT; it never sends changes."}
      </p>
      <p className="text-sm text-slate-600">The original import plan and send results remain below as history, not a new request to send.</p>
      {reviewer && canVerify ? (
        <div>
          <button type="button" disabled={busy} onClick={onVerify}
            className="rounded-full bg-sky-800 px-4 py-2 font-bold text-white disabled:cursor-wait disabled:opacity-60">
            {busy ? "Checking NXT..." : complete ? "Check NXT again (read-only)" : "Verify in NXT and finish"}
          </button>
        </div>
      ) : !complete ? <p className="text-sm text-sky-900">Verification-only completion is unavailable while a send is active or its target is unresolved. Reload the saved run when it finishes.</p> : null}
    </section>
  );
}
