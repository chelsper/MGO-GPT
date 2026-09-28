import { LETTER_NAME_TAGS, LETTER_FIELD_LABELS } from "@/utils/societyLetters";

export default function RecipientNameFields({
  values,
  mergeNames,
  usedFields,
  organization,
  onChange,
}) {
  return (
    <details
      open={usedFields.length > 0}
      className="rounded-lg border border-gray-200 p-3 text-sm"
    >
      <summary className="cursor-pointer font-semibold">
        Name merge fields for this recipient
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {LETTER_NAME_TAGS.filter(
          (key) =>
            usedFields.includes(key) ||
            (!usedFields.length &&
              (!organization || !key.startsWith("spouse_"))),
        ).map((key) => (
          <label key={key} className="font-semibold">
            {LETTER_FIELD_LABELS[key]}
            <input
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 font-normal"
              maxLength={300}
              value={mergeNames[key]}
              aria-label={`Edit ${LETTER_FIELD_LABELS[key]}`}
              onChange={(event) =>
                onChange({ ...values.nameOverrides, [key]: event.target.value })
              }
            />
            <span className="mt-1 block text-xs font-normal text-gray-500">
              {`{${key}}`}
              {usedFields.includes(key) ? " - used in this template" : ""}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-gray-500">
        Changes are saved only for this recipient's letter and period. They do
        not change the query, household members, or NXT.
      </p>
      {!!Object.keys(values.nameOverrides || {}).length && (
        <button
          type="button"
          className="mt-2 min-h-11 text-sm font-semibold text-emerald-800 underline"
          onClick={() => onChange({})}
        >
          Reset name fields to query values
        </button>
      )}
    </details>
  );
}
