import { CSV_NAME_FORMATS } from "@/utils/societyLetterCsvFormat";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal";

export default function LetterCsvFormat({
  format,
  onChange,
  disabled,
  plan,
  rows,
  previewId,
  onPreview,
}) {
  function select(key, label, choices) {
    return (
      <label className="text-sm font-semibold">
        {label}
        <select
          className={input}
          value={format[key]}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...format, [key]: event.target.value })
          }
        >
          {choices.map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const entry =
    plan.entries.find((item) => item.householdId === previewId) ||
    plan.entries[0];
  const labels = new Map(rows.map((row) => [row.householdId, row.name]));
  const values =
    entry &&
    Object.fromEntries(
      plan.columns.map((column, index) => [column.source, entry.cells[index]]),
    );
  return (
    <div className="my-4 border-t border-emerald-200 pt-4">
      <h4 className="font-semibold">CSV wording and date format</h4>
      <p className="mt-2 text-sm text-gray-700">
        Preferred names fall back to first names. Household formats include both
        people; individual formats use your selected recipient. Choose reviewed
        wording to keep personal edits. These choices affect only the CSV.
      </p>
      <div className="my-3 grid gap-3 sm:grid-cols-2">
        {select("salutation", "Salutation format", CSV_NAME_FORMATS)}
        {select(
          "addressee",
          "Addressee format",
          CSV_NAME_FORMATS.map(([key, label]) => [
            key,
            /_(preferred|first)$/.test(key) ? `${label} + last name` : label,
          ]),
        )}
        {select("dateFormat", "CSV date display", [
          ["long_us", "October 12, 2026"],
          ["short_us", "10/12/2026"],
          ["iso", "2026-10-12"],
        ])}
        {select("organization", "Organization name placement", [
          ["reviewed", "Keep reviewed placement"],
          ["address", "First line of the full address field"],
          ["omit", "Omit organization name (contact only)"],
        ])}
      </div>
      <details className="my-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          Name style and Word greeting field
        </summary>
        <div className="my-3 grid gap-3 sm:grid-cols-2">
          {select("joiner", "Join household names with", [
            [" & ", "&"],
            [" and ", "and"],
          ])}
          {select("sharedLastName", "Matching last names", [
            ["combine", "Alex & Pat Example"],
            ["repeat", "Alex Example & Pat Example"],
          ])}
          {select("greetingField", "Word greeting field", [
            ["First_Name", "First_Name (updated Dolphin letter)"],
            ["salutation", "salutation"],
            ["saved", "Keep saved Word field mappings"],
          ])}
        </div>
        <p>
          Different last names are always kept. The chosen Word greeting field
          and the CSV salutation column use the same greeting; other name
          columns stay available. Organization formats use the contact chosen in
          recipient review, never an automatically selected contact. Saved
          reviews, Word/PDF settings, and NXT records are unchanged.
        </p>
      </details>
      {entry && (
        <section
          aria-label="CSV wording preview"
          className="rounded-lg border border-emerald-200 bg-white p-4"
        >
          <label className="text-sm font-semibold">
            Preview CSV recipient
            <select
              className={input}
              value={entry.householdId}
              disabled={disabled}
              onChange={(event) => onPreview(event.target.value)}
            >
              {plan.entries.map((item) => (
                <option key={item.householdId} value={item.householdId}>
                  {labels.get(item.householdId) || item.householdId}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-4">{values.letter_date}</p>
          <p className="mt-3 whitespace-pre-line">{values.addressee}</p>
          <p className="whitespace-pre-line">{values.address}</p>
          <p className="mt-3">Dear {values.salutation},</p>
          <p className="mt-3 text-xs text-gray-600">
            CSV values only, not a rendered Word letter. Use the full address
            field to include the organization line. Review the merged Word
            document before printing.
          </p>
        </section>
      )}
    </div>
  );
}
