import { describe, expect, it } from "vitest";
import { importMatchEvidence, matchingHouseholdAddress, qualifyImportMatchCandidates } from "./importMatchEvidence";
const input = { firstName: "Jane", lastName: "Dolphin", email: "jane@example.com", addressLine1: "42 North Main Street Apt 2", postalCode: "32211-1234", phone: "9045551234" };
const evidence = (value, source = input) => importMatchEvidence(source, { blackbaudConstituentId: "8", ...value });

describe("evidence-based import matches", () => {
  it.each([
    { firstName: "Jane", lastName: "Unrelated" },
    { firstName: "Other", lastName: "Dolphin" },
    { postalCode: "32211" },
    { address: "42 Completely Different Road", postalCode: "32211" },
    { email: "j.ane@example.com", firstName: "Other", lastName: "Person" },
    { firstName: "Janet", lastName: "Dolphin" },
  ])("does not suggest weak or irrelevant evidence: %j", (candidate) => expect(evidence(candidate).rank).toBe(0));
  it("normalizes names and ignores middle names without requiring email or address", () => {
    expect(evidence({ name: "JANE Anne Dolphin" }).category).toBe("Needs comparison");
    expect(evidence({ firstName: "Jose", lastName: "ONeil" }, { firstName: "Jos\u00e9", lastName: "O'Neil" }).rank).toBe(70);
  });
  it("keeps exact email with conflicting names in human comparison", () => {
    expect(evidence({ firstName: "Other", lastName: "Person", email: " JANE@example.com " })).toMatchObject({ rank: 90, category: "Needs comparison", nameConflict: true });
  });
  it("does not cross-match system and lookup IDs", () => {
    expect(evidence({ lookupId: "123" }, { blackbaudConstituentId: "123" }).rank).toBe(0);
    expect(evidence({ blackbaudConstituentId: "123" }, { lookupId: "123" }).rank).toBe(0);
    expect(evidence({ lookupId: "123" }, { lookupId: "123" }).category).toBe("Strong match");
  });
  it("holds conflicting supplied identifiers for comparison", () => {
    expect(evidence({ lookupId: "A" }, { blackbaudConstituentId: "8", lookupId: "B" })).toMatchObject({ category: "Needs comparison", identityConflict: true });
  });
  it("requires supporting contact evidence for a nickname or one-character variation", () => {
    expect(evidence({ firstName: "Janet", lastName: "Dolphin", phone: "+1 (904) 555-1234" }).rank).toBe(60);
    expect(evidence({ firstName: "Bob", lastName: "Dolphin", phone: "9045551234" }, { ...input, firstName: "Robert" }).rank).toBe(60);
    expect(evidence({ firstName: "Bob", lastName: "Dolphin" }, { ...input, firstName: "Robert" }).rank).toBe(0);
  });
  it("compares units and labels a shared full address as a household", () => {
    expect(evidence({ address: "42 N Main St\nUnit 2", postalCode: "32211" }).category).toBe("Possible household");
    expect(evidence({ address: "42 N Main St #3", postalCode: "32211" }).rank).toBe(0);
    expect(matchingHouseholdAddress(input, { addressLine1: "42 N Main St", addressLine2: "Apt 2", postalCode: "32211" })).toBe(true);
    expect(evidence({ address: "42 N Main St Apt 2", postalCode: "32212" }).rank).toBe(0);
  });
  it("filters a broad 25-person response and ranks only qualifying evidence", () => {
    const values = Array.from({ length: 25 }, (_, i) => ({ blackbaudConstituentId: String(i), firstName: "Other", lastName: `Person${i}` }));
    values.push({ blackbaudConstituentId: "name", name: "Jane Dolphin" }, { blackbaudConstituentId: "email", email: input.email });
    expect(qualifyImportMatchCandidates(input, values).map((value) => value.blackbaudConstituentId)).toEqual(["email", "name"]);
  });
});
