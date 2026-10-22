import {
  isOrganizationLetterCandidate,
  organizationLetterContacts,
  contactChoiceKey,
  organizationContactAddressee,
} from "@/utils/societyLetterContacts";
import {
  letterAddressMergeData,
  formatLetterAddress,
  suggestedLetterSalutation,
} from "@/utils/societyLetters";
import { csvRecipientWording } from "./societyLetterCsvFormat";
import { letterMergeBlockers } from "./societyLetterDocumentReadiness";

export const BULK_RECIPIENT_REVIEW_LIMIT = 5000;

export const QUESTIONABLE_FILTERS = [
  ["organization_contact", "Organization contact missing"],
  ["contact_choices", "Several organization contacts"],
  ["name_details", "Name or greeting needs attention"],
  ["address_parts", "Address fields need attention"],
  ["address_choices", "Different household addresses"],
  ["shared_address", "Address shared with another recipient"],
  ["email_choices", "Email needs a choice"],
  ["review_changed", "Saved review changed or expired"],
  ["review_unavailable", "Review unavailable"],
  ["document_fields", "Template or merge field issue"],
  ["recipient_choice", "Recipient needs a manual choice"],
];

const text = (value) => String(value ?? "").trim();
const normalize = (value) =>
  text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const requiredAddress = ["address_line_1", "city", "state", "zip"];
const completeAddress = (parts) =>
  requiredAddress.every((key) => text(parts[key]));
const usableAddress = (choice) => {
  const parts = letterAddressMergeData(choice);
  return (
    completeAddress(parts) &&
    normalize(choice.address) === normalize(formatLetterAddress(parts))
  );
};

function choicesFor(row) {
  // A saved manual edit is authoritative, even when deliberately blank.
  if (row.recipientReview?.values)
    return [{ ...row, ...row.recipientReview.values }];
  return row.recipientCandidates?.length ? row.recipientCandidates : [row];
}

function addressKeys(choice) {
  const parts = letterAddressMergeData(choice);
  const keys = [];
  if (completeAddress(parts))
    keys.push(
      JSON.stringify([
        "parts",
        ...[
          "address_line_1",
          "address_line_2",
          "city",
          "state",
          "zip",
          "country",
        ].map((key) => normalize(parts[key])),
      ]),
    );
  // Compare full blocks too, but never infer city/state/ZIP from free text.
  if (
    text(choice.address) &&
    (completeAddress(parts) || /[\r\n]/.test(choice.address))
  )
    keys.push(JSON.stringify(["block", normalize(choice.address)]));
  return keys;
}

// Index the whole holding list before search/society filters. Shared groups are
// retained once, rather than building quadratic lists of every matching pair.
export function sharedLetterAddresses(rows) {
  const byAddress = new Map();
  const byHousehold = new Map();
  for (const row of rows) {
    if (row.status !== "ready") continue;
    const keys = new Set(choicesFor(row).flatMap(addressKeys));
    for (const address of keys) {
      const key = JSON.stringify([row.period?.key || "", address]);
      if (!byAddress.has(key)) byAddress.set(key, new Map());
      byAddress.get(key).set(row.householdId, {
        householdId: row.householdId,
        name: row.name,
        societyName: row.societyName,
      });
    }
    byHousehold.set(
      row.householdId,
      [...keys].map((address) =>
        JSON.stringify([row.period?.key || "", address]),
      ),
    );
  }
  return new Map(
    [...byHousehold].map(([id, keys]) => [
      id,
      keys.map((key) => byAddress.get(key)).filter((group) => group.size > 1),
    ]),
  );
}

export function sharedAddressPeers(groups, householdId) {
  const peers = new Map();
  for (const group of groups || [])
    for (const [id, peer] of group) if (id !== householdId) peers.set(id, peer);
  return [...peers.values()];
}

