import { useEffect, useRef, useState } from "react";
import {
  FULFILLMENT_STAGES,
  fulfillmentCommand,
  fulfillmentToday,
} from "@/utils/stewardshipFulfillment";
import { isPersonalGiftRequest } from "@/utils/stewardshipAssistance";

const input =
  "min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900";
const button =
  "min-h-11 rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function StewardshipFulfillmentForm({
  request,
  disabled,
  onSaved,
  draftNote,
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(
    isPersonalGiftRequest(request) ? "received" : "completed",
  );
  const [date, setDate] = useState(
    request.stewardship_received_item?.received_on || fulfillmentToday(),
  );
  const [note, setNote] = useState(draftNote ?? request.reviewer_notes ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [deduct, setDeduct] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [actionId, setActionId] = useState("");
  const [follow, setFollow] = useState(false);
  const [followTitle, setFollowTitle] = useState(
    "Follow up after stewardship assistance",
  );
  const [followDate, setFollowDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);
  const token = useRef(null);
  const heading = useRef(null);
  const trigger = useRef(null);
  const f = request.stewardship_fulfillment;
  const gift = isPersonalGiftRequest(request);
  const correction =
    f?.stage === "received" && !request.stewardship_received_item;
  const terminal =
    request.status === "Completed" &&
    !correction &&
    (["received", "completed"].includes(f?.stage) ||
      (f?.stage === "sent" && !gift));
  const linkOnly = terminal && !f?.actionId;
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) setNote(draftNote ?? request.reviewer_notes ?? "");
  }, [draftNote, request.reviewer_notes]);
  useEffect(() => {
    if (!open) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open]);
  if (request.status === "Declined" || (terminal && !linkOnly)) return null;
  const choices = Object.entries(FULFILLMENT_STAGES).filter(([key]) => {
    if (linkOnly) return key === f.stage;
    if (
      correction ||
      request.stewardship_received_item ||
      (gift && f?.stage === "sent")
    )
      return key === "received";
    if (f && key === "prepared") return false;
    return gift ? key !== "completed" : key !== "received";
  });
  const selectedStage = choices.some(([key]) => key === stage)
    ? stage
    : choices[0]?.[0];
  function close() {
    if (flight.current) return;
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function checkSaved() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/stewardship/fulfillment?${new URLSearchParams({ requestId: request.id, viewerKey: request.request_viewer_id })}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (
        !response.ok ||
        data.viewerKey !== request.request_viewer_id ||
        String(data.request?.id) !== String(request.id)
      )
        throw new Error(data.error || "Saved status is unavailable.");
      if (data.request.request_version !== request.request_version) {
        onSaved(data.request);
        setOpen(false);
      } else {
        setUncertain(false);
        setError(
          "No new fulfillment is recorded. Review your draft before saving.",
        );
      }
    } catch (failure) {
      setError(
        failure.message ||
          "Saved status could not load. Keep your draft and try checking again.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (flight.current || disabled || uncertain) return;
    let command;
    token.current ||= crypto.randomUUID();
    const body = {
      requestId: String(request.id),
      viewerKey: request.request_viewer_id,
      version: request.request_version,
      token: token.current,
      stage: selectedStage,
      date: linkOnly ? f.date : date,
      note: linkOnly ? f.note : note,
      confirmed,
      stockQuantity:
        selectedStage === "received" &&
        !request.stewardship_received_item &&
        deduct
          ? Number(quantity)
          : 0,
      itemId:
        request.stewardship_gift_item_id == null
          ? null
          : String(request.stewardship_gift_item_id),
      actionId: selectedStage === "prepared" ? null : actionId.trim() || null,
      followUp:
        selectedStage !== "prepared" && follow && !f?.followUpId
          ? { title: followTitle, date: followDate }
          : null,
    };
    try {
      command = { ...fulfillmentCommand(body), confirmed: true };
    } catch (failure) {
      setError(failure.message);
      return;
    }
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stewardship/fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const data = await response.json();
      if (
        !response.ok ||
        data.viewerKey !== request.request_viewer_id ||
        String(data.request?.id) !== String(request.id)
      )
        throw new Error(data.error || "Saved status could not be confirmed.");
      onSaved(data.request);
      setOpen(false);
    } catch (failure) {
      setUncertain(true);
      setError(failure.message || "Check saved status before trying again.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Complete stewardship request"
      className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
    >
      {!open ? (
        <button
          type="button"
          ref={trigger}
          className={`${button} justify-self-start bg-emerald-700 text-white`}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          {correction
            ? "Record corrected receipt"
            : linkOnly
              ? "Link existing NXT action"
              : gift && f?.stage === "sent"
                ? "Confirm item received"
                : "Complete request"}
        </button>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <h3 tabIndex={-1} ref={heading} className="font-semibold">
            What happened for {request.constituent_name}?
          </h3>
          <p className="text-sm">
            One save updates this request and notifies the fundraiser in the
            app. It does not send anything or change NXT.
          </p>
          <fieldset
            disabled={disabled || busy || uncertain}
            className="grid min-w-0 gap-3"
          >
            <label className="grid gap-1 text-sm font-semibold">
              Outcome
              <select
                disabled={linkOnly}
                className={input}
                value={selectedStage}
                onChange={(e) => setStage(e.target.value)}
              >
                {choices.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Date it happened
              <input
                readOnly={linkOnly}
                className={input}
                required
                type="date"
                min="1900-01-01"
                max={fulfillmentToday()}
                value={linkOnly ? f.date : date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Shared completion note
              <textarea
                readOnly={linkOnly}
                className={input}
                required
                rows={2}
                maxLength={2000}
                value={linkOnly ? f.note : note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Briefly describe what was done."
              />
            </label>
            {selectedStage === "prepared" && (
              <p className="text-sm">
                The request stays in progress. No receipt or inventory deduction
                is recorded.
              </p>
            )}
            {selectedStage === "sent" && (
              <p className="text-sm">
                The request is completed as dispatched, not received. Inventory
                is unchanged; record actual receipt later for a personal gift.
              </p>
            )}
            {selectedStage === "received" && (
              <>
                {correction && (
                  <p className="text-sm text-amber-900">
                    The previous receipt must be voided in Received Items before
                    saving a replacement. History and previous stock deductions
                    are kept. Any linked NXT action must be reviewed separately;
                    it will not be changed here.
                  </p>
                )}
                <p className="text-sm">
                  Item:{" "}
                  <strong>
                    {request.stewardship_gift_item_snapshot?.name ||
                      "Save a gift selection before continuing"}
                  </strong>
                  .{" "}
                  {request.stewardship_received_item
                    ? "The existing receipt will be reused; its date must match."
                    : "Only confirm this if the donor actually received it."}
                </p>
                {!request.stewardship_received_item && (
                  <>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={deduct}
                        onChange={(e) => setDeduct(e.target.checked)}
                      />
                      Deduct this newly received item from counted inventory.
                    </label>
                    <p className="text-xs">
                      Leave unchecked if stock was already deducted or this is
                      historical. Unknown or insufficient stock cannot be
                      deducted.
                    </p>
                    {deduct && (
                      <label className="grid gap-1 text-sm font-semibold">
                        Quantity
                        <input
                          className={input}
                          type="number"
                          min="1"
                          max="1000000"
                          step="1"
                          required
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                        />
                      </label>
                    )}
                  </>
                )}
              </>
            )}
            {selectedStage !== "prepared" && (
              <details open={linkOnly || undefined}>
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                  Optional: NXT link and MGO follow-up
                </summary>
                <div className="grid gap-3">
                  {f?.actionId ? (
                    <p className="text-sm">
                      Existing NXT action {f.actionId} stays linked. It will not
                      be changed or created again.
                    </p>
                  ) : (
                    <label className="grid gap-1 text-sm font-semibold">
                      Existing NXT action system ID
                      <input
                        aria-label="Existing NXT action system ID"
                        required={linkOnly}
                        className={input}
                        inputMode="numeric"
                        value={actionId}
                        onChange={(e) => setActionId(e.target.value)}
                      />
                      <span className="text-xs font-normal">
                        We verify the donor, completion status, and date.
                        Automatic NXT action/custom-field creation is not
                        enabled.
                      </span>
                    </label>
                  )}
                  {!f?.followUpId && !linkOnly && (
                    <>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          className="mt-1"
                          type="checkbox"
                          checked={follow}
                          onChange={(e) => setFollow(e.target.checked)}
                        />
                        Add a next step to the assigned MGO's queue.
                      </label>
                      {follow && (
                        <>
                          <label className="grid gap-1 text-sm font-semibold">
                            Follow-up title
                            <input
                              className={input}
                              required
                              maxLength={255}
                              value={followTitle}
                              onChange={(e) => setFollowTitle(e.target.value)}
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-semibold">
                            Follow-up due date
                            <input
                              className={input}
                              required
                              type="date"
                              min={fulfillmentToday()}
                              value={followDate}
                              onChange={(e) => setFollowDate(e.target.value)}
                            />
                          </label>
                          <p className="text-xs">
                            Adds one separate next step; it does not replace the
                            MGO's plan or complete an existing reminder.
                          </p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </details>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-1"
                required
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this outcome and date are accurate.
            </label>
            <button
              className={`${button} justify-self-start bg-emerald-700 text-white`}
              type="submit"
              disabled={
                !confirmed ||
                (selectedStage === "received" &&
                  !request.stewardship_gift_item_id)
              }
            >
              {busy
                ? "Saving..."
                : linkOnly
                  ? "Verify and link action"
                  : selectedStage === "prepared"
                    ? "Save progress"
                    : "Save completion"}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-amber-900">
              {error}
            </p>
          )}
          {uncertain && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={checkSaved}
            >
              Check saved status
            </button>
          )}
          <button
            type="button"
            className={`${button} justify-self-start bg-white`}
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
        </form>
      )}
      {disabled && (
        <p className="text-sm">
          Save request edits or refresh the queue before completing this
          request.
        </p>
      )}
    </section>
  );
}
