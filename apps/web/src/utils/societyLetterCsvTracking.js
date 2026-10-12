import { letterError } from "./societyLetters";
import {
  letterAppealsFinished,
  LETTER_APPEAL_SELECTION_LIMIT,
} from "./societyLetterBulkAppeals";

export function trackedCsvLetter(item) {
  return Boolean(
    item?.channel === "post" &&
    !item.postalDocument &&
    typeof item.csvMailMerge?.runId === "string" &&
    /^[a-f0-9]{64}$/.test(item.csvMailMerge.csvSha256 || "") &&
    item.csvMailMerge.confirmedAt &&
    item.csvMailMerge.confirmedBy,
  );
}

export function completedCsvLetter(item) {
  return (
    trackedCsvLetter(item) &&
    ["prepared", "mailed"].includes(item.status) &&
    !item.providerId &&
    letterAppealsFinished(item) &&
    Array.isArray(item.members) &&
    item.members.length > 0 &&
    item.members.length <= 2 &&
    new Set(item.members).size === item.members.length &&
    item.letterAppeals.members.length === item.members.length &&
    item.members.every((id) =>
      item.letterAppeals.members.some((member) => member.id === id),
    )
  );
}

export function selectedCsvLetters(history, batchId, ids) {
  if (
    typeof batchId !== "string" ||
    !batchId ||
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > LETTER_APPEAL_SELECTION_LIMIT ||
    ids.some((id) => typeof id !== "string" || !id || id.length > 100) ||
    new Set(ids).size !== ids.length
  )
    throw letterError(
      "Choose up to 50 different CSV-created letters from one batch.",
      400,
    );
  const items = ids.map((id) => history.find((item) => item.id === id));
  if (
    items.some((item) => item?.batchId !== batchId || !completedCsvLetter(item))
  )
    throw letterError(
      "Only CSV-created letters with all household appeals confirmed can be marked mailed. Reload history; nothing was changed.",
      409,
    );
  return items;
}
