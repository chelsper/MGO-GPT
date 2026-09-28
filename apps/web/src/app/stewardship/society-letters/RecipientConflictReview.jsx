import { useEffect, useRef } from "react";
import {
  LETTER_ADDRESS_TAGS,
  LETTER_NAME_TAGS,
  LETTER_FIELD_LABELS,
} from "@/utils/societyLetters";

const fields = [
  ["recipientConstituentId", "Recipient record"],
  ["addressConstituentId", "Address source"],
  ["organizationContactKey", "Organization contact"],
  ["addressee", "Addressee"],
  ["salutation", "Salutation"],
  ["nameOverrides", "Name merge fields"],
  ["address", "Mailing address"],
  ["addressParts", "Separate address merge fields"],
  ["email", "Email"],
];
export default function RecipientConflictReview({
  draft,
  latest,
  sameSource,
  onChoose,
  busy,
}) {
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const editable =
    latest?.status === "ready" && latest?.recipientReview?.editable;
  const saved = latest?.recipientReview?.values || {};
  const display = (values, key) =>
    key === "nameOverrides"
      ? LETTER_NAME_TAGS.filter((tag) =>
          Object.hasOwn(values.nameOverrides || {}, tag),
        )
          .map(
            (tag) =>
              `${LETTER_FIELD_LABELS[tag]}: ${values.nameOverrides[tag] || "Blank"}`,
          )
          .join("\n") || "Query values"
      : key === "addressParts"
        ? LETTER_ADDRESS_TAGS.filter((tag) => values.addressParts?.[tag])
            .map(
              (tag) =>
                `${LETTER_FIELD_LABELS[tag]}: ${values.addressParts[tag]}`,
            )
            .join("\n") || "Not selected"
        : values[key] || "Not selected";
  const changed = fields.filter(
    ([key]) => display(draft, key) !== display(saved, key),
  );
  const unchanged = fields.filter(
    ([key]) => display(draft, key) === display(saved, key),
  );
  const comparisonField = ([key, label]) => (
    <div
      key={key}
      className="grid gap-2 rounded-lg bg-white p-3 sm:grid-cols-2"
    >
      <div className="min-w-0">
        <p className="font-semibold">{label} · Your draft</p>
        <p className="whitespace-pre-wrap break-words">{display(draft, key)}</p>
      </div>
      <div className="min-w-0">
        <p className="font-semibold">Latest saved</p>
        <p className="whitespace-pre-wrap break-words">{display(saved, key)}</p>
      </div>
    </div>
  );
  return (
    <section
      aria-label="Compare recipient choices"
      className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
    >
      <h3 ref={heading} tabIndex={-1} className="font-semibold">
        Compare before continuing
      </h3>
      <p className="mt-1">
        Your draft has not been replaced. Loading saved choices does not refresh
        NXT, save changes, or approve delivery.
      </p>
      {!editable ? (
        <p className="mt-2 font-semibold">
          This household is no longer editable. Keep your draft and close;
          nothing can be saved from this review.
        </p>
      ) : (
        !sameSource && (
          <p className="mt-2 font-semibold">
            The household or source options changed. Start with the latest
            choices and review the recipient again; the old draft cannot be
            applied automatically.
          </p>
        )
      )}
      <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
        {changed.length ? (
          changed.map(comparisonField)
        ) : (
          <p>
            No wording or address differences. Review the current recipient
            before saving again.
          </p>
        )}
        {!!unchanged.length && (
          <details>
            <summary className="cursor-pointer py-2 font-semibold">
              Show {unchanged.length} unchanged fields
            </summary>
            <div className="space-y-3">{unchanged.map(comparisonField)}</div>
          </details>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !editable || !sameSource}
          onClick={() => onChoose("draft")}
          className="min-h-11 rounded-lg border border-emerald-700 bg-white px-3 py-2 font-semibold disabled:opacity-50"
        >
          Keep my draft for review
        </button>
        <button
          type="button"
          disabled={busy || !editable}
          onClick={() => onChoose("latest")}
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold disabled:opacity-50"
        >
          Use latest saved choices
        </button>
      </div>
      <p className="mt-2">
        Either choice still requires your review and a separate Save. Choosing
        the latest replaces this draft.
      </p>
    </section>
  );
}
