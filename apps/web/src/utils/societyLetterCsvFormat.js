import { dateOnly, letterError, letterNameMergeData } from "./societyLetters";
import {
  contactChoiceKey,
  isOrganizationLetterCandidate,
  organizationLetterContacts,
} from "./societyLetterContacts";

export const CSV_NAME_FORMATS = [
  ["reviewed", "Use reviewed wording"],
  ["record", "Use original record wording"],
  ["household_preferred", "Household preferred names"],
  ["individual_preferred", "Individual preferred name"],
  ["household_first", "Household first names"],
  ["individual_first", "Individual first name"],
];
export const DEFAULT_CSV_FORMAT = Object.freeze({
  salutation: "household_preferred",
  addressee: "reviewed",
  dateFormat: "long_us",
  joiner: " & ",
  sharedLastName: "combine",
  organization: "reviewed",
  greetingField: "First_Name",
});
const text = (value) => String(value ?? "").trim();
const sameLine = (a, b) =>
  text(a).replace(/\s+/g, " ").toLowerCase() ===
  text(b).replace(/\s+/g, " ").toLowerCase();

export function normalizeCsvFormat(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw letterError("Choose valid CSV formatting options.");
  const options = { ...DEFAULT_CSV_FORMAT, ...raw };
  if (
    Object.keys(raw).some((key) => !Object.hasOwn(DEFAULT_CSV_FORMAT, key)) ||
    ![options.salutation, options.addressee].every((value) =>
      CSV_NAME_FORMATS.some(([key]) => key === value),
    ) ||
    !["long_us", "short_us", "iso"].includes(options.dateFormat) ||
    ![" & ", " and "].includes(options.joiner) ||
    !["combine", "repeat"].includes(options.sharedLastName) ||
    !["reviewed", "address", "omit"].includes(options.organization) ||
    !["First_Name", "salutation", "saved"].includes(options.greetingField)
  )
    throw letterError("Choose supported CSV formatting options.");
  return options;
}

export function formatCsvLetterDate(date, format) {
  if (!dateOnly(date) || dateOnly(date) !== date)
    throw letterError("Choose a valid letter date.");
  if (format === "iso") return date;
  if (format === "short_us") {
    const [year, month, day] = date.split("-");
    return `${Number(month)}/${Number(day)}/${year}`;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

// CSV formatting changes output only, never recipient selection, membership or
// the physical street address that the NXT appeal worker will verify later.
export function csvRecipientWording(row, raw) {
  const options = normalizeCsvFormat(raw);
  const candidate = row.recipientCandidates?.find(
    (person) => person.constituentId === row.recipientConstituentId,
  );
  const organization = isOrganizationLetterCandidate(candidate);
  const contact = organizationLetterContacts(candidate).find(
    (person) => contactChoiceKey(person) === row.organizationContactKey,
  );
  const names = letterNameMergeData(row);
  const members = row.members || [];
  const recipientId =
    row.recipientConstituentId || (members.length === 1 ? members[0] : "");
  const people = members.map((id) => {
    const primary = id === recipientId;
    const source =
      row.memberNames?.find((person) => person.constituentId === id) ||
      (primary
        ? row
        : { firstName: row.spouseFirstName, lastName: row.spouseLastName });
    return {
      id,
      preferred: text(primary ? names.first_name : names.spouse_first_name),
      first: text(source.firstName),
      last: text(primary ? names.last_name : names.spouse_last_name),
    };
  });
  function wording(mode, kind) {
    if (mode === "reviewed") return text(row[kind]);
    if (mode === "record") {
      if (!text(candidate?.[kind]))
        throw letterError(
          `The selected record has no ${kind}. Choose reviewed wording or review this recipient.`,
        );
      return text(candidate[kind]);
    }
    if (organization && !contact) {
      if (organizationLetterContacts(candidate).length)
        throw letterError(
          "Choose this organization's contact in recipient review before using contact names in the CSV.",
        );
      return text(row[kind]);
    }
    if (
      kind === "salutation" &&
      !organization &&
      mode === "household_preferred" &&
      Object.hasOwn(row.nameOverrides || {}, "first_names")
    ) {
      if (!text(row.nameOverrides.first_names))
        throw letterError("The reviewed household name override is blank.");
      return text(row.nameOverrides.first_names);
    }
    const preferred = mode.endsWith("preferred");
    const chosen = organization
      ? [
          {
            preferred: names.first_name,
            first: contact.firstName,
            last: names.last_name,
          },
        ]
      : mode.startsWith("individual")
        ? people.filter((person) => person.id === recipientId)
        : people;
    if (
      !chosen.length ||
      chosen.some(
        (person) =>
          !text(preferred ? person.preferred : person.first) ||
          (kind === "addressee" && !text(person.last)),
      )
    )
      throw letterError(
        `Missing name fields for the selected CSV ${kind} format. Review this recipient's names or choose reviewed wording; no household member was dropped.`,
      );
    const first = chosen.map((person) =>
      text(preferred ? person.preferred : person.first),
    );
    if (kind === "salutation") {
      return first.join(options.joiner);
    }
    if (
      options.sharedLastName === "combine" &&
      chosen.every((person) => sameLine(person.last, chosen[0].last))
    )
      return `${first.join(options.joiner)} ${text(chosen[0].last)}`;
    return chosen
      .map((person, index) => `${first[index]} ${text(person.last)}`)
      .join(options.joiner);
  }
  let addressee = wording(options.addressee, "addressee");
  const salutation = wording(options.salutation, "salutation");
  let address = text(row.address);
  const organizationName = organization
    ? text(candidate.addressee || row.name)
    : "";
  if (organization && options.organization !== "reviewed" && !organizationName)
    throw letterError(
      "The organization name is missing. Review its source record before changing the organization line.",
    );
  if (organizationName) {
    const contains = (value) =>
      value.split(/\r?\n/).some((line) => sameLine(line, organizationName));
    const remove = (value) =>
      value
        .split(/\r?\n/)
        .filter((line) => !sameLine(line, organizationName))
        .join("\n");
    if (options.organization !== "reviewed") {
      // Only whole matching lines can be moved; never strip words from a name.
      addressee = remove(addressee);
      address = remove(address);
      if (options.organization === "address")
        address = [organizationName, address].filter(Boolean).join("\n");
      if (!addressee)
        throw letterError(
          "Choose a contact addressee before moving or omitting the organization name.",
        );
    } else if (
      row.includeOrganizationName &&
      !contains(addressee) &&
      !contains(address)
    ) {
      addressee = `${organizationName}\n${addressee}`;
    }
  }
  return { addressee, salutation, address };
}
