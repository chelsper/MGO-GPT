import { useState } from "react";
import { LETTER_TAGS, LETTER_FIELD_LABELS } from "@/utils/societyLetters";

export default function LetterMergeFieldsEditor({
  name,
  value,
  onChange,
  onInsert,
  busy,
}) {
  const [chosen, setChosen] = useState("salutation");
  const [notice, setNotice] = useState("");
  const selected = value.fields.includes(chosen)
    ? chosen
    : value.fields[0] || "";
  const token = selected ? `{${selected}}` : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setNotice(
        `Copied ${token}. Paste it where this value belongs in your Word letter.`,
      );
    } catch {
      setNotice(`Copy this tag into Word: ${token}`);
    }
  }
  return (
    <fieldset
      className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
      disabled={busy}
    >
      <legend className="px-2 font-bold">Saved merge fields</legend>
      <p className="text-sm text-gray-600">
        Choose the fields available to this society's letter and email. These
        choices are saved with the template, not just for this visit.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {LETTER_TAGS.map((field) => (
          <label
            key={field}
            className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm"
          >
            <input
              type="checkbox"
              aria-label={`${name} use ${LETTER_FIELD_LABELS[field]}`}
              checked={value.fields.includes(field)}
              onChange={(event) => {
                setNotice("");
                onChange({
                  ...value,
                  fields: event.target.checked
                    ? [...value.fields, field]
                    : value.fields.filter((key) => key !== field),
                });
              }}
            />
            <span>
              <span className="block font-semibold">
                {LETTER_FIELD_LABELS[field]}
              </span>
              <code className="text-xs text-gray-600">{`{${field}}`}</code>
            </span>
          </label>
        ))}
      </div>
      <label className="mt-4 block text-sm font-semibold">
        Date appearance
        <select
          aria-label={`${name} merge date appearance`}
          className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
          value={value.dateFormat}
          onChange={(event) =>
            onChange({ ...value, dateFormat: event.target.value })
          }
        >
          <option value="iso">2026-09-24 (year-month-day)</option>
          <option value="long_us">September 24, 2026 (written out)</option>
        </select>
      </label>
      <div className="mt-4 border-t border-emerald-200 pt-4">
        <label className="block text-sm font-semibold">
          Insert a selected field
          <select
            aria-label={`${name} field to insert`}
            className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            value={selected}
            onChange={(event) => {
              setChosen(event.target.value);
              setNotice("");
            }}
            disabled={!value.fields.length}
          >
            {!value.fields.length && (
              <option value="">Select a field above first</option>
            )}
            {LETTER_TAGS.filter((field) => value.fields.includes(field)).map(
              (field) => (
                <option key={field} value={field}>
                  {LETTER_FIELD_LABELS[field]} {`{${field}}`}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            ["Copy tag for Word", copy],
            ["Insert into email subject", () => onInsert("subject", token)],
            ["Insert into email message", () => onInsert("emailBody", token)],
          ].map(([label, action]) => (
            <button
              type="button"
              key={label}
              disabled={!selected}
              onClick={action}
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Selecting a field does not move or insert text in Word. Place its
          exact tag in the Word document and upload it to change the layout.
          Source &amp; period keeps the query-column mappings for addressee,
          salutation, and address. Names work for individuals as well as spouse
          households.
        </p>
        {notice && (
          <p role="status" className="mt-2 text-sm text-emerald-900">
            {notice}
          </p>
        )}
      </div>
    </fieldset>
  );
}
