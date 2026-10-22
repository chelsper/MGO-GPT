import { unsubmittedLetter } from "./societyLetterRecoveryFixture";

export function completedLetter(overrides = {}) {
  const item = unsubmittedLetter();
  item.letterAppeals.status = "complete";
  item.letterAppeals.members.forEach((member) => {
    member.status = "verified";
  });
  return { ...item, ...overrides };
}
