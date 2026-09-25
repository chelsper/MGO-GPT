import { organizationLetterContacts } from "@/utils/societyLetterContacts";

export const REVIEW_FILTERS = [
  ["all", "All recipients"],
  ["needs_review", "Needs review"],
  ["reviewed", "Reviewed"],
  ["attention", "Needs attention"],
];

export const ATTENTION_FILTERS = [
  ["changed", "Recipient choices changed"],
  ["unavailable", "Recipient review unavailable"],
  ["address", "Mailing address missing"],
  ["email", "Email missing or not selected"],
  ["greeting", "Addressee or greeting missing"],
  ["contacts", "Organization contact choices"],
  ["readiness", "Readiness needs attention"],
];

const hasText = (value) => typeof value === "string" && !!value.trim();

// Review and delivery readiness are independent. These saved-data facets never
// grant delivery permission or replace the server's eligibility checks.
export function letterReviewView(row, channel, sourceIssue = null) {
  const review = row.recipientReview;
  const reviewed = review?.status === "saved";
  const needsReview = !!review && !reviewed;
  const candidates = row.recipientCandidates;
  const choices = reviewed
    ? [review.values || row]
    : candidates?.length
      ? candidates
      : [row];
  const attention = [];
  if (review?.status === "needs_review") attention.push("changed");
  if (review?.editable === false) attention.push("unavailable");
  if (channel === "post" && !choices.some((item) => hasText(item.address)))
    attention.push("address");
  if (
    channel === "email" &&
    !choices.some(
      (item) =>
        hasText(item.email) ||
        (!reviewed && item.emailCandidates?.some(hasText)),
    )
  )
    attention.push("email");
  if (
    !choices.some((item) => hasText(item.addressee) && hasText(item.salutation))
  )
    attention.push("greeting");
  if (
    !reviewed &&
    candidates?.some((item) => organizationLetterContacts(item).length > 1)
  )
    attention.push("contacts");
  if (
    row.readiness?.[channel]?.status === "needs_review" ||
    (!candidates &&
      row.issues?.[channel] &&
      row.issues[channel] !== sourceIssue)
  )
    attention.push("readiness");
  return { reviewed, needsReview, attention };
}

export function matchesLetterReview(view, filter) {
  if (filter === "needs_review") return view.needsReview;
  if (filter === "reviewed") return view.reviewed;
  if (filter === "attention") return view.attention.length > 0;
  return true;
}

export function letterReviewCounts(views) {
  return Object.fromEntries(
    REVIEW_FILTERS.map(([key]) => [
      key,
      views.filter((view) => matchesLetterReview(view, key)).length,
    ]),
  );
}
