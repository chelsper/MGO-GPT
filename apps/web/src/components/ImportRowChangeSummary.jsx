import {
  importReviewOutcome,
  newRecordRequestedChanges,
} from "@/utils/importReviewOverview";
import { hasImportWriteHistory } from "@/utils/importWriteResults";

export default function ImportRowChangeSummary({ row, formatWrite, dirty }) {
  const history = hasImportWriteHistory(row);
  const requested = newRecordRequestedChanges(row);
  const lines = requested.length
    ? requested
    : (row.writePlan || []).map(formatWrite).filter(Boolean);
  return (
    <section
      id={`constituency-import-row-${row.id}-staged-writes`}
      aria-label="Record change summary"
      className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2"
    >
      <p className="text-sm font-bold text-slate-900">
        {importReviewOutcome(row)}
      </p>
      <h4 className="text-sm font-semibold text-slate-700">
        {history
          ? "Original import plan (history)"
          : requested.length
            ? "Requested for this new record"
            : "Changes prepared for review"}
      </h4>
      {dirty && !history && (
        <p className="text-sm text-amber-900">
          Unsaved edits are not reflected here yet. Save your review to rebuild
          this plan.
        </p>
      )}
      {lines.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 break-words">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">
          {history
            ? "No additional field changes are queued here. See the saved outcome below."
            : row.status === "Skipped"
              ? "This record is not selected for sending."
              : "No changes are prepared yet. Resolve the record or load its NXT details below."}
        </p>
      )}
      <p className="text-sm text-slate-600">
        {history
          ? "Previous attempts are retained as history, not queued to send again. Use the saved results and recovery controls below."
          : requested.length
            ? "These are requested values, not completed changes. Duplicate checks and field validation still apply; held fields are not silently approved."
            : "Only prepared changes are listed. Matching-only values are not contact updates. Review choices below before sending."}
      </p>
    </section>
  );
}
