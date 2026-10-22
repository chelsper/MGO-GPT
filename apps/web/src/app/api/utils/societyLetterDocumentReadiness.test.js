import { describe, expect, it } from "vitest";
import {
  templateFixture,
  wordFixture,
} from "../../../../test/societyLetterFixture";
import {
  inspectDocumentRequirements,
  documentReadinessForRow,
} from "./societyLetterDocumentReadiness";
import {
  validateLetterTemplate,
  renderSocietyLetter,
} from "./societyLetterDocuments";

describe("saved letter document requirements", () => {
  const template = validateLetterTemplate({
    ...templateFixture(),
    content: wordFixture(
      "{salutation} {address_line_1} {address_line_2} {city}, {state} {zip} {country}",
    ).generate({ type: "base64" }),
  });
  const row = {
    householdId: "10",
    salutation: "Alex",
    societyName: "Example Society",
    period: { start: "2026-01-01", end: "2026-12-31" },
    addressParts: {
      address_line_1: "10 Test St",
      city: "Example",
      state: "FL",
      zip: "00000",
    },
  };
  it("derives requirements from Word even when old metadata is missing or inaccurate", () => {
    const requirements = inspectDocumentRequirements({
      ...template,
      usedFields: ["salutation"],
    });
    expect(requirements.fields).toEqual(
      expect.arrayContaining(["city", "state", "zip"]),
    );
    const review = { status: "saved" };
    expect(documentReadinessForRow(row, review, requirements).status).toBe(
      "ready",
    );
    expect(() =>
      renderSocietyLetter(template, row, "2026-10-09"),
    ).not.toThrow();
    const missing = { ...row, addressParts: { ...row.addressParts, city: "" } };
    const result = documentReadinessForRow(missing, review, requirements);
    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual([
      expect.objectContaining({ field: "city", householdId: "10" }),
    ]);
    try {
      renderSocietyLetter(template, missing, "2026-10-09");
      expect.fail("Renderer should reject the same missing field");
    } catch (error) {
      expect(error.blockers).toEqual(result.blockers);
    }
    expect(review).toEqual({ status: "saved" });
  });
  it("keeps template repairs separate from recipient review", () => {
    for (const [value, code] of [
      [null, "template_missing"],
      [{ content: "invalid" }, "template_invalid"],
    ]) {
      const result = documentReadinessForRow(
        row,
        { status: "saved" },
        inspectDocumentRequirements(value),
      );
      expect(result.blockers).toEqual([
        expect.objectContaining({ code, action: "templates" }),
      ]);
    }
  });
  it("still requires a valid saved review even when every template field is present", () => {
    const result = documentReadinessForRow(
      row,
      { status: "unreviewed", reason: "expired" },
      inspectDocumentRequirements(template),
    );
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: "recipient_review_required",
        message: expect.stringContaining("15 days"),
      }),
    ]);
  });
});
