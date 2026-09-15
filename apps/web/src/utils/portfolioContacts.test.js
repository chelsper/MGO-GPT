import { describe, expect, it } from "vitest";
import { mergeSavedPortfolioContacts } from "./portfolioContacts";

const savedPerson = {
  constituentId: "100",
  name: "Saved Donor",
  email: "saved@example.com",
  phone: "904-555-0100",
  address: "100 Saved Street",
  contactCheckedAt: "2026-09-14T12:00:00.000Z",
  contactDataSource: "nxt-summary-cache",
};
const updatedContacts = { email: "new@example.com", phone: "904-555-0199", address: "200 Updated Street" };

describe("saved portfolio contacts", () => {
  it("applies a newer complete snapshot without altering identity or other card fields", () => {
    expect(mergeSavedPortfolioContacts(savedPerson, { ...updatedContacts, name: "Other name" }, {
      source: "nxt-portfolio-snapshot", checkedAt: "2026-09-15T12:00:00Z",
    })).toEqual({
      ...savedPerson, ...updatedContacts,
      contactDataSource: "nxt-portfolio-snapshot", contactCheckedAt: "2026-09-15T12:00:00.000Z",
    });
  });

  it.each([undefined, null, {}, [], { email: "new@example.com" },
    { ...updatedContacts, phone: {} }, { ...updatedContacts, email: false }])(
    "retains saved contacts for an incomplete or malformed result: %j", (constituent) => {
      expect(mergeSavedPortfolioContacts(savedPerson, constituent, {
        checkedAt: "2026-09-15T12:00:00Z",
      })).toBe(savedPerson);
    },
  );

  it.each([null, "invalid", "2026-09-13T12:00:00Z"])(
    "does not replace dated contacts with an older or undated snapshot: %s", (checkedAt) => {
      expect(mergeSavedPortfolioContacts(savedPerson, updatedContacts, { checkedAt })).toBe(savedPerson);
    },
  );

  it("respects explicitly empty fields without restoring deleted contacts", () => {
    expect(mergeSavedPortfolioContacts(savedPerson, { email: null, phone: null, address: null }, {
      checkedAt: "2026-09-15T12:00:00Z",
    })).toMatchObject({ email: null, phone: null, address: null, contactDataSource: "nxt-summary-cache" });
  });

  it("accepts undated legacy contacts when no dated contact exists", () => {
    expect(mergeSavedPortfolioContacts({ name: "Donor", contactDataSource: "not-loaded" }, updatedContacts))
      .toMatchObject({ ...updatedContacts, name: "Donor", contactDataSource: "nxt-summary-cache", contactCheckedAt: null });
  });
});
