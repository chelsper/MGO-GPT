import {
  LETTER_NAME_TAGS,
  LETTER_ADDRESS_TAGS,
  letterNameMergeData,
  letterAddressMergeData,
} from "./societyLetters";

const labels = {
  addressee: "addressee",
  salutation: "greeting",
  address: "mailing address",
  first_name: "first name",
  last_name: "last name",
  first_names: "joint first names",
  spouse_first_name: "spouse first name",
  spouse_last_name: "spouse last name",
  address_line_1: "street address",
  city: "city",
  state: "state",
  zip: "ZIP / postal code",
};
const optional = new Set(["address_line_2", "country"]);

// Shared with the actual renderer. Only fields used by the saved template
// require values; optional address lines never turn a saved review into a block.
export function letterMergeBlockers(row, usedFields) {
  const values = {
    addressee: row.addressee,
    salutation: row.salutation,
    address: row.address,
    ...letterNameMergeData(row),
    ...letterAddressMergeData(row),
  };
  return [...new Set(usedFields)]
    .filter(
      (field) =>
        Object.hasOwn(values, field) &&
        !optional.has(field) &&
        !String(values[field] || "").trim(),
    )
    .map((field) => {
      const address =
        field === "address" || LETTER_ADDRESS_TAGS.includes(field);
      return {
        code: "missing_merge_field",
        field,
        action: "recipient",
        focus: field,
        label: address ? "Edit address" : "Edit greeting",
        message: LETTER_NAME_TAGS.includes(field)
          ? `Missing name value for {${field}}. Edit this recipient's name merge fields.`
          : field === "address"
            ? "Add a mailing address in recipient review before creating this letter."
            : field === "address_line_1"
              ? "Separate address fields need a street address. Edit this recipient's address merge fields."
              : `Add ${labels[field] || field} for {${field}} in recipient review.`,
      };
    });
}

export function documentReady(row) {
  return (
    row.status === "ready" &&
    row.recipientReview?.status === "saved" &&
    row.documentReadiness?.status === "ready"
  );
}
