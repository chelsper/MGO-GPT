import { describe, expect, it } from "vitest";
import {
  createInitialFamilyReview,
  getFamilyRowReadiness,
  normalizeFamilyImportRow,
  validateFamilyImportInput,
} from "./familyImport";

describe("family import helpers", () => {
  const rawRow = {
    "Family Key": "FAMILY-14",
    "Student Lookup ID": "543210",
    "Parent 1 First Name": "Jordan",
    "Parent 1 Last Name": "Morgan",
    "Parent 1 Relation Code": "Parent",
    "Parent 1 Recip Relation Code": "Child",
    "Parent 1 Email": "jordan@example.edu",
    "Parent 1 Email Type": "Email - Home",
    "Parent 2 First Name": "Casey",
    "Parent 2 Last Name": "Morgan",
    "Parent 2 Relation Code": "Parent",
    "Parent 2 Reciprocal Relation Code": "Child",
    "Spouse Relation Code": "Spouse",
    "Spouse Reciprocal Relation Code": "Spouse",
    "Household Head": "Parent 2",
  };

  it("normalizes the family row and accepts the reciprocal relation alias", () => {
    const input = normalizeFamilyImportRow(rawRow, 7);

    expect(input).toMatchObject({
      rowNumber: 7,
      familyKey: "FAMILY-14",
      student: { lookupId: "543210" },
      parents: [
        { key: "parent1", relationCode: "Parent", reciprocalRelationCode: "Child" },
        { key: "parent2", relationCode: "Parent", reciprocalRelationCode: "Child" },
      ],
      relationships: {
        spouse: {
          enabled: true,
          type: "Spouse",
          reciprocalType: "Spouse",
          householdHead: "parent2",
        },
      },
    });
  });

  it("requires explicit selections before a family row is ready", () => {
    const input = normalizeFamilyImportRow(rawRow, 7);
    const review = createInitialFamilyReview(input);

    expect(getFamilyRowReadiness(input, review)).toMatchObject({ ready: false });

    review.selections.student = {
      mode: "existing",
      candidate: { blackbaudConstituentId: "100", lookupId: "543210" },
    };
    review.selections.parent1 = { mode: "create", confirmed: true };
    review.selections.parent2 = {
      mode: "existing",
      candidate: { blackbaudConstituentId: "200", lookupId: "200" },
    };

    expect(getFamilyRowReadiness(input, review)).toMatchObject({ ready: true, missing: [] });
  });

  it("does not allow an incomplete student reference", () => {
    const input = normalizeFamilyImportRow(
      {
        "Parent 1 First Name": "Jordan",
        "Parent 1 Last Name": "Morgan",
        "Parent 1 Relation Code": "Parent",
        "Parent 1 Reciprocal Relation Code": "Child",
      },
      1,
    );

    expect(validateFamilyImportInput(input).errors).toContain(
      "Provide the student's NXT System ID or Lookup ID. A first and last name can be used for a manual search, but the student cannot be created by this import.",
    );
  });

  it("uses relationship codes saved in review instead of stale CSV codes", () => {
    const input = normalizeFamilyImportRow(
      {
        "Student Lookup ID": "543210",
        "Parent 1 First Name": "Jordan",
        "Parent 1 Last Name": "Morgan",
        "Parent 1 Relation Code": "",
        "Parent 1 Reciprocal Relation Code": "",
      },
      1,
    );
    const review = createInitialFamilyReview(input);
    review.selections.student = {
      mode: "existing",
      candidate: { blackbaudConstituentId: "100" },
    };
    review.selections.parent1 = { mode: "create", confirmed: true };
    review.relationships.parent1 = { type: "Parent", reciprocalType: "Child" };

    expect(getFamilyRowReadiness(input, review)).toMatchObject({ ready: true, errors: [] });
  });
});
