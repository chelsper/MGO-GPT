import { completedLetter } from "./societyLetterDispatchFixture";

export function completedCsvFixture(overrides = {}) {
  const item = completedLetter(overrides);
  delete item.postalDocument;
  delete item.postalApproval;
  item.csvMailMerge = {
    runId: "33333333-3333-4333-8333-333333333333",
    csvSha256: "a".repeat(64),
    confirmedAt: "2026-10-12T12:00:00.000Z",
    confirmedBy: 1,
  };
  return item;
}
