function getPreview(row) {
  return row?.input || row?.matchStatus ? row : row?.preview || row;
}

export class ImportMatchReviewConflict extends Error {
  constructor() {
    super("The import row or match changed, or an NXT operation is in progress. Reload this row before saving review choices.");
    this.name = "ImportMatchReviewConflict";
  }
}

export function isImportMatchRejected(row) {
  return getPreview(row)?.matchReview?.decision === "rejected";
}

export function canChangeImportMatch(row) {
  if (!row || !["Ready", "Needs Review", "Conflict", "Skipped"].includes(row.status)) return false;
  const result = row.blackbaud_result || row.blackbaudResult || {};
  return !(
    row.applied_at || row.appliedAt ||
    row.created_blackbaud_constituent_id || row.createdBlackbaudConstituentId ||
    row.create_request_started_at || row.createRequestStartedAt ||
    row.create_approved_at || row.createApprovedAt ||
    result.results?.length || result.attempts?.length
  );
}

export function getSelectedImportMatchId(row) {
  if (isImportMatchRejected(row)) return "";
  const preview = getPreview(row);
  return String(row?.matched_blackbaud_constituent_id || row?.matchedBlackbaudConstituentId ||
    preview?.match?.blackbaudConstituentId || "").trim();
}

export function rejectedImportMatchPreview(preview, matchReview) {
  const message = "Selected NXT record marked not a match. Choose another record or leave this row for review. This does not approve creating a new record.";
  // Retain source input and review history, but never target-specific snapshots,
  // contact replacement IDs, or writes from the rejected constituent.
  return {
    rowNumber: preview.rowNumber,
    input: preview.input,
    importIntent: preview.importIntent,
    useHierarchy: preview.useHierarchy,
    status: "Needs Review",
    matchStatus: "unresolved",
    matchMethod: "Reviewer rejected NXT match",
    confidence: 0,
    match: null,
    matchReview,
    rejectedMatches: preview.rejectedMatches || [],
    currentContacts: { emails: [], phones: [], addresses: [] },
    contactSnapshotStatus: { emails: false, phones: false, addresses: false },
    contactsSnapshotLoaded: false,
    profileSnapshot: null,
    profileSnapshotLoaded: false,
    currentNameFormats: { addressee: { id: "", value: "" }, salutation: { id: "", value: "" } },
    nameFormatsSnapshotLoaded: false,
    currentCodes: [], currentCodeDetails: [], proposedCodes: [], codesSnapshotLoaded: false,
    currentEducations: [], educationsSnapshotLoaded: false,
    contactReviewDecisions: {}, fieldReviewDecisions: {}, deferredHydration: null,
    writePlan: [],
    reasons: [message],
    intentDisposition: { key: "needs_resolution", label: "Match rejected - review required", allowApply: false, message },
  };
}
