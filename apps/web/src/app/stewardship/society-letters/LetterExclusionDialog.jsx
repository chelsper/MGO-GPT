import { useEffect, useRef, useState } from "react";

export default function LetterExclusionDialog({
  recipient,
  busy,
  error,
  onClose,
  onSave,
}) {
  const dialog = useRef(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="exclude-letter-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl backdrop:bg-gray-900/40"
    >
      <h2 id="exclude-letter-title" className="text-xl font-bold">
        Exclude {recipient.name} for this period?
      </h2>
      <p className="my-4 text-sm text-gray-600">
        This individual or household will stay out of all society letter lists
        for {recipient.period.start} through {recipient.period.end}, even after
        membership refreshes or a higher society qualification. Nothing is sent,
        no NXT records change, and you can restore them from Excluded. A new
        non-overlapping period is eligible again.
      </p>
      <label className="block text-sm font-semibold">
        Reason (optional)
        <textarea
          autoFocus
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-300 p-3"
          rows={3}
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold"
        >
          Keep in holding list
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(reason)}
          className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white"
        >
          Exclude for this period
        </button>
      </div>
    </dialog>
  );
}
