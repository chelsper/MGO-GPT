import { letterError } from "@/utils/societyLetters";
import {
  LETTER_APPEAL_SELECTION_LIMIT,
  savedPostalAppealLetter,
  letterAppealsFinished,
} from "@/utils/societyLetterBulkAppeals";
import { syncLetterAppeals } from "./societyLetterFinalization";
import { savedPostalDocument } from "./societyLetterPostalBatches";
import { assertLetterAppealPauseEnded } from "@/utils/societyLetterVerification";

// One selected household per leased request. Receipts remain the durable checkpoint;
// reopening the page never resumes writes without another explicit confirmation.
export async function finishSelectedLetterAppeals(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  sync = syncLetterAppeals,
  readDocument = savedPostalDocument,
) {
  const ids = body.deliveryIds;
  if (body.confirm !== true || body.automatic === true)
    throw letterError(
      "Confirm finishing the selected letters' saved NXT appeal updates.",
    );
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > LETTER_APPEAL_SELECTION_LIMIT ||
    ids.some((id) => typeof id !== "string" || !id || id.length > 100) ||
    new Set(ids).size !== ids.length ||
    !ids.includes(body.deliveryId)
  )
    throw letterError(
      "Select up to 50 different saved letters before continuing.",
      400,
    );
  const selected = ids.map((id) =>
    state.history.find((item) => item.id === id),
  );
  if (!selected.every(savedPostalAppealLetter))
    throw letterError(
      "A selected letter changed. Reload Letter history and select the unfinished postal letters again.",
      409,
    );
  const item = selected.find((entry) => entry.id === body.deliveryId);
  if (letterAppealsFinished(item))
    return { deliveryId: item.id, status: "complete", stop: false };
  assertLetterAppealPauseEnded(selected.map((entry) => entry.letterAppeals));
  if (item.postalDocument) {
    try {
      await readDocument(item.postalDocument);
    } catch (error) {
      if (!error.status) throw error;
      item.letterAppeals.status = "needs_review";
      item.letterAppeals.message = error.message;
      await store.saveLetterAppeals(item);
      return {
        deliveryId: item.id,
        status: "needs_review",
        stop: false,
        message: error.message,
      };
    }
  }
  // The existing recovery path rechecks NXT before writing only pending members.
  // Uncertain submissions are reconciled, never blindly replayed.
  const result = await sync(
    state,
    definitions,
    today,
    {
      action: "continue_letter_appeals",
      deliveryId: item.id,
      confirm: true,
    },
    store,
    ctx,
  );
  return { deliveryId: item.id, ...result };
}
