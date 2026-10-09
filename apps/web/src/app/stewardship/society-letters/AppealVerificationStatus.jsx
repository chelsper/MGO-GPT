import {
  automaticAppealCheck,
  letterAppealPauseMessage,
} from "@/utils/societyLetterVerification";
import useLetterAppealPause from "./useLetterAppealPause";

export default function AppealVerificationStatus({
  receipt,
  automatic,
  busy,
  onVerify,
}) {
  const { retryAt, waiting } = useLetterAppealPause([receipt]);
  const scheduled = automatic && automaticAppealCheck(receipt);
  const button = (
    <button
      className="mt-3 min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
      disabled={busy || waiting}
      onClick={onVerify}
    >
      Verify NXT status (read only)
    </button>
  );
  const uncertain = receipt.members.some((m) => m.status === "uncertain");
  if (waiting)
    return (
      <p role="status" className="mt-3 text-sm">
        {letterAppealPauseMessage(retryAt)}
      </p>
    );
  if (!automatic || (!scheduled && uncertain)) return button;
  return (
    <div className="mt-3 text-sm">
      {scheduled && (
        <p role="status">
          NXT confirmation is being checked automatically while this page is
          open. No extra click is needed. This only reads NXT; it never adds or
          resends an appeal.
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer">
          Check status manually (optional)
        </summary>
        {button}
      </details>
    </div>
  );
}
