import { describe, expect, it } from "vitest";
import { unsubmittedLetter } from "../../test/societyLetterRecoveryFixture";
import { canReturnLetterToReview } from "./societyLetterRecovery";

describe("return to review eligibility", () => {
  it.each(["pending", "needs_review"])(
    "allows an unattempted %s letter without changing it",
    (status) => {
      const item = unsubmittedLetter();
      item.letterAppeals.status = status;
      const before = structuredClone(item);
      expect(canReturnLetterToReview(item)).toBe(true);
      expect(item).toEqual(before);
    },
  );
  it.each([
    "attemptedAt",
    "assignmentId",
    "verifiedAt",
    "failure",
    "lastWriteFailure",
  ])(
    "blocks any %s evidence on either member, including an empty value",
    (key) => {
      for (const index of [0, 1]) {
        const item = unsubmittedLetter();
        item.letterAppeals.members[index][key] = "";
        expect(canReturnLetterToReview(item)).toBe(false);
      }
    },
  );
  it.each(["uncertain", "verified", "failed", "unknown"])(
    "blocks %s members",
    (status) => {
      const item = unsubmittedLetter();
      item.letterAppeals.members[1].status = status;
      expect(canReturnLetterToReview(item)).toBe(false);
    },
  );
  it.each(["mailed", "cancelled", "sending"])(
    "blocks a %s letter",
    (status) => {
      expect(canReturnLetterToReview({ ...unsubmittedLetter(), status })).toBe(
        false,
      );
    },
  );
  it("requires an exact, complete member set and an approved postal document", () => {
    for (const mutate of [
      (i) => {
        i.members = [];
      },
      (i) => {
        i.members = ["10", "10"];
      },
      (i) => {
        i.members[0] = 10;
      },
      (i) => {
        i.letterAppeals.members.pop();
      },
      (i) => {
        i.letterAppeals.members[1].id = "10";
      },
      (i) => {
        i.letterAppeals.members[1] = null;
      },
      (i) => {
        i.letterAppeals.status = "complete";
      },
      (i) => {
        i.channel = "email";
      },
      (i) => {
        i.providerId = "submitted";
      },
      (i) => {
        delete i.postalApproval;
      },
      (i) => {
        delete i.postalDocument;
      },
      (i) => {
        i.postalApproval.batchId = "other";
      },
    ]) {
      const item = unsubmittedLetter();
      mutate(item);
      expect(canReturnLetterToReview(item)).toBe(false);
    }
    expect(canReturnLetterToReview(null)).toBe(false);
  });
  it("permits a read-only relationship-only determination but never an attempted spouse", () => {
    const item = unsubmittedLetter();
    item.letterAppeals.members[1] = {
      id: "11",
      status: "not_applicable",
      reason: "relationship_only",
      checkedAt: "2026-10-09T12:00:00Z",
    };
    expect(canReturnLetterToReview(item)).toBe(true);
    item.letterAppeals.members[1].attemptedAt = "2026-10-09T12:00:00Z";
    expect(canReturnLetterToReview(item)).toBe(false);
  });
});
