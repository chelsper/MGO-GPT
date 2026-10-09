import { letterError } from "./societyLetters";

// Blackbaud RE Import Guide, Constituent Appeal Fields (CAPComment).
export const NXT_APPEAL_COMMENT_LIMIT = 50;

export function assertNxtAppealComments(comments) {
  if (
    typeof comments !== "string" ||
    comments.length > NXT_APPEAL_COMMENT_LIMIT
  )
    throw letterError(
      "NXT appeal comments must be 50 characters or fewer. Shorten the comments before continuing; no appeal was submitted.",
    );
  return comments;
}

export function compactLetterAppealComment(item) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.id))
    throw letterError(
      "The saved letter reference needs review before updating NXT.",
    );
  return assertNxtAppealComments(`JUMGOGPT ${item.id}`);
}

export function legacyLetterAppealComment(item) {
  return `Society letter created in JUMGOGPT. Period ${item.period.start} to ${item.period.end}. Letter ${item.id}. Postal dispatch recorded separately.`;
}
