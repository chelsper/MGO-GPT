import { describe, expect, it } from "vitest";
import { importSetupPlan } from "./importSetupPlan";

function plan(defaults = {}, mappings = { firstName: "Given", title: "Title", addressLine1: "Street" }) {
  return importSetupPlan({ rows: [{ Given: "Avery", Title: "Dr.", Street: "1 Fictional Way" }],
    headers: ["Given", "Title", "Street", "Notes"], mappings, defaults });
}
const group = (value, name) => value.groups.find((item) => item.group === name);

describe("file-first requested import plan", () => {
  it("shows only selected fields and identifies unused columns without inferring changes", () => {
    const result = plan();
    expect(result.rowCount).toBe(1);
    expect(result.unusedHeaders).toEqual(["Notes"]);
    expect(result.groups.map((item) => item.group)).toEqual(["Name fields", "Individual profile fields", "Address fields"]);
    expect(group(result, "Name fields")).toMatchObject({ fields: ["First Name"], status: "Unchanged in NXT", checked: false });
    expect(group(result, "Address fields")).toMatchObject({ status: "Matching only", checked: false });
    expect(result.description).toContain("does not create constituents");
  });
  it.each(["new", "mixed"])("distinguishes creation fields from existing-record updates in %s mode", (intent) => {
    const result = plan({ importIntent: intent });
    expect(result.description).toContain("separate approval");
    for (const name of ["Name fields", "Individual profile fields"]) {
      expect(group(result, name).status).toBe("New individuals only");
      expect(group(result, name).description).toContain("Existing values will not be changed");
    }
    expect(group(result, "Address fields").status).toBe("Matching only");
  });
  it("shows requested changes, never counts them as completed", () => {
    const result = plan({ updateNameFields: true, updateIndividualProfileFields: true, updateAddressFields: true });
    for (const item of result.groups) expect(item).toMatchObject({ status: "For review", checked: true });
    expect(group(result, "Name fields").description).toContain("before approval");
  });
  it("does not pretend missing or blank columns contain changes", () => {
    expect(group(plan({}, { firstName: "Missing" }), "Name fields")).toMatchObject({ status: "Needs a column", choice: null });
    const empty = importSetupPlan({ headers: ["First"], mappings: { firstName: "First" }, rows: [{ First: " " }], defaults: { updateNameFields: true } });
    expect(empty.groups[0]).toMatchObject({ status: "No populated values", populatedRows: 0 });
    expect(empty.groups[0].description).toContain("blanks do not clear");
  });
  it("keeps contact decisions with the contact preflight, including two contact sets", () => {
    expect(plan({}, { email: "Given", email2: "Street", phoneNumber: "Title" }).groups).toEqual([]);
  });
  it("explains identifier use without ever treating external IDs as match keys", () => {
    const result = plan({}, { externalConstituentId: "Given" });
    expect(result.groups[0].description).toContain("audit reference only, never an NXT match or write");
  });
  it("surfaces code/relationship behavior and incomplete code mappings", () => {
    const mapping = { targetConstituency: "Given", educationInstitution: "Title", organizationName: "Street" };
    expect(group(plan({ defaultAction: "replace" }, mapping), "Constituent code fields").description).toContain("replacement");
    expect(group(plan({ useHierarchy: true }, mapping), "Constituent code fields").description).toContain("hierarchy rules are enabled");
    expect(group(plan({ educationRelationshipAction: "review-update" }, mapping), "Education relationship fields").description).toContain("exact existing NXT education row");
    expect(group(plan({}, mapping), "Organization relationship fields").description).toContain("not creating an organization constituent");
    expect(group(plan({}, { startDate: "Given" }), "Constituent code fields").status).toBe("Needs a new code column");
  });
  it("shows name builders and new-record defaults even without mapped format columns", () => {
    const result = plan({ importIntent: "mixed", updateNameFormatFields: true, buildNameFormats: true, newRecordNameFormats: { salutation: "1" } });
    expect(result.extras).toHaveLength(2);
    expect(result.extras[0]).toContain("even when no name-format column");
    expect(plan({ importIntent: "updates", newRecordNameFormats: { salutation: "1" } }).extras).toEqual([]);
    expect(group(plan({}, { addressee: "Given" }), "Addressee and salutation fields").status).toBe("Unchanged in NXT");
  });
  it("does not mutate source mappings, rows, or defaults", () => {
    const input = Object.freeze({ rows: Object.freeze([Object.freeze({ Name: "Avery" })]), headers: Object.freeze(["Name"]),
      mappings: Object.freeze({ firstName: "Name" }), defaults: Object.freeze({ importIntent: "new" }) });
    expect(() => importSetupPlan(input)).not.toThrow();
    expect(importSetupPlan().groups).toEqual([]);
  });
});
