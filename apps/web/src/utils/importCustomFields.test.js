import { describe, expect, it } from "vitest";
import { customFieldInput, customFieldInputError, customFieldPayload, customFieldWrite, deferredCustomFieldWrite, matchingCustomFields } from "./importCustomFields";
import { quickImportScopes, quickImportApplyBlocker, quickImportInputKey } from "./quickImportWorkflow";

const input = { category: "Prospect Research", value: "The Center", date: "11/13/2026", comment: "Imported after review" };
const category = { name: "Prospect Research", dataType: "Text" };
const record = { id: "1", category: input.category, value: input.value, date: "2026-11-13T00:00:00Z", comment: input.comment };
describe("addition-only custom field plans", () => {
  it("treats wholly blank cells as no operation, but holds a date/comment without a value", () => {
    const mappings = { customFieldValue: "Value", customFieldDate: "Date", customFieldComment: "Comment" };
    expect(customFieldInput({}, mappings, {})).toBeNull();
    expect(customFieldInput({ Value: 0 }, mappings, { customFieldCategory: "Number" }).value).toBe("0");
    expect(customFieldInputError(customFieldInput({ Date: "11/13/2026" }, mappings, { customFieldCategory: category.name }))).toMatch(/value is required/);
  });
  it.each(["Relationship Originator", "relationship-originator", "MGOGPT", "MGO GPT"])("protects %s", (name) => {
    expect(customFieldInputError({ ...input, category: name })).toMatch(/existing workflows/);
  });
  it.each([{ value: "x".repeat(251) }, { comment: "x".repeat(51) }, { value: "a\nb" }, { date: "02/30/2026" }, { date: "2026" }, { category: "" }])("holds invalid input without truncation: %j", (change) => {
    expect(customFieldInputError({ ...input, ...change })).not.toBe("");
  });
  it.each([
    ["Text", "The Center", "text_value", "The Center"], ["Table", "the center", "codetableentry_value", "The Center"],
    ["Boolean", "No", "boolean_value", false], ["Boolean", "Yes", "boolean_value", true],
    ["Date", "11/13/2026", "date_value", "2026-11-13"], ["Number", "0", "number_value", 0], ["Currency", "12.50", "currency_value", 12.5],
  ])("builds a typed %s payload with a separate attribute date", (type, value, property, expected) => {
    expect(customFieldPayload({ ...input, value }, { ...category, dataType: type }, ["The Center"]).payload).toEqual({ category: category.name, [property]: expected, date: "2026-11-13", comment: input.comment });
  });
  it.each([["Table", "New value"], ["Boolean", "Maybe"], ["Number", "1.5"], ["Number", "1e2"], ["Currency", "$1,000"], ["Currency", "1.234"], ["Number", "9007199254740992"], ["Constituent", "123"], ["FuzzyDate", "2026"]])("rejects unsupported %s input %s", (dataType, value) => {
    expect(() => customFieldPayload({ ...input, value }, { ...category, dataType }, ["The Center"])).toThrow();
  });
  it("does not guess between case-colliding table values", () => {
    expect(() => customFieldPayload(input, { ...category, dataType: "Table" }, ["The Center", "THE CENTER"])).toThrow(/unambiguous/);
  });
  it("requires hydration and supports safe quick additions and exact skips", () => {
    expect(deferredCustomFieldWrite({ customField: input })).toMatchObject({ requiresReview: true, deferredHydration: true, action: "load_current" });
    expect(quickImportScopes({ customField: input })).toContain("customFields");
    const write = customFieldWrite(input, category, [], []);
    expect(write).toMatchObject({ action: "add", requiresReview: false });
    const preview = { input: { customField: input }, quickImportWorkflow: { phase: "apply", constituentId: "123", approvedByUserId: "7", inputKey: quickImportInputKey({ customField: input }) } };
    expect(quickImportApplyBlocker({ preview, created_blackbaud_constituent_id: "123", matched_blackbaud_constituent_id: "123", requested_writes: [write] })).toBeNull();
    expect(customFieldWrite(input, category, [], [record])).toMatchObject({ action: "skip_existing", requiresReview: false });
  });
  it.each([{ value: "Other" }, { date: "2026-11-12" }, { comment: "Other" }, { date: null }, { value: null }])("holds any existing difference without overwriting: %j", (change) => {
    expect(customFieldWrite(input, category, [], [{ ...record, ...change }])).toMatchObject({ action: "review_existing", requiresReview: true });
  });
  it("holds duplicate category records, even if both are identical", () => {
    expect(customFieldWrite(input, category, [], [record, { ...record, id: "2" }]).requiresReview).toBe(true);
  });
  it("requires the actual typed value rather than coercing unknown values", () => {
    const { payload, dataType } = customFieldPayload({ ...input, value: "No" }, { ...category, dataType: "Boolean" });
    expect(matchingCustomFields([{ ...record, value: "false" }], payload, dataType)).toHaveLength(0);
    expect(matchingCustomFields([{ ...record, value: false }], payload, dataType)).toHaveLength(1);
  });
});
