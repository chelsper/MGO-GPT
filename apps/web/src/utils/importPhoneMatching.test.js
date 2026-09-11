import { describe, expect, it } from "vitest";
import { importPhonesMatch } from "./importPhoneMatching";

describe("NXT import phone comparison", () => {
  it.each(["9045551212", "904-555-1212", "(904) 555-1212", "+1 (904) 555-1212", "1.904.555.1212"])("accepts formatting only: %s", (number) => {
    expect(importPhonesMatch(number, "904-555-1212")).toBe(true);
  });
  it("preserves extensions and other country codes", () => {
    expect(importPhonesMatch("9045551212 x123", "+1 (904) 555-1212 ext. 123")).toBe(true);
    expect(importPhonesMatch("9045551212 x123", "9045551212 x124")).toBe(false);
    expect(importPhonesMatch("9045551212 x123", "9045551212")).toBe(false);
    expect(importPhonesMatch("+44 20 7123 4567", "+44 (20) 7123-4567")).toBe(true);
    expect(importPhonesMatch("+44 20 7123 4567", "2071234567")).toBe(false);
  });
  it.each([["", ""], [null, undefined], ["9045551212", "9045551213"], ["555-ABCD", "555-EFGH"]])("does not collapse distinct or empty values", (a, b) => {
    expect(importPhonesMatch(a, b)).toBe(false);
  });
});
