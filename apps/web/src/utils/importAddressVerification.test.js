import { describe, expect, it } from "vitest";
import { importAddressMatches } from "./importAddressVerification";

const write = { addressLine1: "100 Oak Street", addressLine2: "Apt 2", city: "Jacksonville", state: "FL", postalCode: "32211-1234", country: "US" };
const saved = { address_lines: ["100 Oak St", "Apartment 2"], city: "Jacksonville", state: "Florida", postal_code: "322111234", country: "United States" };
describe("import address verification", () => {
  it("normalizes formatting while comparing the complete saved address", () => expect(importAddressMatches(saved, write)).toBe(true));
  it.each([
    { address_lines: ["100 Oak St", "Apt 3"] }, { city: "Tampa" }, { state: "GA" },
    { postal_code: "33602" }, { postal_code: "32211" }, { country: "Canada" }, { city: "" },
  ])("rejects a different or missing field: %j", (change) => expect(importAddressMatches({ ...saved, ...change }, write)).toBe(false));
});
