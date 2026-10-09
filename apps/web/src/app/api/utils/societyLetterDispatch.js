import { letterError } from "@/utils/societyLetters";
import { selectedPostalLetters } from "@/utils/societyLetterDispatch";
import { savedPostalDocument } from "./societyLetterPostalBatches";

export async function mailSelectedLetters(
  state,
  body,
  store,
  readDocument = savedPostalDocument,
) {
  if (body.confirm !== true || body.automatic === true)
    throw letterError(
      "Confirm that these selected letters have actually been mailed.",
    );
  const items = selectedPostalLetters(
    state.history,
    body.batchId,
    body.deliveryIds,
  );
  // Check every approved document before the single atomic status update.
  for (const item of items) await readDocument(item.postalDocument);
  await store.mailSelectedLetters(body.batchId, items);
}
