import { describe, expect, it } from "vitest";
import { IMPORT_CONTACT_GROUPS, importContactMappingKey, importContactPreflight, mappedImportContacts } from "./importContactPreflight";

const mappings = { email: "Email", emailType: "Type", emailMakePrimary: "Primary", email2: "Other Email", email2Type: "Other Type", email2MakePrimary: "Other Primary", phoneNumber: "Phone", phoneMakePrimary: "Phone Primary" };
const row = { Email: "avery@example.test", Type: "Personal", Primary: "Yes", Phone: "9045551212", "Phone Primary": "true" };

describe("contact import preflight", () => {
  it("requires an explicit choice for both mapped kinds, without defaulting to writes", () => {
    const plan = importContactPreflight([row], mappings);
    expect(plan.blockers).toHaveLength(2);
    expect(plan.groups.map(({ mode, count, primaryCount }) => ({ mode, count, primaryCount }))).toEqual([
      { mode: "choose", count: 1, primaryCount: 1 }, { mode: "choose", count: 1, primaryCount: 1 },
    ]);
  });
  it.each(["new", "mixed", "updates"])("does not omit contacts silently in %s mode", (importIntent) => {
    expect(importContactPreflight([row], mappings, { importIntent }).blockers).toHaveLength(2);
  });
  it("accepts matching-only choices bound to their exact mappings", () => {
    const contactMatchingOnly = Object.fromEntries(IMPORT_CONTACT_GROUPS.map((g) => [g.key, importContactMappingKey(mappings, g)]));
    expect(importContactPreflight([row], mappings, { contactMatchingOnly }).blockers).toEqual([]);
    expect(importContactPreflight([row], { ...mappings, email2: "Added email" }, { contactMatchingOnly }).blockers).toHaveLength(1);
    expect(importContactPreflight([row], mappings, { contactMatchingOnly: { email: true, phone: true } }).blockers).toHaveLength(2);
  });
  it("ignores unmapped fields and blank cells rather than creating empty contacts", () => {
    expect(importContactPreflight([row], {}).groups).toEqual([]);
    expect(importContactPreflight([{ Email: "  ", Phone: null }], mappings).blockers).toEqual([]);
  });
  it("retains secondary contacts, explicit flags and file types, applying defaults only to blank types", () => {
    const values = mappedImportContacts({ ...row, "Other Email": "other@example.test", "Other Primary": "No" }, mappings, { defaultEmailType: "Business" }, IMPORT_CONTACT_GROUPS[0]);
    expect(values).toEqual([{ address: row.Email, type: "Personal", makePrimary: true }, { address: "other@example.test", type: "Business", makePrimary: false }]);
    const plan = importContactPreflight([{ ...row, "Other Email": "other@example.test", "Other Primary": "No" }], mappings, { updateEmailFields: true, updatePhoneFields: true, defaultEmailType: "Business", defaultPhoneType: "Mobile" });
    expect(plan.blockers).toEqual([]);
    expect(plan.groups[0]).toMatchObject({ count: 2, rowCount: 1, blankTypeCount: 1, issues: [] });
    expect(plan.groups[1].issues).toEqual([]);
  });
  it("keeps blank flags unspecified and reports missing types without preventing preparation", () => {
    const plan = importContactPreflight([{ Phone: row.Phone }], mappings, { updatePhoneFields: true });
    expect(plan.blockers).toEqual([]);
    expect(plan.groups[0].issues).toEqual([{ rowNumber: 1, message: expect.stringContaining("type") }]);
    expect(mappedImportContacts({ Phone: row.Phone }, mappings, {}, IMPORT_CONTACT_GROUPS[1])[0].makePrimary).toBeNull();
  });
  it("rejects malformed and conflicting primary flags before they can become false or pick the first", () => {
    const bad = importContactPreflight([{ Email: row.Email, Primary: "maybe" }], mappings, { updateEmailFields: true }, 4);
    expect(bad.blockers[0]).toContain("Row 5: use Yes or No");
    const conflict = importContactPreflight([{ ...row, Phone: "", "Other Email": "other@example.test", "Other Primary": "Yes" }], mappings, { updateEmailFields: true });
    expect(conflict.blockers[0]).toContain("only one email");
  });
  it.each([true, "x".repeat(101), "Mobile\nOther"])("rejects invalid default types: %j", (defaultPhoneType) => {
    expect(importContactPreflight([{ Phone: row.Phone }], mappings, { updatePhoneFields: true, defaultPhoneType }).blockers).toHaveLength(1);
  });
});
