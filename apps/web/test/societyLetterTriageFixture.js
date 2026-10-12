import { formatLetterAddress } from "../src/utils/societyLetters";

export function triageRow(id = "10") {
  const addressParts = {
    address_line_1: `${id} Test Street`,
    address_line_2: "",
    city: "Example City",
    state: "FL",
    zip: "00123",
    country: "",
  };
  return {
    householdId: id,
    name: `Alex Example ${id}`,
    members: [id],
    memberNames: [
      {
        constituentId: id,
        firstName: "Alex",
        preferredName: "Al",
        lastName: "Example",
      },
    ],
    status: "ready",
    sourceMode: "society_queries",
    societyKey: "presidents_society",
    societyName: "President's Society",
    rank: 0,
    qualifiedKeys: ["presidents_society"],
    coveredKeys: ["presidents_society", "order_of_the_dolphin"],
    period: {
      key: "2026-01-01/2026-12-31",
      start: "2026-01-01",
      end: "2026-12-31",
    },
    addressee: "",
    salutation: "",
    address: "",
    email: "",
    recipientCandidates: [
      {
        constituentId: id,
        addressee: "Mr. Alex Example",
        salutation: "Alex",
        address: formatLetterAddress(addressParts),
        addressParts,
        email: "",
      },
    ],
    recipientReview: {
      status: "unreviewed",
      editable: true,
      token: `token-${id}`,
      values: null,
    },
    documentReadiness: {
      status: "blocked",
      blockers: [
        { code: "recipient_review_required" },
        { code: "missing_merge_field", field: "addressee" },
        { code: "missing_merge_field", field: "address" },
      ],
    },
  };
}
