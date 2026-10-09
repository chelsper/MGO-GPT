import { describe, expect, it } from "vitest";
import { completedLetter } from "../../test/societyLetterDispatchFixture";
import {
  completedPostalLetter,
  selectedPostalLetters,
} from "./societyLetterDispatch";

describe("explicit completed-letter selections", () => {
  it("keeps the approved order, includes mailed re-downloads, and does not alter history", () => {
    const first = completedLetter();
    const last = completedLetter({
      id: "last",
      status: "mailed",
      postalApproval: { ...first.postalApproval, index: 4 },
    });
    const blocked = completedLetter({
      id: "blocked",
      letterAppeals: { status: "pending" },
    });
    const history = [blocked, last, first];
    const before = structuredClone(history);
    expect(
      selectedPostalLetters(history, first.batchId, [last.id, first.id]),
    ).toEqual([first, last]);
    expect(history).toEqual(before);
  });
  it.each([
    "pending",
    "uncertain",
    "missing-member",
    "wrong-member",
    "duplicate-member",
    "missing-receipt",
    "missing-document",
    "cancelled",
    "email",
  ])("rejects %s instead of silently omitting it", (kind) => {
    const item = completedLetter();
    if (["pending", "uncertain"].includes(kind))
      item.letterAppeals.members[1].status = kind;
    if (kind === "missing-member") item.letterAppeals.members.pop();
    if (kind === "wrong-member") item.letterAppeals.members[1].id = "other";
    if (kind === "duplicate-member") item.letterAppeals.members[1].id = "10";
    if (kind === "missing-receipt") delete item.letterAppeals;
    if (kind === "missing-document") delete item.postalDocument;
    if (kind === "cancelled") item.status = "cancelled";
    if (kind === "email") item.channel = "email";
    expect(completedPostalLetter(item)).toBe(false);
    expect(() =>
      selectedPostalLetters([item], item.batchId, [item.id]),
    ).toThrow(/not complete/);
  });
  it("accepts a genuinely checked relationship-only spouse", () => {
    const item = completedLetter();
    item.letterAppeals.members[1] = {
      id: "11",
      status: "not_applicable",
      reason: "relationship_only",
      checkedAt: "2026-10-09T12:00:00Z",
    };
    expect(completedPostalLetter(item)).toBe(true);
    delete item.letterAppeals.members[1].checkedAt;
    expect(completedPostalLetter(item)).toBe(false);
  });
  it.each([
    undefined,
    [],
    ["same", "same"],
    [null],
    [1],
    Array.from({ length: 11 }, (_, i) => String(i)),
  ])("rejects malformed selections %j", (ids) => {
    expect(() => selectedPostalLetters([], "batch", ids)).toThrow(
      /Choose up to 10/,
    );
  });
  it("rejects unknown IDs and foreign batches", () => {
    const item = completedLetter();
    expect(() =>
      selectedPostalLetters([item], item.batchId, ["unknown"]),
    ).toThrow(/changed/);
    expect(() => selectedPostalLetters([item], "other", [item.id])).toThrow(
      /changed/,
    );
  });
});
