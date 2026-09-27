import { useEffect, useRef, useState } from "react";
import SavedLetterPreview from "./SavedLetterPreview";
import LetterBatchSummary from "./LetterBatchSummary";

const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function FinalPostalLetterDialog({
  preview,
  revision,
  busy,
  error,
  onClose,
  onConfirm,
}) {
  const dialog = useRef(null);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [draft] = useState(() => ({
    name: preview.row.name,
    request: {
      action: "preview_final_postal_document",
      revision,
      householdId: preview.row.householdId,
      previewToken: preview.token,
    },
  }));
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const { row, appeal } = preview;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="final-letter-title"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 text-gray-900 shadow-xl backdrop:bg-gray-900/40 sm:p-7"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="final-letter-title" className="text-xl font-bold">
            Create final postal letter
          </h2>
          <p className="mt-1 text-gray-600">
            {row.name} / {row.societyName}
          </p>
        </div>
        <button autoFocus className={button} disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mt-4 text-sm text-gray-600">
        One Word letter, dated {row.letterDate}. Nothing is emailed or marked
        mailed. NXT restrictions and prior appeals are checked again before
        creation.
      </p>
      <LetterBatchSummary
        items={[row]}
        selectionSummary={preview.selectionSummary}
        preview
      />
      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="font-semibold">
          Appeal to apply to{" "}
          {row.members.length === 2
            ? "both household members"
            : "this constituent"}
        </h3>
        <p className="mt-2 text-sm">
          {appeal.lookupId || `System ID ${appeal.id}`} / {appeal.description}
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {row.members.map((id) => {
            const name = row.memberNames?.find((m) => m.constituentId === id);
            return (
              <li key={id}>
                {[name?.firstName, name?.lastName].filter(Boolean).join(" ") ||
                  "Constituent"}{" "}
                (ID {id})
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm">
          Only the highest qualifying society appeal will be applied. Lower-tier
          letters will be covered in the app for this period. Selecting one
          mailing address does not remove a spouse.
        </p>
      </div>
      <div className="mt-4 text-sm">
        <p className="font-semibold">{row.addressee}</p>
        <p className="whitespace-pre-line text-gray-600">{row.address}</p>
      </div>
      <button
        className={`${button} mt-4`}
        disabled={busy || attempted}
        onClick={() => setShowPreview(true)}
      >
        Preview this final letter
      </button>
      {showPreview && (
        <div className="mt-4">
          <SavedLetterPreview
            embedded
            template={{
              version: row.templateVersion,
              filename: row.templateFilename,
            }}
            draft={draft}
            onReady={() => setPreviewReady(true)}
            onClose={() => setShowPreview(false)}
          />
        </div>
      )}
      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          checked={confirmed}
          disabled={busy || attempted || !previewReady}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed this letter and authorize its creation and the appeal update
        for every member listed above.
      </label>
      <p className="mt-3 text-xs text-gray-600">
        If an update is interrupted, use Letter history to verify and finish the
        same letter. Do not create another copy.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
        >
          {error}
        </p>
      )}
      {attempted && !busy && (
        <p role="status" className="mt-3 text-sm">
          Close and reload saved history before any further action. This
          confirmation cannot be submitted again.
        </p>
      )}
      <button
        className={`${button} mt-5 w-full !border-emerald-700 !bg-emerald-700 !text-white`}
        disabled={!confirmed || !previewReady || busy || attempted}
        onClick={() => {
          setAttempted(true);
          onConfirm();
        }}
      >
        {busy
          ? "Checking NXT and creating letter..."
          : "Create letter and apply appeal"}
      </button>
    </dialog>
  );
}

export function LetterAppealStatus({ item, busy, onVerify, onContinue }) {
  const [confirmed, setConfirmed] = useState(false);
  const receipt = item.letterAppeals;
  if (!receipt) return null;
  const complete = receipt.status === "complete";
  return (
    <section
      className={`mt-3 rounded-xl border p-4 ${complete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
      aria-label={`Appeal updates for ${item.name}`}
    >
      <p className="font-semibold">
        {complete
          ? "Appeal confirmed for every member"
          : "Finish this letter's appeal updates"}
      </p>
      <p className="mt-1">
        {receipt.appeal.lookupId || receipt.appeal.id}:{" "}
        {receipt.appeal.description}
      </p>
      <p className="mt-1">
        {receipt.message ||
          "This letter is reserved. Verify NXT status before continuing."}
      </p>
      <ul className="mt-2">
        {receipt.members.map((m) => (
          <li key={m.id}>
            Constituent {m.id}:{" "}
            {m.status === "verified"
              ? "Confirmed"
              : m.status === "uncertain"
                ? "Needs verification; will not be resubmitted"
                : "Pending"}
          </li>
        ))}
      </ul>
      {!complete && item.status === "prepared" && (
        <>
          <button
            className={`${button} mt-3`}
            disabled={busy}
            onClick={onVerify}
          >
            Verify NXT status (read only)
          </button>
          {!receipt.members.some((m) => m.status === "uncertain") && (
            <>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Apply the saved appeal only to remaining members. Do not create
                another letter.
              </label>
              <button
                className={`${button} mt-3`}
                disabled={busy || !confirmed}
                onClick={() => {
                  setConfirmed(false);
                  onContinue();
                }}
              >
                Continue remaining appeal updates
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
