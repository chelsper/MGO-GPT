import { importWritePlanKey, hasImportWriteHistory } from "./importWriteResults";
import { isLegacyContactHold } from "./newConstituentImport";

export const QUICK_IMPORT_PHASES = {
  create: "Checking duplicates and creating identity",
  details: "Loading current NXT details",
  apply: "Adding approved missing details",
  verify: "Verifying saved details in NXT",
  complete: "Complete",
  review: "Needs individual review",
};

export function quickImportInputKey(input) {
  return importWritePlanKey([input]);
}

export function quickImportScopes(input) {
  return [
    (input.nameUpdate || input.individualProfileUpdate) && "profile",
    (input.emailUpdates?.length || input.phoneUpdates?.length || input.addressUpdates?.length) && "contacts",
    input.nameFormatUpdate && "nameFormats",
    input.educationRelationship && "educations",
    (input.sourceConstituency || input.targetConstituency) && "codes",
  ].filter(Boolean);
}

export function quickImportResumeCandidate(row) {
  const workflow = row.quickImportWorkflow || row.preview?.quickImportWorkflow;
  return Boolean((row.createdBlackbaudConstituentId || row.created_blackbaud_constituent_id) &&
    workflow?.approvedByUserId && ["details", "apply", "verify"].includes(workflow.phase) &&
    ["Ready", "Needs Review", "Applied", "Failed"].includes(row.status));
}

export function quickImportApprovalBlocker(row) {
  const preview = row.preview || row;
  const workflow = preview.quickImportWorkflow;
  const created = String(row.created_blackbaud_constituent_id || row.createdBlackbaudConstituentId || "");
  const matched = String(row.matched_blackbaud_constituent_id || preview.match?.blackbaudConstituentId || "");
  if (!created || created !== matched || !workflow?.approvedByUserId || workflow.constituentId !== created) return "Automatic completion is only available for the exact new record created by this approved batch.";
  if (workflow.inputKey !== quickImportInputKey(preview.input)) return "The source values changed after batch approval. Review this row before sending further changes.";
  if (["contactReviewDecisions", "fieldReviewDecisions"].some((key) => Object.values(preview[key] || {}).some((value) => Object.keys(value || {}).length))) return "Saved field or contact choices need individual review before further changes.";
  if (["Skipped", "Conflict", "Creating", "Applying"].includes(row.status)) return "This row is skipped, conflicted, or already processing. Reopen it before continuing.";
  return null;
}

export function quickImportApplyBlocker(row) {
  const approval = quickImportApprovalBlocker(row);
  if (approval) return approval;
  if (row.preview?.quickImportWorkflow?.phase !== "apply") return "This row is not at the automatic detail-addition step.";
  if (hasImportWriteHistory(row)) return "This row already has a write checkpoint. Verify its saved results rather than sending it again.";
  const writes = row.requested_writes || row.preview?.writePlan || [];
  for (const write of writes) {
    if (write.requiresReview || write.deferredHydration) return write.validationMessage || "A staged value needs individual review.";
    if (!["email_address", "phone", "address", "constituent_code", "education_relationship"].includes(write.type) ||
      write.action !== "add" || write.targetId || write.sourceCodeId || write.demoteExistingPrimary || write.existingPrimaryId || write.requiresSuccessfulAddressAdd) {
      return "Only safe additions are completed automatically. Replacements, primary changes to existing contacts, and other changes need individual review.";
    }
  }
  return null;
}

export function importRecoveryState(row) {
  const message = row.blackbaudError || row.blackbaud_error || (row.quickImportWorkflow?.phase === "review" ? row.quickImportWorkflow.message : "") || "";
  if (isLegacyContactHold(row) && !row.createdBlackbaudConstituentId && !row.createRequestStartedAt) return {
    title: "Multiple-contact row can be checked again", action: "Review this record",
    message: "An older quick-import rule held this row for multiple contacts. Use Resume safe import above to validate all contacts and run fresh duplicate checks. Nothing has been created by this attempt.",
    resume: true,
  };
  if (/uncertain|unconfirmed|did not return a confirmed|checkpoint could not|reconcile this row/i.test(message) || row.quickCreateStatus === "uncertain") {
    return { title: "Confirm the NXT result", action: "Compare NXT before continuing", message };
  }
  if (/possible .*match|first and last name match|similar address.*matching ZIP|Another import row|system ID already exists/i.test(message)) return { title: "Possible duplicate", action: "Review suggested matches", message };
  if (/primary|contact|email.*review|NXT type|Valid From/i.test(message)) return { title: "Contact choice needed", action: "Review contact choices", message };
  if (/quota|connection|paused|could not.*confirm|unavailable|could not.*load/i.test(message)) return { title: "NXT check needs attention", action: "Retry NXT checks", message };
  if (message) return { title: "Record needs review", action: "Review this record", message };
  if (["possible_duplicate", "needs_resolution"].includes(row.intentDisposition?.key)) return { title: "Possible duplicate", action: "Review suggested matches", message: row.intentDisposition?.message };
  return null;
}
