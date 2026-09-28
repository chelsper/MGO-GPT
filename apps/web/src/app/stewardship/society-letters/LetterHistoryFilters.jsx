import {
  LETTER_HISTORY_FILTERS,
  matchesLetterHistory,
} from "@/utils/societyLetterHistory";

export default function LetterHistoryFilters({
  batches,
  filter,
  onFilter,
  search,
  onSearch,
  visibleCount,
}) {
  return (
    <section
      aria-label="Find saved letters"
      className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"
    >
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Letter history status"
      >
        {LETTER_HISTORY_FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold ${filter === key ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-emerald-600"}`}
          >
            {label} (
            {batches.filter((batch) => matchesLetterHistory(batch, key)).length}
            )
          </button>
        ))}
      </div>
      <label className="mt-4 block max-w-xl text-sm font-semibold text-gray-800">
        Find in letter history
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Recipient, society, or constituent ID"
          className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal"
        />
      </label>
      <p role="status" className="mt-3 text-sm text-gray-600">
        Showing {visibleCount} of {batches.length} saved batches. No NXT check
        is needed.
      </p>
      {(filter !== "all" || search) && (
        <p className="mt-2 text-sm text-gray-600">
          Matching batches keep all their letters together. Batch actions still
          apply to the full batch.{" "}
          <button
            type="button"
            className="min-h-11 font-semibold text-emerald-800 underline"
            onClick={() => {
              onFilter("all");
              onSearch("");
            }}
          >
            Show all batches
          </button>
        </p>
      )}
    </section>
  );
}
