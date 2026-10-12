import { describe, expect, it } from "vitest";
import {
  completedCsvLetter,
  selectedCsvLetters,
} from "./societyLetterCsvTracking";
import { completedPostalLetter } from "./societyLetterDispatch";
import { canReturnLetterToReview } from "./societyLetterRecovery";
import { completedCsvFixture } from "../../test/societyLetterCsvTrackingFixture";

describe("CSV-created letter boundaries", () => {
  it("is eligible for mailing, not a generated PDF or Word download", () => {
    const item = completedCsvFixture();
    expect(completedCsvLetter(item)).toBe(true);
    expect(completedPostalLetter(item)).toBe(false);
    expect(selectedCsvLetters([item], item.batchId, [item.id])).toEqual([item]);
  });
  it.each([
    "pending",
    "uncertain",
    "different_member",
    "duplicate_member",
    "no_confirmation",
    "no_digest",
    "emailed",
    "cancelled",
  ])("blocks unsafe mailing: %s", (mode) => {
    const item = completedCsvFixture();
    if (["pending", "uncertain"].includes(mode))
      item.letterAppeals.members[0].status = mode;
    if (mode === "different_member") item.members[0] = "999";
    if (mode === "duplicate_member") item.members.push(item.members[0]);
    if (mode === "no_confirmation") delete item.csvMailMerge.confirmedAt;
    if (mode === "no_digest") delete item.csvMailMerge.csvSha256;
    if (["emailed", "cancelled"].includes(mode)) item.status = mode;
    expect(completedCsvLetter(item)).toBe(false);
    expect(() => selectedCsvLetters([item], item.batchId, [item.id])).toThrow();
  });
  it("requires a nonempty unique selection from the same batch, capped at 50", () => {
    const first = completedCsvFixture();
    const items = Array.from({ length: 51 }, (_, index) => ({
      ...first,
      id: String(index),
    }));
    expect(
      selectedCsvLetters(
        items,
        first.batchId,
        items.slice(0, 50).map((item) => item.id),
      ),
    ).toHaveLength(50);
    for (const ids of [
      [],
      ["0", "0"],
      ["missing"],
      items.map((item) => item.id),
    ])
      expect(() => selectedCsvLetters(items, first.batchId, ids)).toThrow();
    expect(() => selectedCsvLetters(items, "another", ["0"])).toThrow();
  });
  it("allows correction only before any attempted NXT write", () => {
    const item = completedCsvFixture();
    item.letterAppeals.status = "needs_review";
    item.letterAppeals.members.forEach((member) => {
      member.status = "pending";
    });
    expect(canReturnLetterToReview(item)).toBe(true);
    item.letterAppeals.members[0].attemptedAt = "2026-10-12";
    expect(canReturnLetterToReview(item)).toBe(false);
  });
});
