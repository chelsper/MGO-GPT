import { describe, expect, it } from "vitest";
import { triageRow } from "../../test/societyLetterTriageFixture";
import { formatLetterAddress } from "./societyLetters";
import {
  letterReviewExceptions,
  sharedLetterAddresses,
  sharedAddressPeers,
  straightforwardRecipient,
} from "./societyLetterReviewTriage";

const keys = (row, channel = "post", groups = [], fields = []) =>
  letterReviewExceptions(row, channel, groups, fields).map((item) => item.key);
function pair() {
  const a = triageRow("10"),
    b = triageRow("20");
  b.recipientCandidates[0] = {
    ...a.recipientCandidates[0],
    constituentId: "20",
  };
  return [a, b];
}
function organization() {
  const row = triageRow();
  row.recipientCandidates[0].organizationContacts = {
    keyIndicator: "organization",
    contacts: [],
  };
  return row;
}
describe("exception-focused recipient review", () => {
  it("does not mistake the unreviewed state for a data exception or approve it", () => {
    const row = triageRow(),
      before = structuredClone(row);
    expect(keys(row)).toEqual([]);
    expect(straightforwardRecipient(row)).toMatchObject({
      addressee: "Al Example",
      salutation: "Al",
      email: "",
      addressParts: { zip: "00123" },
    });
    expect(row).toEqual(before);
  });
  it("falls back to first names and includes both last names in a joint suggestion", () => {
    const row = triageRow();
    row.members.push("11");
    row.memberNames.push({
      constituentId: "11",
      firstName: "Pat",
      lastName: "Other",
    });
    row.recipientCandidates.push({
      ...row.recipientCandidates[0],
      constituentId: "11",
      addressee: "Pat Other",
    });
    expect(keys(row)).toEqual([]);
    expect(straightforwardRecipient(row)).toMatchObject({
      addressee: "Al Example & Pat Other",
      salutation: "Al & Pat",
    });
    row.memberNames[1].lastName = "Example";
    expect(straightforwardRecipient(row).addressee).toBe("Al & Pat Example");
    row.memberNames.pop();
    expect(keys(row)).toContain("name_details");
    expect(straightforwardRecipient(row)).toBeNull();
  });
  it("requires organization contacts and flags multiple or partial names", () => {
    const row = organization();
    expect(keys(row)).toContain("organization_contact");
    row.recipientCandidates[0].organizationContacts.contacts = [
      {
        role: "Main contact",
        firstName: "Sam",
        preferredName: "Sammie",
        lastName: "Example",
      },
    ];
    expect(keys(row)).toEqual([]);
    expect(straightforwardRecipient(row)).toMatchObject({
      salutation: "Sammie",
      addressee: "Mr. Alex Example\nSam Example",
      includeOrganizationName: true,
    });
    row.recipientCandidates[0].organizationContacts.contacts.push({
      role: "Society letter contact",
      firstName: "Lee",
    });
    expect(keys(row)).toEqual(
      expect.arrayContaining(["contact_choices", "name_details"]),
    );
    expect(straightforwardRecipient(row)).toBeNull();
  });
  it("respects explicit individual record type and reviewed organization-only wording", () => {
    const row = organization();
    row.recipientCandidates[0].organizationContacts.keyIndicator = "individual";
    row.recipientCandidates[0].organizationContacts.constituencyCodes = [
      "Business",
    ];
    expect(keys(row)).toEqual([]);
    row.recipientCandidates[0].organizationContacts.keyIndicator =
      "organization";
    row.recipientReview = {
      status: "saved",
      values: { ...row.recipientCandidates[0] },
    };
    row.documentReadiness = { status: "ready", blockers: [] };
    expect(keys(row)).toEqual([]);
    expect(straightforwardRecipient(row)).toBeNull();
  });
  it("requires separate address fields but not line 2 and never parses a manual block", () => {
    const row = triageRow();
    expect(keys(row)).toEqual([]);
    row.recipientCandidates[0].addressParts = null;
    expect(keys(row)).toContain("address_parts");
    row.recipientReview = {
      status: "saved",
      values: {
        ...row.recipientCandidates[0],
        address: "Custom address",
        addressParts: null,
      },
    };
    expect(keys(row)).toContain("address_parts");
  });
  it("flags conflicting household addresses until a reviewed choice is saved", () => {
    const row = triageRow();
    row.members.push("20");
    row.memberNames.push(...triageRow("20").memberNames);
    row.recipientCandidates.push(triageRow("20").recipientCandidates[0]);
    expect(keys(row)).toContain("address_choices");
    expect(straightforwardRecipient(row)).toBeNull();
    row.recipientReview = {
      status: "saved",
      values: { ...row.recipientCandidates[0] },
    };
    row.documentReadiness = { status: "ready", blockers: [] };
    expect(keys(row)).toEqual([]);
  });
  it("finds another household across societies, retaining IDs and not grouping spouses twice", () => {
    const rows = pair();
    rows[1].societyName = "Order of the Dolphin";
    rows[0].recipientCandidates.push({
      ...rows[0].recipientCandidates[0],
      constituentId: "11",
    });
    const shared = sharedLetterAddresses(rows);
    expect(keys(rows[0], "post", shared.get("10"))).toContain("shared_address");
    expect(straightforwardRecipient(rows[0], shared.get("10"))).toBeNull();
    expect(sharedAddressPeers(shared.get("10"), "10")).toEqual([
      {
        householdId: "20",
        name: rows[1].name,
        societyName: "Order of the Dolphin",
      },
    ]);
    expect(sharedLetterAddresses([rows[0]]).get("10")).toEqual([]);
  });
  it.each(["unit", "city", "zip", "country", "period", "excluded", "covered"])(
    "does not conflate a different %s",
    (difference) => {
      const rows = pair(),
        candidate = rows[1].recipientCandidates[0];
      candidate.addressParts = { ...candidate.addressParts };
      if (difference === "unit")
        candidate.addressParts.address_line_2 = "Unit 2";
      else if (["city", "zip", "country"].includes(difference))
        candidate.addressParts[difference] = "Different";
      else if (difference === "period") rows[1].period = { key: "2027" };
      else rows[1].status = difference;
      candidate.address = formatLetterAddress(candidate.addressParts);
      expect(sharedLetterAddresses(rows).get("10")).toEqual([]);
    },
  );
  it("matches casing and punctuation but does not collapse apartment numbers", () => {
    const rows = pair();
    rows[1].recipientCandidates[0].address =
      rows[1].recipientCandidates[0].address.toUpperCase().replace(",", "");
    expect(sharedLetterAddresses(rows).get("10")).not.toEqual([]);
    rows[1].recipientReview = {
      status: "saved",
      values: {
        ...rows[1].recipientCandidates[0],
        address: "20 Another Street\nExample City FL 00123",
        addressParts: null,
      },
    };
    expect(sharedLetterAddresses(rows).get("10")).toEqual([]);
  });
  it.each(["saved", "needs_review"])(
    "never replaces %s choices in bulk",
    (status) => {
      const row = triageRow();
      row.recipientReview.status = status;
      expect(straightforwardRecipient(row)).toBeNull();
      if (status === "needs_review")
        expect(keys(row)).toContain("review_changed");
    },
  );
  it("checks actual suggested values against template fields, and keeps errors visible", () => {
    const row = triageRow();
    expect(keys(row, "post", [], ["address_line_1", "first_name"])).toEqual([]);
    expect(keys(row, "post", [], ["spouse_first_name"])).toContain(
      "document_fields",
    );
    expect(straightforwardRecipient(row, [], ["spouse_first_name"])).toBeNull();
    row.documentReadiness.blockers = [
      { code: "template_missing", action: "templates" },
    ];
    expect(straightforwardRecipient(row)).toBeNull();
  });
  it("separates email triage from postal address triage", () => {
    const row = triageRow();
    row.recipientCandidates[0].addressParts = null;
    expect(keys(row, "email")).toContain("email_choices");
    expect(keys(row, "email")).not.toContain("address_parts");
    row.recipientCandidates[0].emailCandidates = [
      "one@example.org",
      "two@example.org",
    ];
    expect(keys(row, "email")).toContain("email_choices");
  });
});