// Triage is advisory: no review, delivery, eligibility or household identity is
// changed. In particular, an unreviewed but complete candidate is not an error.
export function letterReviewExceptions(
  row,
  channel,
  sharedGroups = [],
  usedFields = [],
) {
  const issues = [];
  const add = (key, detail, focus) => issues.push({ key, detail, focus });
  const saved = row.recipientReview?.status === "saved";
  const choices = choicesFor(row);
  const candidates = row.recipientCandidates || [];
  const proposed = !saved && proposedRecipientValues(row);
  if (row.recipientReview?.status === "needs_review")
    add(
      "review_changed",
      row.recipientReview.reason === "expired"
        ? "This recipient review is more than 15 days old."
        : "The returned details changed since this recipient was reviewed.",
      "changed",
    );
  if (row.recipientReview?.editable === false)
    add(
      "review_unavailable",
      "Reload saved results; the source or household may have changed.",
    );

  if (!saved) {
    const organizations = candidates.filter(isOrganizationLetterCandidate);
    if (
      organizations.some(
        (candidate) => !organizationLetterContacts(candidate).length,
      )
    )
      add(
        "organization_contact",
        "No Main contact or Society letter contact was returned. Choose organization-only wording or supply the intended contact in review.",
        "contacts",
      );
    if (
      organizations.some(
        (candidate) => organizationLetterContacts(candidate).length > 1,
      )
    )
      add(
        "contact_choices",
        "More than one contact was returned. Choose who this letter should address.",
        "contacts",
      );
    const individuals = candidates.filter(
      (candidate) => !isOrganizationLetterCandidate(candidate),
    );
    const incompleteNames =
      individuals.length > 0 &&
      (row.members || []).some((id) => {
        const member = row.memberNames?.find(
          (item) => item.constituentId === id,
        );
        return (
          !text(member?.preferredName || member?.firstName) ||
          !text(member?.lastName)
        );
      });
    const incompleteContacts = organizations.some((candidate) =>
      organizationLetterContacts(candidate).some(
        (contact) =>
          !text(contact.preferredName || contact.firstName) ||
          !text(contact.lastName),
      ),
    );
    if (
      incompleteNames ||
      incompleteContacts ||
      (!proposed &&
        !choices.some(
          (choice) =>
            text(choice.addressee) &&
            text(suggestedLetterSalutation(row, choice)),
        ))
    )
      add(
        "name_details",
        "Check the addressee and greeting. A name may be missing, including a spouse's name.",
        "greeting",
      );
  } else if (
    !choices.some((choice) => text(choice.addressee) && text(choice.salutation))
  ) {
    add(
      "name_details",
      "The saved addressee or greeting is blank.",
      "greeting",
    );
  }

  if (channel === "post") {
    if (!choices.some(usableAddress))
      add(
        "address_parts",
        "Check Address Line 1, City, State and ZIP for the CSV merge. Address Line 2 is optional; international formats may need manual review.",
        "address_line_1",
      );
    if (
      !saved &&
      new Set(
        choices
          .filter((choice) => text(choice.address))
          .map((choice) => normalize(choice.address)),
      ).size > 1
    )
      add(
        "address_choices",
        "Household members have different returned addresses. Choose the mailing address to use.",
        "address",
      );
    if (sharedGroups.length)
      add(
        "shared_address",
        "Another recipient in this holding list has a matching address. This may be intentional; records have not been combined.",
        "address",
      );
  } else {
    const emails = new Set(
      choices.flatMap((choice) =>
        [choice.email, ...(!saved ? choice.emailCandidates || [] : [])]
          .map(text)
          .filter(Boolean),
      ),
    );
    if (emails.size !== 1)
      add(
        "email_choices",
        emails.size
          ? "Several email addresses are available. Choose the intended recipient."
          : "No email is selected or available for this letter.",
        "email",
      );
  }
  const blockers = row.documentReadiness?.blockers || [];
  if (
    blockers.some(
      (blocker) =>
        blocker.action === "templates" ||
        (saved && blocker.code === "missing_merge_field"),
    ) ||
    (proposed &&
      letterMergeBlockers({ ...row, ...proposed }, usedFields).length)
  )
    add(
      "document_fields",
      "The template or a required merge field needs attention before creating the letter.",
    );
  if (!saved && !issues.length && !proposed)
    add(
      "recipient_choice",
      "Choose the recipient and wording individually; no reliable suggestion is available.",
      "changed",
    );
  return issues;
}

function proposedRecipientValues(row) {
  if (
    !row.members?.length ||
    row.members.length > 2 ||
    new Set(row.members).size !== row.members.length ||
    !row.recipientCandidates?.length ||
    row.recipientCandidates.some(
      (item) =>
        typeof item.constituentId !== "string" ||
        !row.members.includes(item.constituentId),
    ) ||
    new Set(row.recipientCandidates.map((item) => item.constituentId)).size !==
      row.recipientCandidates.length
  )
    return null;
  const candidates = [...(row.recipientCandidates || [])].sort(
    (a, b) =>
      a.constituentId.length - b.constituentId.length ||
      a.constituentId.localeCompare(b.constituentId),
  );
  const candidate = candidates[0];
  const address = candidates.find(usableAddress);
  if (!candidate || !address || !row.members?.includes(candidate.constituentId))
    return null;
  const organization = isOrganizationLetterCandidate(candidate);
  if (organization && (candidates.length !== 1 || row.members.length !== 1))
    return null;
  if (!organization && candidates.some(isOrganizationLetterCandidate))
    return null;
  const contact = organizationLetterContacts(candidate);
  if (organization && contact.length !== 1) return null;
  const values = {
    recipientConstituentId: candidate.constituentId,
    addressConstituentId: address.constituentId,
    addressee: candidate.addressee || "",
    salutation: suggestedLetterSalutation(row, candidate),
    address: formatLetterAddress(letterAddressMergeData(address)),
    addressParts: letterAddressMergeData(address),
    email: "",
  };
  if (organization) {
    values.organizationContactKey = contactChoiceKey(contact[0]);
    values.includeOrganizationName = true;
    values.addressee = organizationContactAddressee(
      contact[0],
      candidate.addressee || row.name,
      true,
    );
    values.salutation = text(contact[0].preferredName || contact[0].firstName);
  } else {
    try {
      Object.assign(
        values,
        csvRecipientWording(
          { ...row, ...values },
          {
            addressee: "household_preferred",
            salutation: "household_preferred",
          },
        ),
      );
    } catch {
      return null;
    }
  }
  return values;
}

export function straightforwardRecipient(
  row,
  sharedGroups = [],
  usedFields = [],
) {
  if (
    row.status !== "ready" ||
    row.recipientReview?.status !== "unreviewed" ||
    row.recipientReview?.values ||
    !row.recipientReview?.editable ||
    !row.recipientReview?.token ||
    letterReviewExceptions(row, "post", sharedGroups, usedFields).length
  )
    return null;
  return proposedRecipientValues(row);
}
