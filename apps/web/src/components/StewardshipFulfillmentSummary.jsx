import { useState } from "react";
import { FULFILLMENT_STAGES } from "@/utils/stewardshipFulfillment";
import { formatQueueDate } from "@/utils/advancementQueue";

export default function StewardshipFulfillmentSummary({
  request,
  showNotice = false,
  workspaceId = request.request_viewer_id,
}) {
  const [seen, setSeen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const f = request.stewardship_fulfillment;
  if (!f) return null;
  const noticeKey = `${request.id}:${request.request_viewer_id}:${f.version}`;
  async function acknowledge() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stewardship/fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "acknowledge",
          requestId: String(request.id),
          viewerKey: request.request_viewer_id,
          version: f.version,
        }),
      });
      const data = await response.json();
      if (
        !response.ok ||
        data.viewerKey !== request.request_viewer_id ||
        data.acknowledged !== true
      )
        throw new Error(data.error || "Reload this update before continuing.");
      setSeen(noticeKey);
      window.dispatchEvent(new Event("stewardship-update-seen"));
    } catch (failure) {
      setError(failure.message || "Could not mark the update seen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Fulfillment update"
      className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm"
    >
      <strong>
        {FULFILLMENT_STAGES[f.stage] || "Fulfillment recorded"} ·{" "}
        {formatQueueDate(f.date)}
      </strong>
      <p>{f.note}</p>
      {f.stage === "sent" && <p>Dispatched, not confirmed received.</p>}
      {f.stage === "received" && !request.stewardship_received_item && (
        <p className="text-amber-900">
          The receipt was corrected or is unavailable. Check Received Items for
          the current record.
        </p>
      )}
      <p>
        {f.actionId
          ? `Linked to existing NXT action ${f.actionId}. NXT was not changed.`
          : "App record only. No NXT action has been created or linked here."}
      </p>
      {f.actionNeedsReview && (
        <p className="text-amber-900">
          This completion was updated after an NXT action was linked. Review
          that action in NXT; the app has not changed it.
        </p>
      )}
      {f.followUpId &&
        (workspaceId != null &&
        String(workspaceId) === String(request.owner_user_id) &&
        request.stewardship_follow_up_status ? (
          <a
            className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline"
            href={`/follow-ups?tab=next-steps&nextStepId=${encodeURIComponent(f.followUpId)}&status=${request.stewardship_follow_up_status === "Done" ? "Done" : "Open"}`}
          >
            Open MGO follow-up
          </a>
        ) : (
          <p>
            A next step was added to the assigned MGO's queue. Open their
            workspace to view its current status.
          </p>
        ))}
      {showNotice && request.fulfillment_unread && seen !== noticeKey && (
        <button
          type="button"
          disabled={busy}
          className="min-h-11 justify-self-start rounded-lg border border-emerald-700 px-3 font-semibold"
          onClick={acknowledge}
        >
          {busy ? "Saving..." : "Mark update seen"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
