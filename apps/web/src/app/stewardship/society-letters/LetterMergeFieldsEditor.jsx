import { useState } from "react";
import {
  LETTER_TAGS,
  LETTER_FIELD_LABELS,
  LETTER_ADDRESS_TAGS,
} from "@/utils/societyLetters";

export default function LetterMergeFieldsEditor({
  name,
  value,
  onChange,
  onInsert,
  busy,
  wordFields,
  onReadFields,
  canReadFields = false,
  readingFields = false,
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
      <legend className="px-2 font-bold">Letter merge fields</legend>
      <p className="text-sm text-gray-600">
        Choose what fills each placeholder in this Word letter. Save once to
        reuse these choices for this society. No need to upload the same file
        again.
      </p>
      {onReadFields && (
        <button
          type="button"
          onClick={onReadFields}
          disabled={!canReadFields || readingFields}
          className="mt-3 min-h-11 rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50"
        >
          {readingFields
            ? "Reading Word fields..."
            : "Read fields from Word letter"}
        </button>
      )}
      {wordFields && (
        <div className="mt-4 space-y-4">
          <p role="status" className="text-sm text-emerald-900">
            {wordFields.fields.length} Word fields found. Review the mappings,
            then save the template.
          </p>
          {wordFields.hasAddressBlock && (
            <label className="block text-sm font-semibold">
              Address layout
              <select
                aria-label={`${name} address layout`}
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white p-3"
                value={value.wordAddressMode || "block"}
                onChange={(event) =>
                  onChange({ ...value, wordAddressMode: event.target.value })
                }
              >
                <option value="block">
                  Full mailing address (recommended)
                </option>
                <option value="components">Separate address fields</option>
              </select>
              <span className="mt-2 block font-normal text-gray-600">
                Full address replaces the existing address-only lines with the
                recipient's reviewed mailing address, including individual
                edits. Separate fields use saved address parts, never guessed
                from address text.
              </span>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {wordFields.fields
              .filter(
                ({ suggestedField }) =>
                  !(
                    wordFields.hasAddressBlock &&
                    value.wordAddressMode !== "components" &&
                    LETTER_ADDRESS_TAGS.includes(suggestedField)
                  ),
              )
              .map(({ name: placeholder }) => (
                <label
                  key={placeholder}
                  className="block rounded-lg border border-gray-200 bg-white p-3 text-sm font-semibold"
                >
                  Word field: {placeholder}
                  <select
                    aria-label={`${name} fill ${placeholder} with`}
                    required
                    className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white p-2 font-normal"
                    value={value.wordBindings?.[placeholder] || ""}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        wordBindings: {
                          ...value.wordBindings,
                          [placeholder]: event.target.value,
                        },
                        fields: [
                          ...new Set(
                            [...value.fields, event.target.value].filter(
                              Boolean,
                            ),
                          ),
                        ],
                      })
                    }
                  >
                    <option value="">Choose a value</option>
                    {LETTER_TAGS.map((key) => (
                      <option key={key} value={key}>
                        {LETTER_FIELD_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
          {wordFields.hasDateLabel && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={value.mergeDateLabel === true}
                onChange={(event) =>
                  onChange({ ...value, mergeDateLabel: event.target.checked })
                }
              />
              Replace the standalone "Date" line with the letter date
            </label>
          )}
          <p className="text-sm text-gray-600">
            For an editable greeting, map the Word greeting field to Salutation.
            Preferred names are suggested during review. Individual or household
            first names also supports preferred-name fallbacks and can be edited
            for each recipient. To check actual names and addresses, save these
            settings and open Preview personalized letter in recipient review.
          </p>
        </div>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Available fields and adding new placeholders
        </summary>
        <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-sm text-gray-700">
          <p>
            For example, use <code>{"Dear {first_name},"}</code> for the
            recipient's first name instead of the saved salutation. For a letter
            that works for individuals and couples, use{" "}
            <code>{"Dear {first_names},"}</code> (Alex, or Alex &amp; Jordan).
          </p>
          <p className="mt-2">
            Name values use preferred names when available, then first names,
            unless you edit the field for a recipient. Names are never guessed
            by splitting a salutation. A name field used in Word or email must
            have a value before the letter can be created. Spouse-only fields
            will not work for an individual without a spouse.
          </p>
        </div>
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
      </details>
      <label className="mt-4 block text-sm font-semibold">
        Letter font
        <select
          aria-label={`${name} letter font`}
          className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
          value={value.fontReplacement || "template"}
          onChange={(event) => {
            const { fontReplacement: _previous, ...settings } = value;
            onChange({
              ...settings,
              ...(event.target.value === "carlito"
                ? { fontReplacement: "carlito" }
                : {}),
            });
          }}
        >
          <option value="template">Keep the original template fonts</option>
          <option value="carlito">
            Use Carlito in place of Avenir (PDF compatible)
          </option>
        </select>
        <span className="mt-2 block font-normal text-gray-600">
          Applies to previews and new Word/PDF letters. Sizes, spacing, and
          logos stay unchanged. Saving creates a new template version;
          previously approved documents stay unchanged.
        </span>
      </label>
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
          The mappings above change existing Word placeholders. To add a new
          placeholder in a different position, insert its tag in Word and
          replace the saved file. Source &amp; period keeps the query-column
          mappings for addressee, salutation, first and last names, and address.
          Each society can save different fields and use a different greeting in
          its own letter.
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
