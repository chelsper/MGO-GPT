import { expect, it } from "vitest";
import { getUploadedHeaderForField } from "./importFieldDefinitions";

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
