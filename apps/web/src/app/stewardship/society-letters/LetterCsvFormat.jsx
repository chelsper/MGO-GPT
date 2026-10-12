import { CSV_NAME_FORMATS } from "@/utils/societyLetterCsvFormat";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal";
const addressFields = [
  ["address_line_1", "Address Line 1"],
  ["address_line_2", "Address Line 2 (optional)"],
  ["city", "City"],
  ["state", "State"],
  ["zip", "ZIP"],
];

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
  const addressColumns = addressFields.map(([source, label]) => ({
    source,
    label,
    name: (
      plan.columns.find(
        (column) =>
          column.source === source && column.name.toLowerCase() === source,
      ) || plan.columns.find((column) => column.source === source)
    )?.name,
  }));
  const missingAddress = addressColumns
    .filter(({ source }) => source !== "address_line_2" && !values?.[source])
    .map(({ label }) => label);
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
          <section
            aria-label="Separate address fields in CSV"
            className="mt-4 border-t border-emerald-100 pt-4 text-sm"
          >
            <h5 className="font-semibold">Separate address fields in your CSV</h5>
            <p className="mt-2 text-gray-600">
              Use these column names as individual Word merge fields instead of
              the combined address field. Address Line 2 stays blank when it is
              not needed. Put a comma between the City and State fields in Word.
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {addressColumns.map(({ source, label, name }) => (
                <div key={source} className="min-w-0">
                  <dt className="font-semibold">
                    {label}
                    <code className="block break-all text-xs font-normal text-gray-600">
                      {name}
                    </code>
                  </dt>
                  <dd className="mt-1 whitespace-pre-line break-words">
                    {values[source] ||
                      (source === "address_line_2"
                        ? "Blank (optional)"
                        : "Not available")}
                  </dd>
                </div>
              ))}
            </dl>
            {missingAddress.length > 0 && (
              <p role="status" className="mt-3 text-amber-900">
                Missing separate fields: {missingAddress.join(", ")}. Open this
                recipient's review and complete Separate address merge fields
                before merging these columns. A manually edited full address
                is not split automatically.
              </p>
            )}
            <p className="mt-3 text-xs text-gray-600">
              Street columns do not include the organization name. If opening
              the CSV in Excel first, import ZIP as text to keep leading zeros.
            </p>
          </section>
        </section>
      )}
    </div>
  );
}
