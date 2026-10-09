import { letterError } from "./societyLetters";
import { completeLetterAppealMembers } from "./societyLetterAppealMembers";

export const LETTER_DISPATCH_LIMIT = 10;

// A display/readiness check, not a substitute for checking saved document bytes.
export function completedPostalLetter(item) {
  const members = item?.members;
  const receipt = item?.letterAppeals;
  return Boolean(
    item?.channel === "post" &&
    ["prepared", "mailed"].includes(item.status) &&
    item.postalDocument?.id &&
    Array.isArray(members) &&
    members.length > 0 &&
    new Set(members.map(String)).size === members.length &&
    receipt?.status === "complete" &&
    completeLetterAppealMembers(receipt.members) &&
    receipt.members.length === members.length &&
    members.every((id) =>
      receipt.members.some((member) => String(member.id) === String(id)),
    ),
  );
}

export function selectedPostalLetters(history, batchId, ids) {
  if (
    typeof batchId !== "string" ||
    !batchId ||
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > LETTER_DISPATCH_LIMIT ||
    ids.some((id) => typeof id !== "string" || !id || id.length > 100) ||
    new Set(ids).size !== ids.length
  )
    throw letterError(
      "Choose up to 10 different completed letters from one batch.",
      400,
    );
  const items = ids.map((id) => history.find((item) => item.id === id));
  if (
    items.some(
      (item) => item?.batchId !== batchId || !completedPostalLetter(item),
    )
  )
    throw letterError(
      "A selected letter is not complete or has changed. Reload saved history and select the completed letters again. Nothing was changed.",
      409,
    );
  return items.sort(
    (a, b) => (a.postalApproval?.index ?? 0) - (b.postalApproval?.index ?? 0),
  );
}
