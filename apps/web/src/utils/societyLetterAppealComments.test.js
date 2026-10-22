import { describe, expect, it } from "vitest";
import {
  assertNxtAppealComments,
  compactLetterAppealComment,
  legacyLetterAppealComment,
} from "./societyLetterAppealComments";

describe("NXT appeal comment limits", () => {
  const item = {
    id: "00000000-0000-4000-8000-000000000001",
    period: { start: "2026-01-01", end: "2026-12-31" },
  };
  it("keeps a full unique letter reference within the NXT limit", () => {
    expect(compactLetterAppealComment(item)).toBe(`JUMGOGPT ${item.id}`);
    expect(compactLetterAppealComment(item)).toHaveLength(45);
    expect(legacyLetterAppealComment(item)).toHaveLength(150);
  });
  it.each(["", "Reason", "a".repeat(50)])(
    "preserves valid comments exactly",
    (value) => {
      expect(assertNxtAppealComments(value)).toBe(value);
    },
  );
  it.each([null, undefined, 123, "a".repeat(51)])(
    "refuses invalid comments without truncation",
    (value) => {
      expect(() => assertNxtAppealComments(value)).toThrow(/50 characters/);
    },
  );
  it("does not shorten arbitrary letter identifiers", () => {
    expect(() =>
      compactLetterAppealComment({ ...item, id: "not-a-letter-id" }),
    ).toThrow(/reference/);
  });
});
