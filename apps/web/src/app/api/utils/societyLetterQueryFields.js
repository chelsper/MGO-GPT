import { getBlackbaudSavedQueryById } from "./blackbaud";
import {
  CONSTITUENT_LETTER_COLUMNS,
  letterError,
} from "@/utils/societyLetters";

const preferredAddressLabels = {
  keyIndicator: ["Key Indicator"],
  constituencyCode: ["Constituency Code"],
  contactType: ["Contact Type"],
  contactFirstName: ["Contact First Name"],
  contactLastName: ["Contact Last Name"],
  contactPreferredName: ["Contact Preferred Name"],
  mainContactFirstName: ["Main Contact First Name"],
  mainContactLastName: ["Main Contact Last Name"],
  mainContactPreferredName: ["Main Contact Preferred Name"],
  societyContactFirstName: [
    "Society Letter Contact First Name",
    "Society Letter First Name",
  ],
  societyContactLastName: [
    "Society Letter Contact Last Name",
    "Society Letter Last Name",
  ],
  societyContactPreferredName: [
    "Society Letter Contact Preferred Name",
    "Society Letter Preferred Name",
  ],
  address1: ["Preferred Street Line 1", "Preferred Address Line 1"],
  address2: ["Preferred Street Line 2", "Preferred Address Line 2"],
  city: ["Preferred City"],
  state: ["Preferred State", "Preferred State / Province"],
  postalCode: ["Preferred ZIP", "Preferred ZIP Code", "Preferred Postal Code"],
  country: ["Preferred Country"],
};
const normalizedLabel = (value) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
const personNameFields = {
  firstName: { root: "296", meaning: "First Name" },
  preferredName: { root: "296", meaning: "Preferred Name" },
  lastName: { root: "296", meaning: "Last Name" },
  spouseFirstName: { root: "10516", meaning: "First Name" },
  spousePreferredName: { root: "10516", meaning: "Preferred Name" },
  spouseLastName: { root: "10516", meaning: "Last Name" },
};

export async function inspectLetterQueryFields(body, context) {
  const queryId = String(body.queryId || "").trim();
  if (!/^[1-9]\d{0,18}$/.test(queryId))
    throw letterError("Enter a saved NXT query ID first.");
  const query = await getBlackbaudSavedQueryById({
    queryId,
    userId: context.user.id,
    origin: context.origin,
  });
  const fields = (query?.select_fields || [])
    .map(({ query_field: field }) => ({
      name: field?.selected_field_name,
      meaning: field?.available_field_name,
      root: String(field?.node_path?.[0]?.id || ""),
    }))
    .filter(
      (field) =>
        typeof field.name === "string" &&
        field.name.length <= 150 &&
        field.name.trim(),
    );
  if (!fields.length || fields.length > 100)
    throw letterError(
      "No usable output fields were returned. Check this saved query in NXT.",
    );
  const unique = fields.filter(
    (field) => fields.filter((other) => other.name === field.name).length === 1,
  );
  const suggestedColumns = {};
  for (const [key, label] of Object.entries(CONSTITUENT_LETTER_COLUMNS)) {
    const root =
      key === "constituentId" ? "296" : key === "spouseId" ? "10516" : null;
    const labels = (preferredAddressLabels[key] || [label])
      .filter(Boolean)
      .map(normalizedLabel);
    const personName = personNameFields[key];
    const matches = unique.filter((field) =>
      personName
        ? field.root === personName.root &&
          normalizedLabel(String(field.meaning || "")) ===
            normalizedLabel(personName.meaning)
        : root
          ? field.meaning === "System Record ID" && field.root === root
          : labels.includes(normalizedLabel(field.name)),
    );
    if (matches.length === 1) suggestedColumns[key] = matches[0].name;
  }
  return {
    queryId,
    fields: unique.map((field) => field.name),
    suggestedColumns,
  };
}
