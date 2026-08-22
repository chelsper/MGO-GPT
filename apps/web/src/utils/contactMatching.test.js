import { describe, expect, it } from "vitest";

import { addressesEquivalent } from "./contactMatching";

describe("addressesEquivalent", () => {
  it("matches common street abbreviations, split apartment lines, and ZIP+4 values", () => {
    expect(
      addressesEquivalent(
        {
          addressLine1: "1675 Lakemont Ave Apt 101",
          city: "Orlando",
          state: "FL",
          postalCode: "32814-6349",
        },
        {
          addressLine1: "1675 Lakemont Avenue",
          addressLine2: "Apartment 101",
          city: "Orlando",
          state: "Florida",
          postalCode: "32814",
        },
      ),
    ).toBe(true);
  });

  it("does not match different apartment numbers at the same street address", () => {
    expect(
      addressesEquivalent(
        {
          addressLine1: "1675 Lakemont Ave Apt 101",
          city: "Orlando",
          state: "FL",
          postalCode: "32814",
        },
        {
          addressLine1: "1675 Lakemont Avenue",
          addressLine2: "Apt 102",
          city: "Orlando",
          state: "FL",
          postalCode: "32814",
        },
      ),
    ).toBe(false);
  });

  it("matches a ZIP+4 address when the CSV contains the same five-digit ZIP", () => {
    expect(
      addressesEquivalent(
        {
          addressLine1: "8983 Craven Rd.",
          city: "Jacksonville",
          state: "FL",
          postalCode: "32257-5050",
        },
        {
          addressLine1: "8983 Craven Road",
          city: "Jacksonville",
          state: "FL",
          postalCode: "32257",
        },
      ),
    ).toBe(true);
  });
});
