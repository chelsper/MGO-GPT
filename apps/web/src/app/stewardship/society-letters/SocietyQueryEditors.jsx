import {
  CONSTITUENT_LETTER_COLUMNS,
  CONSTITUENT_LETTER_LABELS,
} from "@/utils/societyLetters";
import QueryColumnMapper from "./QueryColumnMapper";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900";

export function sourceForSociety(settings, societyKey) {
  return (
    settings.societySources?.find((s) => s.societyKey === societyKey) || {
      societyKey,
      queryId:
        settings.sourceMode === "constituents" &&
        settings.querySocietyKey === societyKey
          ? settings.queryId
          : "",
      queryPeriodStart:
        settings.sourceMode === "constituents" &&
        settings.querySocietyKey === societyKey
          ? settings.queryPeriodStart
          : "",
      queryPeriodEnd:
        settings.sourceMode === "constituents" &&
        settings.querySocietyKey === societyKey
          ? settings.queryPeriodEnd
          : "",
      columns:
        settings.sourceMode === "constituents" &&
        settings.querySocietyKey === societyKey
          ? settings.columns
          : { ...CONSTITUENT_LETTER_COLUMNS },
    }
  );
}

export default function SocietyQueryEditors({
  settings,
  definitions,
  templates,
  onChange,
}) {
  const societies = definitions
    .filter((d) => settings.societyKeys.includes(d.key))
    .sort(
      (a, b) => a.displayOrder - b.displayOrder || a.key.localeCompare(b.key),
    );
  function update(societyKey, changes) {
    onChange({
      ...settings,
      societySources: settings.societyKeys.map((key) => ({
        ...sourceForSociety(settings, key),
        ...(key === societyKey ? changes : {}),
      })),
    });
  }
  return (
    <section className="mt-6 space-y-4" aria-label="Annual society queries">
      <div>
        <h3 className="text-lg font-bold">One query for each annual society</h3>
        <p className="mt-1 text-sm text-gray-600">
          Each saved query defines its own giving level. All selected queries
          must finish before the combined household preview changes. This setup
          does not create letters, send messages, or apply NXT appeals.
        </p>
      </div>
      {societies.map((society, index) => {
        const source = sourceForSociety(settings, society.key);
        const template = templates.find((t) => t.societyKey === society.key);
        return (
          <fieldset
            key={society.key}
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5"
          >
            <legend className="px-2 font-bold">
              {index + 1}. {society.name}
            </legend>
            <p className="text-sm text-gray-600">
              {template?.filename
                ? `Letter template: ${template.filename}`
                : "Add this society's Word letter in Letter templates. You can do that before configuring its query."}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-semibold">
                NXT saved query ID
                <input
                  className={input}
                  aria-label={`${society.name} query ID`}
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  required
                  value={source.queryId || ""}
                  onChange={(e) =>
                    update(society.key, { queryId: e.target.value })
                  }
                />
              </label>
              {[
                ["queryPeriodStart", "Query qualification start"],
                ["queryPeriodEnd", "Query qualification end"],
              ].map(([key, label]) => (
                <label className="text-sm font-semibold" key={key}>
                  {label}
                  <input
                    className={input}
                    type="date"
                    aria-label={`${society.name} ${label.toLowerCase()}`}
                    required
                    value={source[key] || ""}
                    onChange={(e) =>
                      update(society.key, { [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Use the dates actually set in this query. Every query must match
              the letter period above.
            </p>
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold text-emerald-800">
                Output columns for {society.name}
              </summary>
              <p className="mt-2 text-sm text-gray-600">
                Map constituent and spouse System Record IDs, not lookup IDs.
                Each query can use different column names. Leave unused optional
                fields blank.
              </p>
              <QueryColumnMapper
                queryId={source.queryId}
                columns={source.columns}
                labels={CONSTITUENT_LETTER_LABELS}
                prefix={`${society.name} `}
                onChange={(columns) => update(society.key, { columns })}
              />
            </details>
          </fieldset>
        );
      })}
    </section>
  );
}
