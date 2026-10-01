import { createHash } from "node:crypto";
import {
  isLetterPreviewSource,
  letterDisposition,
  letterError,
  LETTER_ADDRESS_TAGS,
  LETTER_NAME_TAGS,
  formatLetterAddress,
} from "@/utils/societyLetters";
import {
  organizationLetterContacts,
  contactChoiceKey,
} from "@/utils/societyLetterContacts";

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const membersFor = (row) => [...row.members].sort();
const reviewKey = (row) => hash([row.period.key, membersFor(row)]);

export function recipientReviewForRow(state, row, sourceSignature) {
  if (!isLetterPreviewSource(row) || !row.recipientCandidates) return null;
  const members = membersFor(row);
  const token = hash([
    sourceSignature,
    row.period,
    members,
    row.societyKey,
    [...(row.qualifiedKeys || [])].sort(),
    [...(row.memberNames || [])].sort((a, b) =>
      a.constituentId.localeCompare(b.constituentId),
    ),
    row.recipientCandidates
      .map((candidate) => ({
        ...candidate,
        emailCandidates: [...(candidate.emailCandidates || [])].sort(),
      }))
      .sort((a, b) => a.constituentId.localeCompare(b.constituentId)),
  ]);
  const reviews = state.recipient_reviews || {};
  const saved = reviews[reviewKey(row)];
  const related =
    saved ||
    Object.values(reviews).find(
      (review) =>
        review.period.key === row.period.key &&
        review.members.some((id) => members.includes(id)),
    );
  const editable =
    state.snapshot?.signature === sourceSignature &&
    letterDisposition(row, state.history, state.exclusions).status === "ready";
  const current = editable && saved?.token === token;
  return {
    status: current ? "saved" : related ? "needs_review" : "unreviewed",
    token,
    editable,
    values: current ? saved.values : null,
    savedAt: related?.savedAt || null,
    savedBy: related?.savedBy || null,
  };
}

function plainText(value, label, limit, optional = false, multiline = false) {
  if (
    typeof value !== "string" ||
    value.length > limit ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ||
    (!multiline && /[\r\n\t]/.test(value)) ||
    (!optional && !value.trim())
  )
    throw letterError(
      `${label} must be ${optional ? "blank or " : ""}plain text, up to ${limit} characters.`,
    );
  return value.replaceAll("\r\n", "\n").trim();
}

export function validateLetterRecipientChoices(
  state,
  row,
  sourceSignature,
  body,
) {
  const review = row && recipientReviewForRow(state, row, sourceSignature);
  if (!review?.editable || review.token !== body.reviewToken)
    throw letterError(
      "The household or source details changed. Reload the holding list and review the current recipient options.",
      409,
    );
  const selected = row.recipientCandidates.find(
    (candidate) => candidate.constituentId === body.recipientConstituentId,
  );
  const addressSource = row.recipientCandidates.find(
    (candidate) => candidate.constituentId === body.addressConstituentId,
  );
  if (
    !selected ||
    !addressSource ||
    !row.members.includes(selected.constituentId) ||
    !row.members.includes(addressSource.constituentId)
  )
    throw letterError(
      "Choose a recipient and address source from this household's returned records.",
    );
  const email = plainText(body.email, "Email", 320, true);
  const organizationContactKey = body.organizationContactKey ?? "";
  if (
    typeof organizationContactKey !== "string" ||
    (organizationContactKey &&
      !organizationLetterContacts(selected).some(
        (contact) => contactChoiceKey(contact) === organizationContactKey,
      ))
  )
    throw letterError(
      "Choose an organization contact from this record's returned Main contact or Society letter contact names.",
    );
  const includeOrganizationName = body.includeOrganizationName === true;
  if (
    (body.includeOrganizationName !== undefined &&
      typeof body.includeOrganizationName !== "boolean") ||
    (includeOrganizationName && !organizationContactKey)
  )
    throw letterError(
      "Choose a returned organization contact before including the organization in the address block.",
    );
  if (
    email &&
    (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email) ||
      ![selected.email, ...(selected.emailCandidates || [])].includes(email))
  )
    throw letterError(
      "Choose one of the selected recipient's returned email addresses, or leave email blank.",
    );
  const address = plainText(body.address, "Mailing address", 2000, true, true);
  let nameOverrides;
  if (body.nameOverrides != null) {
    if (
      typeof body.nameOverrides !== "object" ||
      Array.isArray(body.nameOverrides) ||
      Object.keys(body.nameOverrides).some(
        (key) => !LETTER_NAME_TAGS.includes(key),
      )
    )
      throw letterError("Choose supported name merge fields for this letter.");
    nameOverrides = Object.fromEntries(
      Object.entries(body.nameOverrides).map(([key, value]) => [
        key,
        plainText(value, `Name ${key}`, 300, true),
      ]),
    );
  }
  let addressParts;
  if (body.addressParts != null) {
    if (
      typeof body.addressParts !== "object" ||
      Array.isArray(body.addressParts)
    )
      throw letterError("Choose valid separate address fields.");
    addressParts = Object.fromEntries(
      LETTER_ADDRESS_TAGS.map((key) => [
        key,
        plainText(body.addressParts[key], `Address ${key}`, 300, true),
      ]),
    );
    if (formatLetterAddress(addressParts) !== address)
      throw letterError(
        "The separate address fields do not match the mailing address. Review the address before saving.",
      );
  } else if (address === addressSource.address && addressSource.addressParts) {
    addressParts = { ...addressSource.addressParts };
  }
  return {
    recipientConstituentId: selected.constituentId,
    ...(organizationContactKey ? { organizationContactKey } : {}),
    ...(organizationContactKey && body.includeOrganizationName !== undefined
      ? { includeOrganizationName }
      : {}),
    addressConstituentId: addressSource.constituentId,
    addressee: plainText(
      body.addressee,
      "Addressee",
      includeOrganizationName ? 700 : 300,
      false,
      includeOrganizationName,
    ),
    salutation: plainText(body.salutation, "Salutation", 300),
    ...(nameOverrides ? { nameOverrides } : {}),
    address,
    ...(addressParts ? { addressParts } : {}),
    email,
  };
}

export async function saveLetterRecipientReview(
  state,
  row,
  sourceSignature,
  body,
  store,
  userId,
) {
  const values = validateLetterRecipientChoices(
    state,
    row,
    sourceSignature,
    body,
  );
  if (body.confirm !== true)
    throw letterError(
      "Confirm that you reviewed the letter recipient and wording.",
    );
  const reviews = {
    ...(state.recipient_reviews || {}),
    [reviewKey(row)]: {
      period: { ...row.period },
      members: membersFor(row),
      token: body.reviewToken,
      values,
      savedBy: userId,
      savedAt: new Date().toISOString(),
    },
  };
  if (
    Object.keys(reviews).length > 10000 ||
    Buffer.byteLength(JSON.stringify(reviews), "utf8") > 8 * 1024 * 1024
  )
    throw letterError(
      "Saved recipient choices need archiving before adding more periods.",
    );
  // Separate from replaceable query snapshots; this never grants delivery permission.
  const nextState = { ...state, recipient_reviews: reviews };
  await store.save(nextState);
  state.recipient_reviews = reviews;
  state.revision = nextState.revision;
}
