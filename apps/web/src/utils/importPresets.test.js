import { describe, expect, it } from "vitest";
import { IMPORT_FIELDS } from "./importFieldDefinitions";
import { IMPORT_PRESETS, importPresetConfiguration } from "./importPresets";
import { importSetupFileBlockers } from "./importSetups";
import { importContactPreflight } from "./importContactPreflight";

describe("guided import preset configuration", () => {
  it("offers only the three supported starting points and rejects unknown choices", () => {
    expect(IMPORT_PRESETS.map(({ id }) => id)).toEqual(["new", "updates", "custom"]);
    expect(() => importPresetConfiguration("other")).toThrow();
  });
  it("maps recognized aliases for new people and includes contacts for review without inventing types or primary flags", () => {
    const result = importPresetConfiguration("new", ["Given Name", "Surname", "Email", "Phone", "New Constituent Code"]);
    expect(result.mappings).toEqual({ firstName: "Given Name", lastName: "Surname", email: "Email", phoneNumber: "Phone", targetConstituency: "New Constituent Code" });
    expect(result.defaults).toMatchObject({ importIntent: "new", defaultAction: "add", updateEmailFields: true, updatePhoneFields: true,
      defaultEmailType: "", defaultPhoneType: "", updateNameFields: false, updateIndividualProfileFields: false, updateNameFormatFields: false, useHierarchy: false });
    expect(JSON.stringify(result)).not.toMatch(/importSetupConfirmed|reusableSetup|contactDecisions|fieldDecisions|targetId|writePlan|Make Primary/);
  });
  it("retains new-person addresses for duplicate matching without requesting address writes", () => {
    const result = importPresetConfiguration("new", ["Address Line 1", "ZIP", "Address Make Primary?"]);
    expect(result.mappings).toMatchObject({ addressLine1: "Address Line 1", postalCode: "ZIP", addressMakePrimary: "Address Make Primary?", firstName: "", lastName: "" });
    expect(result.defaults.updateAddressFields).toBe(false);
  });
  it("uses explicit lookup IDs without substituting ambiguous constituent IDs", () => {
    const result = importPresetConfiguration("updates", ["NXT Lookup ID", "Constituent ID", "Email"]);
    expect(result.mappings).toMatchObject({ lookupId: "NXT Lookup ID", externalConstituentId: "Constituent ID" });
    expect(result.mappings).not.toHaveProperty("blackbaudConstituentId");
    const onlyExternal = importPresetConfiguration("updates", ["Constituent ID", "Email"]);
    expect(onlyExternal.mappings.blackbaudConstituentId).toBe("");
    expect(importSetupFileBlockers([{ "Constituent ID": "SOURCE-1", Email: "a@example.test" }], onlyExternal.mappings, { ...onlyExternal.defaults, reusableSetup: true })).toEqual(expect.arrayContaining([expect.stringMatching(/update-only setups require/)]));
  });
  it("requires an ID on every update row, including mixed blank IDs", () => {
    const result = importPresetConfiguration("updates", ["NXT System ID", "Email"]);
    expect(importSetupFileBlockers([{ "NXT System ID": "11", Email: "a@example.test" }, { "NXT System ID": "", Email: "b@example.test" }], result.mappings, { ...result.defaults, reusableSetup: true })).toEqual([expect.stringMatching(/Row 2: update-only setups require/)]);
  });
  it("does not include unrelated custom-field or relationship additions in contact presets", () => {
    const headers = IMPORT_FIELDS.map(({ header }) => header);
    for (const id of ["new", "updates"]) {
      const result = importPresetConfiguration(id, headers);
      for (const key of ["customFieldValue", "educationInstitution", "organizationName", "sourceConstituency", "salutation", "title"]) expect(result.mappings).not.toHaveProperty(key);
      expect(result.defaults).toMatchObject({ defaultAction: "add", educationRelationshipAction: "add", customFieldCategory: "", buildNameFormats: false, newRecordNameFormats: { addressee: "", salutation: "" } });
    }
  });
  it("limits custom-field suggestions to identity and custom columns without loading or choosing an NXT category", () => {
    const result = importPresetConfiguration("custom", IMPORT_FIELDS.map(({ header }) => header));
    expect(Object.keys(result.mappings)).toEqual(expect.arrayContaining(["blackbaudConstituentId", "lookupId", "customFieldValue", "customFieldDate", "customFieldComment"]));
    for (const key of ["email", "phoneNumber", "addressLine1", "targetConstituency", "educationInstitution", "organizationName"]) expect(result.mappings).not.toHaveProperty(key);
    expect(result.defaults).toMatchObject({ importIntent: "updates", customFieldCategory: "", updateEmailFields: false, updatePhoneFields: false, updateNameFields: false, updateAddressFields: false });
  });
  it("keeps absent and ambiguous required columns visible for explicit repair", () => {
    expect(importPresetConfiguration("new", ["First Name", "first_name"]).mappings).toEqual({ firstName: "", lastName: "" });
    expect(importPresetConfiguration("custom").mappings).toEqual({ blackbaudConstituentId: "NXT System ID", customFieldValue: "Custom Field Value" });
  });
  it("keeps primary conflicts blocked and does not carry options to a replacement file", () => {
    const first = importPresetConfiguration("new", ["First Name", "Last Name", "Email Address", "Email Make Primary?", "Email 2 Address", "Email 2 Make Primary?"]);
    const plan = importContactPreflight([{ "Email Address": "one@example.test", "Email Make Primary?": "Yes", "Email 2 Address": "two@example.test", "Email 2 Make Primary?": "Yes" }], first.mappings, first.defaults);
    expect(plan.blockers.length).toBeGreaterThan(0);
    first.defaults.customFieldCategory = "Should not carry";
    first.defaults.defaultEmailType = "Personal";
    const next = importPresetConfiguration("new", ["First Name", "Last Name", "Phone"]);
    expect(next.defaults).toMatchObject({ updateEmailFields: false, updatePhoneFields: true, defaultEmailType: "", customFieldCategory: "" });
    expect(next.mappings).not.toHaveProperty("emailMakePrimary");
  });
});
