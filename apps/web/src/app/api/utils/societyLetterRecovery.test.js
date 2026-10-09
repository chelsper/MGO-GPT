import { describe, expect, it, vi } from "vitest";
import { unsubmittedLetter } from "../../../../test/societyLetterRecoveryFixture";
import { returnLetterToReview } from "./societyLetterRecovery";

describe("return an approved unsubmitted letter", () => {
  it("uses only the locked saved record and preserves reviews, documents, and other letters", async () => {
    const item = unsubmittedLetter();
    const state = {
      history: [item, { ...unsubmittedLetter(), id: "other" }],
      recipient_reviews: { saved: { salutation: "Pat and Alex" } },
    };
    const before = structuredClone(state);
    const store = { returnLetterToReview: vi.fn() };
    await returnLetterToReview(
      state,
      { deliveryId: item.id, confirm: true, letterAppeals: { members: [] } },
      store,
    );
    expect(store.returnLetterToReview).toHaveBeenCalledExactlyOnceWith(item);
    expect(state).toEqual(before);
  });
  it.each(["missing", "attempted", "uncertain", "confirmed", "unconfirmed"])(
    "refuses %s without releasing anything",
    async (scenario) => {
      const item = unsubmittedLetter();
      if (scenario === "attempted")
        item.letterAppeals.members[1].attemptedAt = "2026-10-09T12:00:00Z";
      if (scenario === "uncertain")
        item.letterAppeals.members[1].status = "uncertain";
      if (scenario === "confirmed")
        item.letterAppeals.members[1].status = "verified";
      const store = { returnLetterToReview: vi.fn() };
      await expect(
        returnLetterToReview(
          { history: [item] },
          {
            deliveryId: scenario === "missing" ? "unknown" : item.id,
            confirm: scenario !== "unconfirmed",
          },
          store,
        ),
      ).rejects.toThrow();
      expect(store.returnLetterToReview).not.toHaveBeenCalled();
    },
  );
  it("propagates a concurrent state change instead of claiming a return succeeded", async () => {
    const item = unsubmittedLetter();
    const error = Object.assign(new Error("Changed"), { status: 409 });
    await expect(
      returnLetterToReview(
        { history: [item] },
        { deliveryId: item.id, confirm: true },
        { returnLetterToReview: vi.fn().mockRejectedValue(error) },
      ),
    ).rejects.toBe(error);
  });
});
