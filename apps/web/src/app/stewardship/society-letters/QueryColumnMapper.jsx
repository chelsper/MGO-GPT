import { useRef, useState } from "react";
import { ORGANIZATION_CONTACT_COLUMNS } from "@/utils/societyLetterContacts";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900";

const constituentGroups = [
  {
    title: "People and spouse links",
    description:
      "Use NXT System Record IDs, not lookup IDs. Keep the spouse column mapped; a blank spouse value in a row means that person is included individually.",
    keys: ["constituentId", "spouseId"],
  },
  {
    title: "Names for the holding list",
    description:
      "Optional: map first and last names for the constituent and spouse. The app displays each person's own name without assuming a shared surname. Names never create a spouse link or replace the letter greeting.",
    keys: ["firstName", "lastName", "spouseFirstName", "spouseLastName"],
  },
  {
    title: "Letter greeting",
    description:
      "Use the query's addressee and salutation. These are retained for recipient review, not guessed from a household name.",
    keys: ["addressee", "salutation"],
  },
  {
    title: "Preferred mailing address",
    description:
      "Map each part separately. The app assembles street line 1, street line 2, city, state and ZIP into the Mailing address merge field, omitting blank lines. No combined address column is needed.",
    keys: ["address1", "address2", "city", "state", "postalCode", "country"],
  },
  {
    title: "Business and foundation contacts (optional)",
    description:
      "Map Constituency Code to enable contact choices for Business and Foundation records. Use Contact type with Contact first/last name when contacts are returned on separate rows, or map separate Main contact and Society letter contact name columns. Only Main contact and Society letter contact roles are offered. Names must belong to the same contact on each row. Contacts personalize the letter only; the organization keeps its address, giving qualification and appeal history.",
    keys: Object.keys(ORGANIZATION_CONTACT_COLUMNS),
  },
  {
    title: "Email",
    description:
      "Optional for this preview. An email or mailing address is not permission to send a letter.",
    keys: ["email"],
  },
];

export default function QueryColumnMapper({
  queryId,
  columns,
  labels,
  prefix = "",
  onChange,
  constituent = true,
  onUseConstituents,
}) {
  const [loaded, setLoaded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentQuery = useRef(queryId);
  currentQuery.current = queryId;
  const result = loaded?.queryId === String(queryId).trim() ? loaded : null;
  const legacyMismatch =
    !constituent &&
    result?.suggestedColumns?.constituentId &&
    result?.suggestedColumns?.spouseId &&
    (!result.fields.includes(columns?.householdId) ||
      !result.fields.includes(columns?.memberIds));
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
  function renderFields(keys) {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map((key) => {
          const label = labels[key];
          const value = columns?.[key] || "";
          const unavailable = result && value && !result.fields.includes(value);
          const optional = label.includes("(optional)");
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
            required: !optional,
            onChange: (e) => onChange({ ...columns, [key]: e.target.value }),
          };
          return (
            <label key={key} className="min-w-0 text-sm font-semibold">
              {label}
              {result ? (
                <select {...props}>
                  <option value="">
                    {optional ? "Not used" : "Choose a field"}
                  </option>
                  {unavailable && (
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
                  This column was not returned. Choose a listed field
                  {optional ? " or select Not used." : "."}
                </span>
              )}
            </label>
          );
        })}
      </div>
    );
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
            onClick={() =>
              onChange(
                Object.fromEntries(
                  Object.entries(labels).map(([key, label]) => [
                    key,
                    result.suggestedColumns?.[key] ||
                      (label.includes("(optional)") &&
                      !result.fields.includes(columns?.[key])
                        ? ""
                        : columns?.[key] || ""),
                  ]),
                ),
              )
            }
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
      {!constituent && onUseConstituents && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="font-bold text-emerald-950">
            No household columns in your NXT query?
          </h3>
          <p className="mt-1 text-sm text-emerald-900">
            {legacyMismatch &&
              "This query returns constituent and spouse IDs. "}
            Use those IDs and separate preferred address fields instead. The app
            builds the household ID, member list and display name; you do not
            need to add those columns to NXT.
          </p>
          <button
            type="button"
            onClick={() => onUseConstituents(result)}
            className="mt-3 min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800"
          >
            Map people and separate address fields
          </button>
          <p className="mt-2 text-xs text-emerald-900">
            Keeps valid greeting selections and loaded fields. Changes this form
            only until you review and save it; nothing is sent to NXT.
          </p>
        </div>
      )}
      {constituent ? (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <h3 className="font-bold">Calculated in the app</h3>
            <p className="mt-1">
              Household ID and Member IDs are built from the constituent and
              spouse system IDs. The household display name uses mapped first
              and last names, falling back to addressee values when names are
              incomplete. None of these needs a separate NXT output column.
              Individuals without a spouse are included too.
            </p>
          </div>
          {constituentGroups.map((group) => (
            <fieldset
              key={group.title}
              className="min-w-0 rounded-xl border border-gray-200 p-4"
            >
              <legend className="px-1 font-semibold">{group.title}</legend>
              <p className="text-sm text-gray-600">{group.description}</p>
              {renderFields(group.keys)}
            </fieldset>
          ))}
        </>
      ) : legacyMismatch ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-gray-600">
            Advanced: map an already-grouped query instead
          </summary>
          {renderFields(Object.keys(labels))}
        </details>
      ) : (
        renderFields(Object.keys(labels))
      )}
    </div>
  );
}
