import { ATTENTION_FILTERS, REVIEW_FILTERS } from "./letterWorkspaceView";

export default function LetterWorkspaceFilters({
  value,
  onChange,
  counts,
  attention,
  onAttentionChange,
  attentionCounts,
  channel,
}) {
  return (
    <div className="mt-5 space-y-3">
      <div
        role="group"
        aria-label="Recipient review filters"
        className="flex flex-wrap gap-2"
      >
        {REVIEW_FILTERS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${value === key ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-emerald-600"}`}
          >
            {label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${value === key ? "bg-white/15" : "bg-gray-100"}`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-xs text-gray-600">
          Reviewed means recipient names and wording were saved, not approved
          for delivery. Needs attention can include reviewed recipients. Counts
          use the current search and society; no NXT check is run.
        </p>
        <label className="block w-full text-sm font-semibold sm:w-auto">
          Focus on an issue
          <select
            value={attention}
            onChange={(event) => onAttentionChange(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900 sm:min-w-64"
          >
            <option value="all">All issues / no issue filter</option>
            {ATTENTION_FILTERS.filter(([key]) =>
              channel === "post" ? key !== "email" : key !== "address",
            ).map(([key, label]) => (
              <option key={key} value={key}>
                {label} ({attentionCounts[key] || 0})
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
