import { letterError } from "@/utils/societyLetters";
import { canReturnLetterToReview } from "@/utils/societyLetterRecovery";

export async function returnLetterToReview(state, body, store) {
  if (body.confirm !== true)
    throw letterError("Confirm returning this unsubmitted letter to review.");
  const item = state.history.find((entry) => entry.id === body.deliveryId);
  if (!canReturnLetterToReview(item))
    throw letterError(
      "This letter cannot be returned automatically. Reload history; attempted, uncertain, and confirmed NXT updates remain protected.",
      409,
    );
  // The route holds the workspace lease. The store also compares the durable
  // receipt before releasing just this reservation; no NXT call is made.
  await store.returnLetterToReview(item);
}
