import { useRef, useState } from "react";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900";

export default function QueryColumnMapper({
  queryId,
  columns,
  labels,
  prefix = "",
  onChange,
  constituent = true,
}) {
  const [loaded, setLoaded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentQuery = useRef(queryId);
  currentQuery.current = queryId;
  const result = loaded?.queryId === String(queryId).trim() ? loaded : null;
  async function loadFields() {
    setBusy(true);
    setError("");
    const requested = queryId;
    try {
      const response = await fetch("/api/stewardship/society-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspect_query", queryId: requested }),
      });
      const payload = await response.json();
      if (currentQuery.current !== requested) return;
      if (!response.ok)
        throw new Error(payload.error || "Could not read query fields.");
      setLoaded(payload);
    } catch (error) {
      if (currentQuery.current === requested) setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !queryId}
          onClick={loadFields}
          className="min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
        >
          {busy ? "Reading fields..." : "Load query fields"}
        </button>
        {result && constituent && (
          <button
            type="button"
            onClick={() => onChange({ ...columns, ...result.suggestedColumns })}
            className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold"
          >
            Use recognized fields
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600">
        Reads column names only. It does not run the query, change NXT, or save
        your settings. Review the selections before saving.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="text-sm text-emerald-800">
          {result.fields.length} output fields loaded. Choose a field for each
          value below; optional values may stay blank.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(labels).map(([key, label]) => {
          const value = columns?.[key] || "";
          const unavailable = result && value && !result.fields.includes(value);
          const props = {
            className: input,
            "aria-label": `${prefix}${label}`,
            "aria-invalid": unavailable ? true : undefined,
            ref: (element) =>
              element?.setCustomValidity(
                unavailable
                  ? "Select a returned query field, or clear this optional mapping."
                  : "",
              ),
            value,
            required: !constituent || !label.includes("(optional)"),
            onChange: (e) => onChange({ ...columns, [key]: e.target.value }),
          };
          return (
            <label key={key} className="text-sm font-semibold">
              {label}
              {result ? (
                <select {...props}>
                  <option value="">Choose a field</option>
                  {value && !result.fields.includes(value) && (
                    <option value={value}>{value} (not returned)</option>
                  )}
                  {result.fields.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input {...props} maxLength={150} />
              )}
              {unavailable && (
                <span className="mt-1 block text-xs font-normal text-amber-900">
                  This column was not returned. Choose a listed field or clear
                  an optional value.
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
