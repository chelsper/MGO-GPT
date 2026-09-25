// Contact names personalize an organization's letter; they never become members
// of its qualifying household or targets for an NXT appeal assignment.
export const ORGANIZATION_CONTACT_COLUMNS = {
  constituencyCode: "",
  contactType: "",
  contactFirstName: "",
  contactLastName: "",
  mainContactFirstName: "",
  mainContactLastName: "",
  societyContactFirstName: "",
  societyContactLastName: "",
};
export const ORGANIZATION_CONTACT_LABELS = {
  constituencyCode: "Constituency code (optional)",
  contactType: "Contact type (optional)",
  contactFirstName: "Contact first name (optional)",
  contactLastName: "Contact last name (optional)",
  mainContactFirstName: "Main contact first name (optional)",
  mainContactLastName: "Main contact last name (optional)",
  societyContactFirstName: "Society letter contact first name (optional)",
  societyContactLastName: "Society letter contact last name (optional)",
};
export const ORGANIZATION_CONTACT_LIMIT = 20;
const text = (value) => String(value ?? "").trim();
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 422 });
};
export const contactChoiceKey = (contact) =>
  JSON.stringify([contact.role, contact.firstName, contact.lastName]);
export const contactDisplayName = (contact) =>
  [contact.firstName, contact.lastName].filter(Boolean).join(" ");
export const isOrganizationLetterCandidate = (candidate) =>
  (candidate?.organizationContacts?.constituencyCodes || []).some((code) =>
    /^(business|foundation)$/i.test(code),
  );
export function organizationLetterContacts(candidate) {
  return isOrganizationLetterCandidate(candidate)
    ? candidate.organizationContacts.contacts || []
    : [];
}

export function validateOrganizationContactColumns(columns) {
  const generic = columns.contactFirstName || columns.contactLastName;
  const dedicated =
    columns.mainContactFirstName ||
    columns.mainContactLastName ||
    columns.societyContactFirstName ||
    columns.societyContactLastName;
  if (
    (generic || dedicated || columns.contactType) &&
    !columns.constituencyCode
  )
    fail("Map Constituency code before using organization contact names.");
  if ((generic && !columns.contactType) || (columns.contactType && !generic))
    fail(
      "Map Contact type and its contact name fields together, or use the separate Main contact / Society letter contact fields.",
    );
}

export function organizationContactsFromRow(row) {
  const role = text(row.contactType).replace(/\s+/g, " ").toLowerCase();
  const genericRole =
    role === "main contact"
      ? "Main contact"
      : /^(society letter|society letter contact|society letters|society letters contact)$/.test(
            role,
          )
        ? "Society letter contact"
        : "";
  const contacts = [
    [genericRole, row.contactFirstName, row.contactLastName],
    ["Main contact", row.mainContactFirstName, row.mainContactLastName],
    [
      "Society letter contact",
      row.societyContactFirstName,
      row.societyContactLastName,
    ],
  ]
    .filter(([type, first, last]) => type && (text(first) || text(last)))
    .map(([type, first, last]) => ({
      role: type,
      firstName: text(first),
      lastName: text(last),
    }));
  for (const contact of contacts) {
    if (
      [contact.firstName, contact.lastName].some(
        (value) => value.length > 150 || /[\u0000-\u001f\u007f]/.test(value),
      )
    )
      fail("An organization contact name is invalid. Review the query output.");
  }
  // Do not split names or combine independent first/last-name sets.
  return {
    constituencyCodes: text(row.constituencyCode)
      ? [text(row.constituencyCode)]
      : [],
    contacts,
  };
}

export function mergeOrganizationContacts(...groups) {
  const constituencyCodes = [
    ...new Set(groups.flatMap((group) => group?.constituencyCodes || [])),
  ].sort();
  const contacts = [
    ...new Map(
      groups
        .flatMap((group) => group?.contacts || [])
        .map((contact) => [contactChoiceKey(contact), contact]),
    ).values(),
  ].sort((a, b) => contactChoiceKey(a).localeCompare(contactChoiceKey(b)));
  if (
    contacts.length > ORGANIZATION_CONTACT_LIMIT ||
    constituencyCodes.length > 100
  )
    fail(
      "An organization has too many contact or constituency choices. Narrow the query output; no partial membership was saved.",
    );
  return { constituencyCodes, contacts };
}
