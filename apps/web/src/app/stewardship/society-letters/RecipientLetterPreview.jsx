import { useRef, useState } from "react";
import SavedLetterPreview from "./SavedLetterPreview";

export default function RecipientLetterPreview({
  recipient,
  values,
  reviewToken,
  template,
  disabled,
}) {
  const [draft, setDraft] = useState(null);
  const previewButton = useRef(null);
  function closePreview() {
    setDraft(null);
    previewButton.current?.focus();
  }
  const request = {
    action: "preview_recipient_document",
    householdId: recipient.householdId,
    reviewToken,
    templateVersion: template?.version,
    ...values,
  };
  const signature = JSON.stringify(request);
  const stale = !!draft && draft.signature !== signature;
  const canPreview =
    !disabled &&
    template?.version &&
    values.recipientConstituentId &&
    values.addressee.trim() &&
    values.salutation.trim();

  return (
    <section aria-label="Personalized letter preview" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">Personalized letter</h3>
        <button
          ref={previewButton}
          type="button"
          disabled={!canPreview}
          onClick={() => setDraft({ name: recipient.name, request, signature })}
          className="min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
        >
          {draft ? "Update letter preview" : "Preview personalized letter"}
        </button>
        {draft && (
          <button
            type="button"
            onClick={closePreview}
            className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:underline"
          >
            Close letter preview
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        Preview your current edits with the saved Word template. Nothing is
        saved, sent, or marked ready for delivery. Updates run only when you
        request them, not while you type.
      </p>
      {!draft && (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">
          {!template?.version
            ? "Save a Word template for this society in Letter templates to preview personalized letters."
            : !canPreview
              ? "Choose a recipient and enter an addressee and salutation, then preview the letter here."
              : "Your personalized letter will appear here. You can keep editing beside it."}
        </div>
      )}
      {stale && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
        >
          Your edits have changed. Update the preview to see the current letter.
          The previous preview is hidden so it cannot be mistaken for your
          latest edits.
        </p>
      )}
      {draft && (
        <div className="mt-4" hidden={stale}>
          <SavedLetterPreview
            embedded
            template={{ ...template, version: draft.request.templateVersion }}
            draft={draft}
            onClose={closePreview}
          />
        </div>
      )}
    </section>
  );
}
