import { describe, expect, it } from "vitest";
import { importSetupActiveFields, importSetupFileBlockers, normalizeImportSetup } from "./importSetups";
import { IMPORT_CONTACT_GROUPS, importContactMappingKey } from "./importContactPreflight";

const mappings = { blackbaudConstituentId: "Record", email: "Email", emailMakePrimary: "Primary" };
const base = () => ({ name: "Update contacts", mappings, defaults: { importIntent: "updates", updateEmailFields: true, defaultEmailType: "Personal" } });

describe("reusable import configuration", () => {
  it("stores only allowlisted reusable values, never approvals or record-specific decisions", () => {
    const source = { ...base(), rows: [{ firstName: "Private" }], sourceFilename: "private.csv", match: { id: "123" },
      defaults: { ...base().defaults, createdBlackbaudConstituentId: "123", importSetupConfirmed: true, reusableSetup: true, makePrimary: true,
        contactDecisions: { 1: { targetId: "123" } }, approved: true, newRecordNameFormats: { addressee: "12", salutation: "23", arbitrary: "private" } } };
    const value = normalizeImportSetup(source);
    expect(Object.keys(value)).toEqual(["version", "name", "mappings", "defaults"]);
    expect(value.defaults).toMatchObject({ importIntent: "updates", updateEmailFields: true, defaultEmailType: "Personal", newRecordNameFormats: { addressee: "12", salutation: "23" } });
    expect(JSON.stringify(value)).not.toMatch(/Private|private|123|approved|targetId|importSetupConfirmed|reusableSetup|makePrimary/);
    expect(importSetupActiveFields(value)).toMatchObject({ email: true, firstName: false, emailMakePrimary: true });
  });
  it("retains an intentional omission only for the exact column mapping", () => {
    const key = importContactMappingKey(mappings, IMPORT_CONTACT_GROUPS[0]);
    const value = normalizeImportSetup({ ...base(), defaults: { contactMatchingOnly: { email: key } } });
    expect(value.defaults.contactMatchingOnly.email).toBe(key);
    const changed = normalizeImportSetup({ ...value, mappings: { ...mappings, email: "New email" } });
    expect(changed.defaults.contactMatchingOnly).toEqual({});
  });
  it.each([
    { name: "" }, { name: "a".repeat(81) }, { version: 2 }, { mappings: { targetId: "Private" } },
    { mappings: {} }, { mappings: { email: "Email", phoneNumber: "Email" } },
    { defaults: { importIntent: "create-no-checks" } }, { defaults: { updateEmailFields: "yes" } },
    { defaults: { defaultEmailType: "Home\nOther" } }, { defaults: { newRecordNameFormats: { addressee: "custom value" } } },
  ])("rejects unsupported or ambiguous settings %j", (patch) => {
    expect(() => normalizeImportSetup({ ...base(), ...patch })).toThrow();
  });
  it("does not guess renamed headers or use email instead of an ID for update setups", () => {
    const defaults = { reusableSetup: true, importIntent: "updates" };
    expect(importSetupFileBlockers([{ Record: "123", Email: "a@example.test", Primary: "Yes" }], mappings, defaults)).toEqual([]);
    expect(importSetupFileBlockers([{ Record: "", Email: "a@example.test", Primary: "" }], mappings, defaults, 4)[0]).toMatch(/Row 5.*require an NXT/);
    expect(importSetupFileBlockers([{ record: "123", Email: "a@example.test", Primary: "" }], mappings, defaults)[0]).toMatch(/expected Record/);
    expect(importSetupFileBlockers([{ Record: "123", Email: "a@example.test" }], mappings, defaults)[0]).toMatch(/Primary/);
  });
  it("accepts lookup IDs and requires fresh checks rather than previous targets", () => {
    const columns = { lookupId: "Lookup", email: "Email" };
    expect(importSetupFileBlockers([{ Lookup: "ALUM-1", Email: "a@example.test" }], columns, { reusableSetup: true, importIntent: "updates" })).toEqual([]);
    expect(importSetupFileBlockers([{ Lookup: "", Email: "a@example.test", targetId: "123" }], columns, { reusableSetup: true, importIntent: "updates" })).toHaveLength(1);
  });
  it("rejects unsupported primary flag values rather than treating them as blank", () => {
    expect(importSetupFileBlockers([{ Record: "123", Email: "a@example.test", Primary: "maybe" }], mappings, { reusableSetup: true, importIntent: "updates" })[0]).toMatch(/use Yes or No/);
  });
  it("leaves legacy runs unchanged and supports new/mixed configurations without IDs", () => {
    expect(importSetupFileBlockers([{}], mappings, {})).toEqual([]);
    for (const intent of ["new", "mixed"]) expect(importSetupFileBlockers([{ Email: "a@example.test" }], { email: "Email" }, { reusableSetup: true, importIntent: intent })).toEqual([]);
    expect(importSetupFileBlockers([{ Email: "a@example.test" }], { email: "Email", phoneNumber: "Email" }, { reusableSetup: true })).toContain("Map each CSV column to only one import field.");
  });
});
