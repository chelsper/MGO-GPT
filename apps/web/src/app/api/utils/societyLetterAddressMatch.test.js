import { describe, expect, it } from "vitest";
import { matchesPreferredLetterAddress } from "./societyLetterAddressMatch";

const preferred = {
  address_lines: "10 Test St\nApt 2",
  city: "Jacksonville",
  state: "FL",
  postal_code: "32211-1234",
  country: "UNITED STATES",
};
const saved = "10 Test St\nApt 2\nJacksonville, Florida 32211-1234";

describe("preferred letter address comparison", () => {
  const orgAddress = { ...preferred, constituent_id: "50" };
  const organization = {
    id: "50",
    type: "Organization",
    name: "Example Foundation",
  };
  it("accepts one verified organization-name line and preserves the approved address", () => {
    const text = `Example Foundation\r\n${saved}`;
    const before = structuredClone({ orgAddress, organization });
    expect(matchesPreferredLetterAddress(text, orgAddress, organization)).toBe(
      true,
    );
    expect(matchesPreferredLetterAddress(saved, orgAddress, organization)).toBe(
      true,
    );
    expect(
      matchesPreferredLetterAddress(
        text,
        {
          ...orgAddress,
          address_lines: `Example Foundation\n${orgAddress.address_lines}`,
        },
        organization,
      ),
    ).toBe(true);
    expect({ orgAddress, organization }).toEqual(before);
  });
  it.each([
    [`Other Foundation\n${saved}`, organization],
    [`Contact Name\n${saved}`, organization],
    [`Example Foundation\nExample Foundation\n${saved}`, organization],
    [`Example Foundation\n${saved.replace("Apt 2", "Apt 9")}`, organization],
    [`Example Foundation\n${saved}`, { ...organization, type: "Individual" }],
    [`Example Foundation\n${saved}`, { ...organization, id: "99" }],
    [`Example Foundation\n${saved}`, { ...organization, name: "" }],
    [`Example Foundation\n${saved}`, null],
    ["Example Foundation\n", organization],
  ])(
    "does not strip unverified names or overlook actual address changes",
    (text, owner) => {
      expect(matchesPreferredLetterAddress(text, orgAddress, owner)).toBe(
        false,
      );
    },
  );
  it.each(["", "\nUNITED STATES"])(
    "accepts a full state name with optional country %s without changing either value",
    (country) => {
      const before = structuredClone(preferred);
      expect(matchesPreferredLetterAddress(saved + country, preferred)).toBe(
        true,
      );
      expect(preferred).toEqual(before);
    },
  );
  it.each([
    ["FL", "Florida"],
    ["NY", "New York"],
    ["NC", "North Carolina"],
    ["DC", "District of Columbia"],
    ["CA", "California"],
    ["WY", "Wyoming"],
  ])("matches %s and %s in either direction", (code, name) => {
    for (const [nxt, letter] of [
      [code, name],
      [name, code],
    ]) {
      expect(
        matchesPreferredLetterAddress(
          `10 Test St\nApt 2\nJacksonville, ${letter} 32211-1234`,
          { ...preferred, state: nxt },
        ),
      ).toBe(true);
    }
  });
  it("retains comma, case, and whitespace tolerance", () => {
    expect(
      matchesPreferredLetterAddress(
        " 10 TEST ST\r\nApt 2\nJacksonville,   florida  32211-1234 ",
        preferred,
      ),
    ).toBe(true);
  });
  it.each([
    ["street", "99 Test St\nApt 2\nJacksonville, Florida 32211-1234"],
    ["unit", "10 Test St\nApt 3\nJacksonville, Florida 32211-1234"],
    ["missing unit", "10 Test St\nJacksonville, Florida 32211-1234"],
    ["city", "10 Test St\nApt 2\nOther City, Florida 32211-1234"],
    ["state", "10 Test St\nApt 2\nJacksonville, Georgia 32211-1234"],
    ["ZIP", "10 Test St\nApt 2\nJacksonville, Florida 32212-1234"],
    ["ZIP extension", "10 Test St\nApt 2\nJacksonville, Florida 32211-9999"],
    ["missing ZIP extension", "10 Test St\nApt 2\nJacksonville, Florida 32211"],
    ["country", `${saved}\nCANADA`],
  ])("rejects a different %s", (_label, address) => {
    expect(matchesPreferredLetterAddress(address, preferred)).toBe(false);
  });
  it.each(["Canada", "", undefined])(
    "does not infer US state aliases for country %s",
    (country) => {
      expect(
        matchesPreferredLetterAddress(saved, { ...preferred, country }),
      ).toBe(false);
    },
  );
  it("does not abbreviate words in the street or city", () => {
    const address = {
      ...preferred,
      address_lines: "10 Florida St",
      city: "Florida City",
    };
    expect(
      matchesPreferredLetterAddress(
        "10 FL St\nFlorida City FL 32211-1234",
        address,
      ),
    ).toBe(false);
    expect(
      matchesPreferredLetterAddress(
        "10 Florida St\nFL City FL 32211-1234",
        address,
      ),
    ).toBe(false);
  });
  it("preserves exact matching for foreign addresses and NXT-formatted text", () => {
    const address = {
      address_lines: "10 Test Rd",
      city: "Toronto",
      state: "ON",
      postal_code: "M5V 1A1",
      country: "CANADA",
    };
    expect(
      matchesPreferredLetterAddress(
        "10 Test Rd\nToronto ON M5V 1A1\nCANADA",
        address,
      ),
    ).toBe(true);
    expect(
      matchesPreferredLetterAddress("Verified formatted text", {
        ...address,
        formatted_address: "Verified formatted text",
      }),
    ).toBe(true);
  });
  it("rejects empty values or a missing preferred address", () => {
    expect(matchesPreferredLetterAddress("", preferred)).toBe(false);
    expect(matchesPreferredLetterAddress(" ", {})).toBe(false);
    expect(matchesPreferredLetterAddress(saved, null)).toBe(false);
  });
});
