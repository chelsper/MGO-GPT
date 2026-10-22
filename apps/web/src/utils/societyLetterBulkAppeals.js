import { completeLetterAppealMembers } from "./societyLetterAppealMembers";

export const LETTER_APPEAL_SELECTION_LIMIT = 50;

export function savedPostalAppealLetter(item) {
  return (
    item?.channel === "post" &&
    item.status === "prepared" &&
    !!item.letterAppeals
  );
}

export function letterAppealsFinished(item) {
  return (
    item?.letterAppeals?.status === "complete" &&
    completeLetterAppealMembers(item.letterAppeals.members)
  );
}

export function unfinishedPostalAppealLetter(item) {
  return savedPostalAppealLetter(item) && !letterAppealsFinished(item);
}
