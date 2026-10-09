import { PostalBatchRunner } from "./PostalBatchApproval";
import LetterBatchSummary from "./LetterBatchSummary";
import { LetterAppealStatus } from "./FinalPostalLetterDialog";
import { canReturnLetterToReview } from "@/utils/societyLetterRecovery";
import { letterAppealRecovery } from "@/utils/societyLetterVerification";
import { focusSavedLetter, savedLetterElementId } from "./letterHistoryFocus";

const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-emerald-700 !bg-emerald-700 !text-white`;
const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900";
const card = "rounded-2xl border border-gray-200 bg-white p-5 sm:p-6";
const labels = {
  prepared: "Prepared for postal mail",
  pending_email: "Email queued, not sent",
  sending: "Submission started: verify before any retry",
  emailed: "Email accepted",
  delivered: "Email delivered",
  mailed: "Marked mailed",
  needs_review: "Delivery needs review",
  cancelled: "Cancelled before sending",
};

export default function LetterBatchCard({
  batch,
  guided = false,
  busy,
  sendingBatch,
  emailEnabled,
  definitions,
  downloadBatch,
  setConfirmation,
  act,
  autoStart,
  onAutoStartConsumed,
  historySearch = "",
  receiptIds,
  setReceiptIds,
  onReload,
}) {
  const printableItems = batch.items.filter(
    (item) => item.status !== "cancelled",
  );
  const attentionItems = printableItems.filter(
    (item) =>
      item.letterAppeals?.status === "needs_review" ||
      item.letterAppeals?.members?.some(
        (member) => member.status === "uncertain",
      ),
  );
  function returnToReview(item, editRecipientAfterReturn = false) {
    setConfirmation({
      action: "return_letter_to_review",
      deliveryId: item.id,
      householdId: item.householdId,
      editRecipientAfterReturn,
      title: `Return ${item.name} to review?`,
      description:
        "No NXT update has been attempted for this letter. Return only this recipient to the holding list and keep the saved wording. The approved document stays in history, but will no longer be printable from this batch. Nothing is sent or removed from NXT; other letters stay unchanged.",
    });
  }
  const printReadyPdf =
    batch.channel === "post" &&
    printableItems.length > 0 &&
    printableItems.every(
      (item) => item.postalApproval && item.postalDocument?.format === "pdf",
    );
  return (
    <article className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            {batch.items.length} {batch.channel === "post" ? "postal" : "email"}{" "}
            {batch.items.length === 1 ? "letter" : "letters"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Prepared {new Date(batch.date).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {printReadyPdf && (
            <button
              className={primary}
              disabled={
                busy ||
                printableItems.some(
                  (item) => item.letterAppeals?.status !== "complete",
                )
              }
              onClick={() => downloadBatch(batch.id, undefined, "combined-pdf")}
            >
              Download print-ready PDF
            </button>
          )}
          {batch.channel === "post" &&
            batch.items.some((i) => i.status !== "cancelled") && (
              <button
                className={
                  guided &&
                  !printReadyPdf &&
                  printableItems.every(
                    (item) => item.letterAppeals?.status === "complete",
                  )
                    ? primary
                    : button
                }
                disabled={
                  busy ||
                  printableItems.some(
                    (i) =>
                      i.letterAppeals && i.letterAppeals.status !== "complete",
                  )
                }
                onClick={() => downloadBatch(batch.id)}
              >
                Download{" "}
                {printableItems.every((i) => i.postalDocument?.format === "pdf")
                  ? "PDF"
                  : "Word"}{" "}
                letters (.zip)
              </button>
            )}
          {batch.channel === "post" &&
            batch.items.some((i) => i.status === "prepared") && (
              <button
                className={guided ? button : primary}
                disabled={
                  busy ||
                  printableItems.some(
                    (i) =>
                      i.letterAppeals && i.letterAppeals.status !== "complete",
                  )
                }
                onClick={() =>
                  setConfirmation({
                    action: "mailed",
                    batchId: batch.id,
                    title: "Confirm these letters have been mailed",
                    description:
                      "This records the prepared postal letters as mailed and covers their lower society tiers for the same period.",
                  })
                }
              >
                Mark batch mailed
              </button>
            )}
          {batch.items.some((i) => i.status === "pending_email") && (
            <button
              className={primary}
              disabled={busy || !!sendingBatch || !emailEnabled}
              onClick={() =>
                setConfirmation({
                  action: "send",
                  batchId: batch.id,
                  title: "Send the remaining queued emails?",
                  description:
                    "This sends the prepared letters to the listed households, three at a time. Already submitted emails will not be sent again.",
                })
              }
            >
              {sendingBatch === batch.id ? "Sending..." : "Send queued emails"}
            </button>
          )}
          {!batch.items.some((i) => i.letterAppeals) &&
            batch.items.some((i) =>
              ["prepared", "pending_email"].includes(i.status),
            ) && (
              <button
                className={button}
                disabled={busy || !!sendingBatch}
                onClick={() =>
                  setConfirmation({
                    action: "cancel",
                    batchId: batch.id,
                    title: "Cancel the remaining unsent letters?",
                    description:
                      "Confirm the queued or prepared letters have not been sent or mailed. Only their reservations will be released. Submitted and uncertain emails remain protected, and history is retained.",
                  })
                }
              >
                Cancel unsent letters
              </button>
            )}
        </div>
      </div>
      {printReadyPdf && (
        <p className="mt-3 text-sm text-gray-600">
          One PDF in approved order, using the saved letters without changing
          their layout or dates. Print single-sided at actual size. Downloading
          does not update NXT or mark letters mailed.
        </p>
      )}
      {batch.items.some((item) => item.returnToReview) && (
        <p className="mt-3 text-sm text-gray-600">
          {batch.items.filter((item) => item.returnToReview).length} returned to
          review. These letters are kept in history but are not included in this
          batch's downloads or mailing.
        </p>
      )}
      {attentionItems.length > 0 && (
        <section
          aria-label="Letters needing attention"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <h3 className="font-bold text-amber-950">
            {attentionItems.length}{" "}
            {attentionItems.length === 1 ? "letter needs" : "letters need"}{" "}
            attention
          </h3>
          <p className="mt-2 text-sm text-gray-700">
            Your approved letters are saved. Resolve the issues below before
            finishing their NXT updates or downloading them.
          </p>
          <ul className="mt-3 space-y-3">
            {attentionItems.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-amber-100 bg-white p-3"
              >
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-sm text-gray-700">
                  {item.letterAppeals.message ||
                    "Review this letter's saved appeal status."}
                </p>
                {letterAppealRecovery(item.letterAppeals) === "recipient" &&
                canReturnLetterToReview(item) ? (
                  <>
                    <p className="mt-2 text-sm text-gray-600">
                      No appeal has been submitted. You can correct this
                      recipient and approve a replacement; the other letters
                      stay saved.
                    </p>
                    <button
                      className={`${primary} mt-3`}
                      disabled={busy || !!sendingBatch}
                      onClick={() => returnToReview(item, true)}
                      aria-label={`Fix recipient details for ${item.name}`}
                    >
                      Fix recipient details
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-gray-600">
                      {letterAppealRecovery(item.letterAppeals) === "connection"
                        ? "Ask an administrator to check the Blackbaud connection and permissions. Your approved letter stays saved; you do not need to edit the recipient."
                        : ["retry", "waiting"].includes(
                              letterAppealRecovery(item.letterAppeals),
                            )
                          ? "Your approved letter stays saved. Continue saved letters after any NXT pause; no replacement letter is needed."
                          : "Keep this approved letter while you resolve its saved NXT status. Do not create another letter."}
                    </p>
                    {letterAppealRecovery(item.letterAppeals) === "appeals" && (
                      <a
                        className={`${button} mt-3 inline-block`}
                        href="/stewardship/society-letters?view=appeals"
                      >
                        Open appeal settings
                      </a>
                    )}
                    <button
                      className={`${button} mt-3`}
                      disabled={busy || !!sendingBatch}
                      onClick={() => focusSavedLetter(item.id)}
                      aria-label={`Review saved status for ${item.name}`}
                    >
                      Review saved status
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {printableItems.length > 0 &&
        printableItems.every((i) => i.postalApproval) && (
          <PostalBatchRunner
            key={batch.id}
            batch={{ ...batch, items: printableItems }}
            busy={busy || !!sendingBatch}
            act={act}
            autoStart={autoStart}
            onAutoStartConsumed={onAutoStartConsumed}
            onReload={onReload}
          />
        )}
      <LetterBatchSummary items={batch.items} />
      <details
        className="mt-4"
        open={
          !!historySearch.trim() ||
          batch.items.some((i) =>
            guided
              ? i.status !== "cancelled" &&
                (i.letterAppeals?.status === "needs_review" ||
                  i.letterAppeals?.members?.some(
                    (member) => member.status === "uncertain",
                  ))
              : i.status !== "cancelled" &&
                i.letterAppeals &&
                i.letterAppeals.status !== "complete",
          ) ||
          undefined
        }
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Recipients and acknowledgment coverage
        </summary>
        <ul className="mt-3 space-y-3">
          {batch.items.map((item) => (
            <li
              key={item.id}
              id={savedLetterElementId(item.id)}
              tabIndex={-1}
              className="scroll-mt-24 border-t pt-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
            >
              <p>
                <strong>{item.name}</strong> / {item.societyName} /{" "}
                {item.returnToReview
                  ? "Returned to review; no appeal submitted"
                  : item.letterAppeals &&
                      item.status !== "cancelled" &&
                      item.letterAppeals.status !== "complete"
                    ? item.letterAppeals.status === "needs_review"
                      ? "Reserved: appeal updates need attention"
                      : "Reserved: appeal updates pending"
                    : labels[item.status]}
              </p>
              {item.status !== "cancelled" && (
                <LetterAppealStatus
                  item={item}
                  automatic
                  busy={busy}
                  onVerify={() =>
                    act({
                      action: "verify_letter_appeals",
                      deliveryId: item.id,
                    })
                  }
                  onContinue={() =>
                    act({
                      action: "continue_letter_appeals",
                      deliveryId: item.id,
                      confirm: true,
                    })
                  }
                />
              )}
              {canReturnLetterToReview(item) && (
                <button
                  className={`${button} mt-3`}
                  disabled={busy || !!sendingBatch}
                  onClick={() => returnToReview(item)}
                >
                  Return to review
                </button>
              )}
              {item.returnToReview && (
                <p className="mt-2 text-gray-600">
                  Returned {new Date(item.returnToReview.at).toLocaleString()}.
                  Saved recipient choices were kept. Review and approve a new
                  document before any appeal update.
                </p>
              )}
              <p className="mt-1 text-gray-500">
                {item.period.start} through {item.period.end}.{" "}
                {item.channel === "email" ? item.email : item.addressee}
              </p>
              {item.updatedAt && (
                <p className="mt-1 text-gray-500">
                  Status recorded {new Date(item.updatedAt).toLocaleString()}
                </p>
              )}
              <p className="mt-1 text-gray-500">
                Lower-tier letters covered after sending:{" "}
                {item.coveredKeys
                  .slice(1)
                  .map((k) => definitions.find((d) => d.key === k)?.name || k)
                  .join(", ") || "None"}
                . No extra letters sent.
              </p>
              {item.providerId &&
                ["emailed", "needs_review"].includes(item.status) && (
                  <button
                    className={`${button} mt-2`}
                    disabled={busy}
                    onClick={() =>
                      act({ action: "verify", deliveryId: item.id })
                    }
                  >
                    Check email delivery
                  </button>
                )}
              {item.channel === "post" && item.status !== "cancelled" && (
                <button
                  className={`${button} mt-2`}
                  disabled={
                    busy ||
                    (!!item.letterAppeals &&
                      item.letterAppeals.status !== "complete")
                  }
                  onClick={() =>
                    downloadBatch(
                      batch.id,
                      item.id,
                      item.postalDocument?.format || "docx",
                    )
                  }
                >
                  Download this{" "}
                  {item.postalDocument?.format === "pdf" ? "PDF" : "Word"}{" "}
                  letter
                </button>
              )}
              {item.channel === "email" &&
                !item.providerId &&
                ["sending", "needs_review"].includes(item.status) && (
                  <form
                    className="mt-3 max-w-lg"
                    onSubmit={(event) => {
                      event.preventDefault();
                      act({
                        action: "verify",
                        deliveryId: item.id,
                        providerId: receiptIds[item.id] || "",
                      });
                    }}
                  >
                    <p className="text-amber-900">
                      Check the sender's Resend log for this letter.
                      Verification will match its recipient and saved letter
                      tag; no email is resent.
                    </p>
                    <label className="mt-2 block font-semibold">
                      Existing Resend email ID
                      <input
                        className={input}
                        value={receiptIds[item.id] || ""}
                        onChange={(e) =>
                          setReceiptIds({
                            ...receiptIds,
                            [item.id]: e.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <button className={`${button} mt-2`} disabled={busy}>
                      Verify existing email
                    </button>
                  </form>
                )}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
