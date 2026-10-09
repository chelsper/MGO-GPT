import { relationshipOnlyReceipt } from "./societyLetterAppealMembers";

// Pending after a rejected POST is not the same as never submitted. Keep any
// evidence of an attempt protected, even if a later read changes its status.
export function canReturnLetterToReview(item) {
  const receipt = item?.letterAppeals;
  const members = item?.members;
  return Boolean(
    item?.status === "prepared" &&
    item.channel === "post" &&
    !item.providerId &&
    typeof item.batchId === "string" &&
    item.postalApproval?.batchId === item.batchId &&
    item.postalDocument?.id &&
    ["pending", "needs_review"].includes(receipt?.status) &&
    Array.isArray(members) &&
    members.length > 0 &&
    members.length <= 2 &&
    members.every((id) => typeof id === "string" && /^[1-9]\d*$/.test(id)) &&
    new Set(members).size === members.length &&
    Array.isArray(receipt.members) &&
    receipt.members.length === members.length &&
    new Set(receipt.members.map((m) => m?.id)).size === members.length &&
    receipt.members.some((m) => m?.status === "pending") &&
    receipt.members.every(
      (m) =>
        m &&
        members.includes(m.id) &&
        (m.status === "pending" || relationshipOnlyReceipt(m)) &&
        ![
          "attemptedAt",
          "assignmentId",
          "verifiedAt",
          "failure",
          "lastWriteFailure",
        ].some((key) => Object.hasOwn(m, key)),
    ),
  );
}
