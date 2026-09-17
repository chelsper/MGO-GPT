import {
  closedOpportunityKind,
  formatCalendarDate,
} from "@/utils/prospectActivity";

export const FUNDED_OPPORTUNITY_STATUS = "Closed – Gift Secured";

export const DECLINED_OPPORTUNITY_STATUS = "Closed – Declined";

export function formatCurrency(amount) {
  if (!amount) return "$0";
  return "$" + Number(amount).toLocaleString();
}

export function getOpportunityDisplayStatus(opportunity = {}) {
  const closedKind = closedOpportunityKind(opportunity);
  if (closedKind) return closedKind;
  const stage = opportunity?.current_stage || "";
  const status = opportunity?.opportunity_status || "Active";

  if (
    stage === "Funded" ||
    status === FUNDED_OPPORTUNITY_STATUS ||
    (Number(opportunity?.closed_amount || 0) > 0 &&
      status !== DECLINED_OPPORTUNITY_STATUS)
  ) {
    return "Funded";
  }

  if (stage === "Declined" || status === DECLINED_OPPORTUNITY_STATUS) {
    return "Declined";
  }

  return stage || "Identification";
}

export function isFundedOpportunity(opportunity = {}) {
  return getOpportunityDisplayStatus(opportunity) === "Funded";
}

export function isDeclinedOpportunity(opportunity = {}) {
  return getOpportunityDisplayStatus(opportunity) === "Declined";
}

export function formatLongDate(value) {
  return formatCalendarDate(value);
}

export function getSubmissionTimelineLabel(submission) {
  switch (submission.submission_type) {
    case "donor_update":
      return "Donor update";
    case "opportunity_update":
      return "Opportunity update";
    case "constituent_suggestion":
      return "Constituent suggestion";
    default:
      return "Submission";
  }
}

export function getSubmissionTimelineDescription(submission) {
  switch (submission.submission_type) {
    case "donor_update":
      return (
        submission.notes || submission.transcript || "Donor update submitted."
      );
    case "opportunity_update":
      return (
        submission.notes ||
        submission.next_step ||
        "Opportunity update submitted."
      );
    case "constituent_suggestion":
      return (
        submission.notes ||
        submission.organization ||
        "New constituent suggestion submitted."
      );
    default:
      return submission.notes || "Submission updated.";
  }
}

export function getOpportunityDisplayAmount(opportunity) {
  if (isFundedOpportunity(opportunity)) {
    return getOpportunityFundedDisplayAmount(opportunity);
  }

  if (isDeclinedOpportunity(opportunity)) {
    return 0;
  }

  return opportunity.estimated_amount ?? 0;
}

export function getLinkedGiftTotal(opportunity = {}) {
  if (
    !Array.isArray(opportunity.linked_gifts) ||
    opportunity.linked_gifts.length === 0
  ) {
    return null;
  }

  let hasGiftAmount = false;
  const total = opportunity.linked_gifts.reduce((sum, giftLink) => {
    const amount = Number(giftLink?.gift_amount);
    if (!Number.isFinite(amount)) return sum;
    hasGiftAmount = true;
    return sum + amount;
  }, 0);

  return hasGiftAmount ? total : null;
}

export function hasOpportunityFundedAmount(opportunity = {}) {
  return (
    getLinkedGiftTotal(opportunity) != null || opportunity.closed_amount != null
  );
}

export function getOpportunityFundedDisplayAmount(opportunity = {}) {
  const linkedGiftTotal = getLinkedGiftTotal(opportunity);
  return (
    linkedGiftTotal ??
    opportunity.closed_amount ??
    opportunity.estimated_amount ??
    0
  );
}

export const workspaceCardStyle = {
  backgroundColor: "white",
  borderRadius: "16px",
  border: "1px solid #E5E7EB",
  padding: "18px",
};

export const sectionEyebrowStyle = {
  fontSize: "12px",
  fontWeight: "700",
  color: "#6B7280",
  margin: "0 0 6px 0",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const detailLabelStyle = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#6B7280",
  marginBottom: "2px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

export function buildProspectTimeline(updates, linkedSubmissions) {
  return [
    ...updates.map((update) => ({
      id: `progress-${update.id}`,
      occurredAt: update.update_date || update.created_at,
      kind: "progress",
      title: update.update_title || "Progress update",
      description: update.update_notes,
      meta: [
        update.action_category || null,
        update.action_type || null,
        formatLongDate(update.update_date || update.created_at),
      ]
        .filter(Boolean)
        .join(" · "),
      accent: "#6A5BFF",
      border: "#DDD6FE",
      background: "#F5F3FF",
      raw: update,
    })),
    ...linkedSubmissions.map((submission) => ({
      id: `submission-${submission.id}`,
      occurredAt:
        submission.reviewed_at ||
        submission.updated_at ||
        submission.date_submitted,
      kind: "submission",
      title: getSubmissionTimelineLabel(submission),
      description: getSubmissionTimelineDescription(submission),
      meta: [
        submission.status,
        submission.reviewer_notes
          ? `Reviewer note from ${submission.reviewer_name || "reviewer"}`
          : null,
        formatLongDate(
          submission.reviewed_at ||
            submission.updated_at ||
            submission.date_submitted,
        ),
      ]
        .filter(Boolean)
        .join(" · "),
      accent:
        submission.status === "Needs Clarification" ? "#B45309" : "#065F46",
      border:
        submission.status === "Needs Clarification" ? "#FCD34D" : "#A7F3D0",
      background:
        submission.status === "Needs Clarification" ? "#FFFBEB" : "#ECFDF5",
      reviewerNotes: submission.reviewer_notes,
      raw: submission,
    })),
  ].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}
