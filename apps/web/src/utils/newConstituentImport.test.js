import { describe, it, expect } from "vitest";
import { duplicateReason, mostlySameAddress, newRecordContactPayload, quickImportCandidates } from "./newConstituentImport";

describe("safe new constituent matching", () => {
  it.each([
    [{ lookupId: "ABC" }, { lookupId: "abc" }, "ID"],
    [{ blackbaudConstituentId: "123" }, { blackbaudConstituentId: "123" }, "ID"],
    [{ email: "Person@Example.com " }, { email2: "person@example.com" }, "email"],
    [{ firstName: "Jane", lastName: "O'Neil" }, { firstName: "JANE", lastName: "ONeil" }, "first and last"],
    [{ addressLine1: "42 North Main Street", postalCode: "32211-1234" }, { addressLine1: "42 N Main St Apt 2", postalCode: "32211" }, "address"],
  ])("holds an independent matching key", (left, right, reason) => {
    expect(duplicateReason(left, right)).toContain(reason);
  });
  it("does not collapse different email punctuation, house numbers or ZIPs", () => {
    expect(duplicateReason({ email: "ab@example.com" }, { email: "a.b@example.com" })).toBeNull();
    expect(mostlySameAddress({ addressLine1: "42 Main Street", postalCode: "32211" }, { addressLine1: "43 Main St", postalCode: "32211" })).toBe(false);
    expect(mostlySameAddress({ addressLine1: "42 Main Street", postalCode: "32211" }, { addressLine1: "42 Main St", postalCode: "32212" })).toBe(false);
  });
  it("resumes only unchecked new candidates", () => {
    const base = { intentDisposition: { key: "ready_new" }, status: "Ready" };
    const rows = [{ ...base, id: 1 }, { ...base, id: 2, createdBlackbaudConstituentId: "42" }, { ...base, id: 3, quickCreateStatus: "review" }, { ...base, id: 4, createRequestStartedAt: "now" }, { ...base, id: 5, status: "Skipped" }];
    expect(quickImportCandidates(rows).map((row) => row.id)).toEqual([1]);
  });
  it("creates selected contacts using the NXT payload shape", () => {
    expect(newRecordContactPayload({ emailUpdates: [{ address: "new@example.com", type: "Email" }], addressUpdates: [{ addressLine1: "42 Main St", addressLine2: "Apt 2", type: "Home", postalCode: "32211" }] })).toEqual({
      email: { address: "new@example.com", type: "Email", primary: true },
      address: { type: "Home", address_lines: "42 Main St\nApt 2", postal_code: "32211" },
    });
  });
  it("never silently drops multiple contacts or invents a contact type", () => {
    expect(() => newRecordContactPayload({ emailUpdates: [{ address: "a@b.com" }] })).toThrow(/type/);
    expect(() => newRecordContactPayload({ emailUpdates: [{ address: "a@b.com" }, { address: "b@b.com" }] })).toThrow(/Multiple/);
  });
});
