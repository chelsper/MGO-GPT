import { useEffect, useRef, useState } from "react";

export default function LetterExclusionDialog({
  recipient,
  appealSettings,
  today,
  busy,
  error,
  onClose,
  onSave,
}) {
  const dialog = useRef(null);
  const [reason, setReason] = useState("");
  const [exclusionDate, setExclusionDate] = useState(today || "");
  const [confirmNxt, setConfirmNxt] = useState(false);
  const configured = !!appealSettings?.policy;
  const appeal =
    appealSettings?.current &&
    appealSettings.policy.appeals?.[recipient.societyKey];
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
        membership refreshes or a higher society qualification. No letter is
        sent or marked sent. A new non-overlapping period is eligible again.
      </p>
      {appeal ? (
        <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="font-semibold">
            Record {recipient.societyName} exclusion in NXT
          </p>
          <p>
            {appeal.lookupId}: {appeal.description}
          </p>
          <p className="mt-1">
            Applied to member system IDs: {recipient.members.join(", ")}. Your
            reason becomes the appeal comments. Existing assignments are
            preserved.
          </p>
        </div>
      ) : (
        <p className="mb-4 text-sm text-amber-900">
          {configured
            ? "Verify NXT exclusion appeal settings for this period before excluding."
            : "App-only exclusion: configure NXT exclusion appeals to also record this decision in NXT. Nothing in NXT changes until that is configured."}
        </p>
      )}
      <label className="block text-sm font-semibold">
        {configured ? "Reason (NXT comments)" : "Reason (optional)"}
        <textarea
          autoFocus
          value={reason}
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            setConfirmNxt(false);
          }}
          className="mt-2 w-full rounded-lg border border-gray-300 p-3"
          rows={3}
        />
      </label>
      {configured && (
        <>
          <label className="mt-4 block text-sm font-semibold">
            Exclusion date
            <input
              type="date"
              value={exclusionDate}
              max={today}
              onChange={(e) => {
                setExclusionDate(e.target.value);
                setConfirmNxt(false);
              }}
              className="mt-2 block min-h-11 rounded-lg border border-gray-300 p-2"
            />
          </label>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={confirmNxt}
              onChange={(e) => setConfirmNxt(e.target.checked)}
              className="mt-1"
            />
            Apply this exclusion appeal to each listed household member in NXT
            using this date and reason. No letter will be sent. Restoring later
            requires removing the exclusion appeal in NXT first.
          </label>
        </>
      )}
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
          disabled={
            busy ||
            (configured &&
              (!appeal || !confirmNxt || !reason.trim() || !exclusionDate))
          }
          onClick={() => onSave({ reason, exclusionDate, confirmNxt })}
          className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white"
        >
          {configured ? "Exclude and record in NXT" : "Exclude for this period"}
        </button>
      </div>
    </dialog>
  );
}
