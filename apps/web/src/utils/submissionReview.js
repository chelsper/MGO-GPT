const clean = (value) => String(value ?? "").trim();
export const MANUAL_SUBMISSION_REQUEST_PATTERN = "Data update|Assignment request|Add to top prospects";
export const CLOSED_SUBMISSION_STATUSES = ["Complete", "Completed", "Approved", "Declined"];

export function hasSubmissionSyncFailure(row) {
  return clean(row.blackbaud_sync_status).toLowerCase() === "failed" || Boolean(clean(row.blackbaud_sync_error));
}

export function isSubmissionSynced(row) {
  return !hasSubmissionSyncFailure(row) && ["synced", "success"].includes(clean(row.blackbaud_sync_status).toLowerCase());
}

export function isRoutineSubmission(row) {
  const type = clean(row.submission_type).toLowerCase();
  return type === "opportunity_update" || (type === "donor_update"
    && !new RegExp(MANUAL_SUBMISSION_REQUEST_PATTERN, "i").test(clean(row.interaction_type)));
}

export function isSubmissionHistoryOnly(row) {
  if (hasSubmissionSyncFailure(row)) return false;
  if (isSubmissionSynced(row)) return true;
  // Preserve actual clarification questions, but do not mistake a legacy Pending
  // flag for an approval requirement or proof that an NXT write occurred.
  return isRoutineSubmission(row) && clean(row.status) !== "Needs Clarification"
    && ["", "not_requested"].includes(clean(row.blackbaud_sync_status).toLowerCase());
}

export function getSubmissionQueueGroup(row) {
  if (hasSubmissionSyncFailure(row)) return "active";
  if (isSubmissionHistoryOnly(row)) return "history";
  if (clean(row.status) === "Needs Clarification") return "waiting";
  if (isRoutineSubmission(row)) return "active";
  return CLOSED_SUBMISSION_STATUSES.includes(clean(row.status)) ? "history" : "active";
}

export function canReviewSubmission(row) {
  return !hasSubmissionSyncFailure(row) && !isSubmissionHistoryOnly(row)
    && (!isRoutineSubmission(row) || clean(row.status) === "Needs Clarification");
}

export function getSubmissionDisplayStatus(row) {
  if (hasSubmissionSyncFailure(row)) return "NXT follow-up required";
  if (isSubmissionSynced(row)) return "Synced to NXT";
  if (isSubmissionHistoryOnly(row)) return "Saved in app";
  if (isRoutineSubmission(row) && clean(row.status) !== "Needs Clarification") return "NXT follow-up required";
  return clean(row.status) || "Pending";
}

export function getSubmissionReviewFilter(row) {
  return getSubmissionQueueGroup(row) === "history" ? "History" : getSubmissionDisplayStatus(row);
}

export function getSubmissionActivityNotice(row) {
  if (isSubmissionSynced(row)) return "This activity was synced to NXT. No Advancement Services approval is required.";
  if (isSubmissionHistoryOnly(row)) return "Saved in app. NXT sync is not confirmed for this activity. No approval is required; keeping it in History does not send or resend it to NXT.";
  if (!canReviewSubmission(row)) return "This activity needs NXT sync follow-up, not approval. Saving reviewer notes does not repair or retry the NXT write.";
  return null;
}
