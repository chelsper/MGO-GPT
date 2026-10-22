import { completeLetterAppealMembers } from "./societyLetterAppealMembers";

export const LETTER_HISTORY_FILTERS = [
  ["all", "All batches"],
  ["ready_to_mail", "Ready to mail"],
  ["in_progress", "In progress"],
  ["completed", "Mailed / emailed"],
];

export function letterHistoryFilter(value) {
  return LETTER_HISTORY_FILTERS.some(([key]) => key === value) ? value : "all";
}

// Saved progress only. These facets never authorize a download or an NXT write.
export function isLetterReadyToMail(item) {
  const receipts = item.letterAppeals;
  return (
    item.status === "prepared" &&
    item.channel === "post" &&
    (!receipts ||
      (receipts.status === "complete" &&
        completeLetterAppealMembers(receipts.members)))
  );
}

export function isLetterInProgress(item) {
  return (
    ["prepared", "pending_email", "sending", "needs_review"].includes(
      item.status,
    ) && !isLetterReadyToMail(item)
  );
}

export function matchesLetterHistory(batch, filter) {
  if (filter === "ready_to_mail") return batch.items.some(isLetterReadyToMail);
  if (filter === "in_progress") return batch.items.some(isLetterInProgress);
  if (filter === "completed")
    return batch.items.some((item) =>
      ["mailed", "emailed", "delivered"].includes(item.status),
    );
  return true;
}

export function searchLetterHistory(batch, search) {
  const query = search.trim().toLocaleLowerCase();
  return (
    !query ||
    batch.items.some((item) =>
      [
        item.name,
        item.addressee,
        item.societyName,
        item.householdId,
        ...(item.members || []),
      ].some((value) =>
        String(value || "")
          .toLocaleLowerCase()
          .includes(query),
      ),
    )
  );
}
