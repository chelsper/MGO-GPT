import { useEffect, useRef, useState } from "react";

const button =
  "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50";

export function useAppealChoices() {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setCatalog(null);
    try {
      const response = await fetch("/api/stewardship/society-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspect_appeals" }),
        signal: controller.signal,
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Appeal choices could not be loaded. Try again.",
        );
      if (!Array.isArray(result.appeals))
        throw new Error("Appeal choices could not be loaded. Try again.");
      if (!controller.signal.aborted) setCatalog(result);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure.message || "Appeal choices could not be loaded. Try again.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (request.current === controller) request.current = null;
    }
  }
  return { catalog, loading, error, load };
}

export function AppealChoicesLoader({ choices, disabled }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
      <button
        type="button"
        className={button}
        disabled={disabled || choices.loading}
        onClick={choices.load}
      >
        {choices.loading
          ? "Loading appeal choices..."
          : choices.catalog
            ? "Reload appeal choices"
            : "Load appeal choices from NXT"}
      </button>
      <p className="mt-2 text-gray-600">
        Loads active, uniquely identified appeals once for this form. Search
        locally by name or code; nothing is assigned or saved.
      </p>
      {choices.catalog && (
        <p role="status" className="mt-2 text-emerald-800">
          {choices.catalog.appeals.length} appeal{" "}
          {choices.catalog.appeals.length === 1 ? "choice" : "choices"} loaded.{" "}
          {choices.catalog.omittedCount > 0 &&
            "Inactive, ambiguous, or unusable appeals were left out. Check NXT if an appeal is missing."}
        </p>
      )}
      {choices.error && (
        <p role="alert" className="mt-2 text-red-800">
          {choices.error}
        </p>
      )}
    </div>
  );
}

export default function AppealPicker({
  tier,
  period,
  purpose,
  value,
  choices,
  disabled,
  onSelect,
}) {
  const [search, setSearch] = useState("");
  const searchInput = useRef(null);
  const [showResults, setShowResults] = useState(false);
  const term = search.trim().toLowerCase();
  const matches =
    term.length >= 2 && choices.catalog
      ? choices.catalog.appeals.filter((appeal) =>
          `${appeal.description}\n${appeal.lookupId}`
            .toLowerCase()
            .includes(term),
        )
      : [];
  const hasSelection =
    !!value?.description &&
    !!(value.identifierType === "system" ? value.id : value.lookupId);
  return (
    <section
      aria-label={`${tier.name} ${purpose} appeal selection`}
      className="space-y-3"
    >
      <p className="text-sm text-gray-600">
        {purpose === "exclusion" ? "Exclusion" : "Letter sent"} appeal for{" "}
        {tier.name} · {period.start} through {period.end}
      </p>
      <label className="block text-sm font-semibold">
        Search appeal name or code
        <input
          ref={searchInput}
          type="search"
          maxLength={100}
          autoComplete="off"
          className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal"
          aria-label={`${tier.name} ${purpose} appeal search`}
          value={search}
          disabled={disabled || !choices.catalog || choices.loading}
          placeholder={
            choices.catalog
              ? "Type at least 2 characters"
              : "Load appeal choices above"
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          onChange={(event) => {
            setSearch(event.target.value);
            setShowResults(true);
          }}
        />
      </label>
      {showResults && term.length >= 2 && choices.catalog && (
        <div>
          <p role="status" className="text-sm text-gray-600">
            {matches.length
              ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}${matches.length > 20 ? "; showing the first 20. Narrow your search." : ". Choose one below."}`
              : "No matching appeal. Try another name or code, or use manual entry."}
          </p>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {matches.slice(0, 20).map((appeal) => (
              <li key={appeal.lookupId}>
                <button
                  type="button"
                  disabled={disabled}
                  className="min-h-11 w-full break-words rounded-lg border border-gray-200 bg-white p-3 text-left text-sm hover:border-emerald-700 disabled:opacity-50"
                  aria-label={`Select ${appeal.lookupId}: ${appeal.description}`}
                  onClick={() => {
                    onSelect(appeal);
                    setShowResults(false);
                    searchInput.current?.focus();
                  }}
                >
                  <span className="block font-semibold text-gray-900">
                    {appeal.description}
                  </span>
                  <span className="mt-1 block text-emerald-800">
                    {appeal.lookupId}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasSelection && (
        <div
          className="break-words rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"
          role="status"
        >
          <p className="font-semibold">Appeal to verify: {value.description}</p>
          <p>
            {value.identifierType === "system"
              ? `System record ID: ${value.id}`
              : `Code: ${value.lookupId}`}
          </p>
          <p className="mt-1 text-gray-600">
            For {tier.name}, {period.start} through {period.end}. Verify and
            save below; selecting an appeal does not save settings.
          </p>
        </div>
      )}
    </section>
  );
}
