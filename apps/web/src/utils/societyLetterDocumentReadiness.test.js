import { describe, expect, it } from "vitest";
import {
  documentReady,
  letterMergeBlockers,
} from "./societyLetterDocumentReadiness";

describe("template-aware document readiness", () => {
  it("does not require unused fields or optional second lines and country", () => {
    expect(
      letterMergeBlockers({}, ["address_line_2", "country", "date"]),
    ).toEqual([]);
    expect(letterMergeBlockers({ salutation: "Alex" }, ["salutation"])).toEqual(
      [],
    );
  });
  it.each(["address_line_1", "city", "state", "zip"])(
    "links a missing %s to that exact editor field",
    (field) => {
      expect(
        letterMergeBlockers({ address: "A free-form address" }, [field, field]),
      ).toEqual([
        expect.objectContaining({
          code: "missing_merge_field",
          field,
          focus: field,
          action: "recipient",
          label: "Edit address",
        }),
      ]);
    },
  );
  it("checks the chosen name fields rather than requiring a salutation substitute", () => {
    expect(
      letterMergeBlockers({ firstName: "Alex", preferredName: "Lex" }, [
        "first_name",
      ]),
    ).toEqual([]);
    expect(letterMergeBlockers({ salutation: "Alex" }, ["first_name"])).toEqual(
      [
        expect.objectContaining({
          field: "first_name",
          focus: "first_name",
          label: "Edit greeting",
        }),
      ],
    );
  });
  it("requires review, eligibility, and explicit readiness rather than assuming a saved review is ready", () => {
    const row = {
      status: "ready",
      recipientReview: { status: "saved" },
      documentReadiness: { status: "ready" },
    };
    expect(documentReady(row)).toBe(true);
    expect(documentReady({ ...row, documentReadiness: undefined })).toBe(false);
    expect(
      documentReady({ ...row, documentReadiness: { status: "blocked" } }),
    ).toBe(false);
    expect(
      documentReady({ ...row, recipientReview: { status: "unreviewed" } }),
    ).toBe(false);
    expect(documentReady({ ...row, status: "excluded" })).toBe(false);
  });
});
