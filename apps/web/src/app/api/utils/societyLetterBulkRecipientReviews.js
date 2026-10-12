import { letterError } from "@/utils/societyLetters";
import {
  BULK_RECIPIENT_REVIEW_LIMIT,
  sharedLetterAddresses,
  straightforwardRecipient,
} from "@/utils/societyLetterReviewTriage";
import {
  letterWorkspace,
  letterSourceSignature,
} from "./societyLetterWorkflow";
import { saveLetterRecipientReviews } from "./societyLetterRecipients";

export async function confirmStraightforwardRecipients(
  state,
  definitions,
  today,
  body,
  store,
  userId,
) {
  if (
    body.confirm !== true ||
    !Array.isArray(body.recipients) ||
    !body.recipients.length ||
    body.recipients.length > BULK_RECIPIENT_REVIEW_LIMIT ||
    body.recipients.some(
      (item) =>
        !item ||
        typeof item.householdId !== "string" ||
        typeof item.reviewToken !== "string",
    ) ||
    new Set(body.recipients.map((item) => item.householdId)).size !==
      body.recipients.length
  )
    throw letterError(
      "Confirm the selected recipient suggestions before saving.",
    );
  if (
    body.revision !== state.revision ||
    body.suggestionsRevision !== state.revision
  )
    throw letterError(
      "The workspace changed. Reload and check the current suggestions before confirming.",
      409,
    );
  const workspace = letterWorkspace(state, definitions, today);
  if (
    workspace.settings?.sourceMode !== "society_queries" ||
    !workspace.setup.membershipCurrent ||
    (state.job && state.job.status !== "complete")
  )
    throw letterError(
      "Finish the membership refresh before confirming recipient suggestions.",
      409,
    );
  const rows = new Map(workspace.rows.map((row) => [row.householdId, row]));
  const addresses = sharedLetterAddresses(workspace.rows);
  const templates = new Map(
    workspace.templates.map((template) => [
      template.societyKey,
      template.usedFields,
    ]),
  );
  // Recompute from the full saved workspace, never trust client flags or values.
  // Validate every selection before one atomic save; no NXT calls are made here.
  const selections = body.recipients.map((item) => {
    const row = rows.get(item.householdId);
    const values =
      row &&
      straightforwardRecipient(
        row,
        addresses.get(row.householdId),
        templates.get(row.societyKey),
      );
    if (!values || item.reviewToken !== row.recipientReview.token)
      throw letterError(
        "A selected recipient changed or needs individual review. Reload suggestions; no recipient choices were saved.",
        409,
      );
    return {
      row,
      body: { ...values, reviewToken: item.reviewToken, confirm: true },
    };
  });
  await saveLetterRecipientReviews(
    state,
    selections,
    letterSourceSignature(state, definitions),
    store,
    userId,
  );
}
