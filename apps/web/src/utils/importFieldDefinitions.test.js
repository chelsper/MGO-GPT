import { expect, it } from "vitest";
import { getUploadedHeaderForField } from "./importFieldDefinitions";
import { extendedNamePayload, extendedNameValidation, extendedNamesMatch } from "./importExtendedNames";
import { normalizeImportSetup } from "./importSetups";

it.each([["middleName", "Middle Name"], ["middleName", "middle_name"], ["middleName", "Middle Initial"], ["maidenName", "Maiden Name"], ["maidenName", "Former Name"], ["maidenName", "Maiden/Former Name"]])("maps extended name %s from %s", (key, header) => {
  expect(getUploadedHeaderForField(key, [header])).toBe(header);
});
it("uses only the documented NXT name fields and preserves blanks", () => {
  expect(extendedNamePayload({ middleName: " Alex ", maidenName: " Harbor ", firstName: "Avery" })).toEqual({ middle: "Alex", former_name: "Harbor" });
  expect(extendedNamePayload({ middleName: " ", maidenName: "" })).toEqual({});
  expect(extendedNameValidation({ middleName: "a".repeat(50), maidenName: "b".repeat(100) })).toBe("");
  expect(extendedNameValidation({ middleName: "a".repeat(51) })).toMatch(/50 characters/);
  expect(extendedNameValidation({ maidenName: "b".repeat(101) })).toMatch(/100 characters/);
  expect(extendedNamesMatch({ middleName: "Alex", maidenName: "Harbor" }, { middle: "alex", former_name: "Harbor" })).toBe(true);
  expect(extendedNamesMatch({ maidenName: "Harbor" }, { last: "Harbor" })).toBe(false);
});
it("retains the new field mappings in reusable setups without storing values", () => {
  const setup = normalizeImportSetup({ name: "Names", mappings: { lookupId: "ID", middleName: "Middle", maidenName: "Former" }, defaults: { updateNameFields: true, importIntent: "updates" } });
  expect(setup.mappings).toEqual({ lookupId: "ID", middleName: "Middle", maidenName: "Former" });
});

it.each([["email", "Email"], ["email", "E-mail"], ["phoneNumber", "Telephone"], ["phoneNumber", "Phone"], ["postalCode", "ZIP Code"], ["firstName", "Given Name"], ["lastName", "Surname"]])("recognizes %s from %s", (field, header) => {
  expect(getUploadedHeaderForField(field, [header])).toBe(header);
});
it("prefers the canonical field and never treats a generic constituent ID as an NXT ID", () => {
  expect(getUploadedHeaderForField("email", ["Email", "Email Address"])).toBe("Email Address");
  expect(getUploadedHeaderForField("externalConstituentId", ["Constituent ID"])).toBe("Constituent ID");
  expect(getUploadedHeaderForField("blackbaudConstituentId", ["Constituent ID", "ID"])).toBe("");
  expect(getUploadedHeaderForField("lookupId", ["Constituent ID", "ID"])).toBe("");
});
it("does not guess between duplicate normalized headers", () => {
  expect(getUploadedHeaderForField("email", ["Email", "E-mail"])).toBe("");
  expect(getUploadedHeaderForField("blackbaudConstituentId", ["NXT System ID", "NXT-System-ID"])).toBe("");
});
