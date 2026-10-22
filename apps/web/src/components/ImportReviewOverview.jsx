import { IMPORT_REVIEW_GROUPS } from "@/utils/importReviewOverview";

export default function ImportReviewOverview({
  overview,
  filter,
  onFilter,
  saved,
  busy,
  dirty,
  preparing,
  onReviewExceptions,
  onReviewUpdates,
  onReviewNew,
  onShowAll,
  reviewingOne,
}) {
  const disabled = busy || dirty || preparing;
  return (
    <section
      id="constituency-import-preview-results"
      aria-label="Import overview"
      className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900">
            Your import at a glance
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {overview.total} records. Creating new constituents and sending
            updates remain separate approvals.
          </p>
        </div>
        <p className="text-sm text-slate-600">
          Verified: {overview.verified} of {overview.groups.completed.length}{" "}
          completed
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {IMPORT_REVIEW_GROUPS.map(({ key, label, description }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
            disabled={disabled}
            title={description}
            className={`min-h-24 rounded-xl border p-3 text-left disabled:opacity-60 ${filter === key ? "border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700" : "border-slate-200 bg-slate-50 hover:bg-white"}`}
          >
            <span className="block text-sm font-semibold text-slate-700">
              {label}
            </span>
            <span className="mt-1 block text-2xl font-bold text-slate-900">
              {overview.groups[key].length}
            </span>
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        {IMPORT_REVIEW_GROUPS.find(({ key }) => key === filter)?.description ||
          "All records are included in this view. Open a record to see its changes and results."}
      </p>
      <div className="flex flex-wrap gap-2">
        {saved && overview.groups.attention.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={onReviewExceptions}
            className="min-h-11 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Review exceptions ({overview.groups.attention.length})
          </button>
        )}
        {saved && overview.groups.updates.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={onReviewUpdates}
            className="min-h-11 rounded-full border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50"
          >
            Review ready updates together ({overview.groups.updates.length})
          </button>
        )}
        {saved && overview.groups.new.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={onReviewNew}
            className="min-h-11 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            Review new-record approval
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onFilter("all")}
          aria-pressed={filter === "all"}
          className="min-h-11 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          All records ({overview.total})
        </button>
        {saved && (
          <button
            type="button"
            disabled={disabled}
            onClick={onShowAll}
            className="min-h-11 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            {reviewingOne ? "Show this group together" : "Review one record"}
          </button>
        )}
      </div>
      {dirty ? (
        <p role="status" className="text-sm font-semibold text-amber-900">
          Save or cancel your current edits before changing groups or approving
          a batch.
        </p>
      ) : preparing ? (
        <p role="status" className="text-sm text-slate-600">
          Preparation is still in progress. These counts cover the rows saved so
          far.
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          Filtering and reviewing do not send changes to NXT.
        </p>
      )}
    </section>
  );
}
