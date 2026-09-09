import { IMPORT_MATCH_CRITERIA_VERSION, normalizeImportMatchCandidate, importMatchEvidence } from "./importMatchEvidence";
export { normalizeImportMatchCandidate } from "./importMatchEvidence";

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

export function isImportDuplicatePreflightHold(row) {
  const result = row?.blackbaud_result || row?.blackbaudResult;
  if (result?.type === "import_duplicate_review" || (result?.duplicateCandidate && result?.duplicateCheckAt)) return true;
  // Older quick checks saved only these pre-POST warnings, leaving approval set.
  // Unknown errors and create failures must never be treated as safe holds.
  const quickStatus = row?.quick_create_status || row?.quickCreateStatus;
  const message = row?.blackbaud_error || row?.blackbaudError || "";
  return quickStatus === "review" && !result && (
    /^An NXT system ID already exists\. Held for review\.$/.test(message) ||
    /^NXT found (?:a possible (?:lookup ID|email|first and last name|mailing-address) match|a similar address and matching ZIP first five)\. Held for (?:review|ZIP and duplicate review)\.$/.test(message) ||
    message === "NXT found possible address matches. Review their ZIP codes and other addresses before creating this record."
  );
}

export function getImportLocalDuplicate(row) {
  const preview = getPreview(row) || {};
  const result = row?.blackbaud_result || row?.blackbaudResult || {};
  if (preview.localDuplicateCheckedAt && !(Date.parse(result.duplicateCheckAt) > Date.parse(preview.localDuplicateCheckedAt))) {
    return preview.localDuplicate || null;
  }
  return result.localDuplicate || preview.localDuplicate || null;
}

export function needsLocalDuplicateContext(row) {
  const preview = getPreview(row) || {};
  const result = row?.blackbaud_result || row?.blackbaudResult || {};
  if (getImportLocalDuplicate(row) || preview.localDuplicateCheckedAt) return false;
  return [row?.blackbaud_error, row?.blackbaudError, preview.matchSuggestionsNotice, result.message]
    .some((value) => String(value || "").startsWith("Another import row"));
}

export function importErrorLabel(row) {
  const result = row?.blackbaud_result || row?.blackbaudResult || {};
  if (result.results?.length || result.attempts?.length) return "NXT write needs review";
  if (getPreview(row)?.identityVerification) return "Live identity check held this row";
  if (isImportDuplicatePreflightHold(row) || getImportLocalDuplicate(row) || needsLocalDuplicateContext(row)) return "Import held before creation";
  return "Import needs review";
}

export function withFocusedImportRow(queueRows, allRows, focusedId) {
  const focused = allRows.find((row) => String(row.id) === String(focusedId));
  return focused && !queueRows.some((row) => String(row.id) === String(focusedId))
    ? [focused, ...queueRows] : queueRows;
}

export function canChangeImportMatch(row) {
  if (!row || !["Ready", "Needs Review", "Conflict", "Skipped"].includes(row.status)) return false;
  const result = row.blackbaud_result || row.blackbaudResult || {};
  return !(
    row.applied_at || row.appliedAt ||
    row.created_blackbaud_constituent_id || row.createdBlackbaudConstituentId ||
    row.create_request_started_at || row.createRequestStartedAt ||
    ((row.create_approved_at || row.createApprovedAt) && !isImportDuplicatePreflightHold(row)) ||
    result.results?.length || result.attempts?.length
  );
}

export function getImportMatchCandidates(row, { includeRejected = false } = {}) {
  const preview = getPreview(row) || {};
  const result = row?.blackbaud_result || row?.blackbaudResult || {};
  const rejected = new Set((preview.rejectedMatches || []).map((entry) => String(entry.constituentId)));
  const selectedId = getSelectedImportMatchId(row);
  const candidates = new Map();
  // A completed fresh check supersedes old broad-search hits, not their audit.
  const fresh = preview.matchCriteriaVersion === IMPORT_MATCH_CRITERIA_VERSION && preview.matchSuggestionsCheckedAt &&
    !(Date.parse(result.duplicateCheckAt) > Date.parse(preview.matchSuggestionsCheckedAt));
  for (const raw of [preview.match, ...(preview.matchCandidates || []), ...(fresh ? [] : [...(result.matchCandidates || []), result.duplicateCandidate])]) {
    const candidate = normalizeImportMatchCandidate(raw);
    if (!candidate) continue;
    const existing = candidates.get(candidate.blackbaudConstituentId);
    if (existing) {
      for (const [field, value] of Object.entries(candidate)) {
        if (!existing[field] || existing[field] === "Unnamed constituent") existing[field] = value;
      }
    } else candidates.set(candidate.blackbaudConstituentId, candidate);
  }
  return [...candidates.values()].map((candidate) => {
    const evidence = importMatchEvidence(preview.input || {}, candidate);
    if (evidence.rank) return { ...candidate, matchCategory: evidence.category, matchRank: evidence.rank, reason: evidence.reasons.join("; ") };
    if (candidate.blackbaudConstituentId === selectedId) return candidate;
    // Legacy suggestions without comparison fields cannot safely be dismissed
    // until a fresh, complete server check replaces them.
    const hasComparisonInput = ["firstName", "lastName", "constituentName", "email", "email2", "blackbaudConstituentId", "lookupId", "addressLine1"].some((key) => preview.input?.[key]);
    if (!hasComparisonInput || !candidate.firstName || !candidate.lastName) return { ...candidate, matchCategory: "Needs comparison" };
    return null;
  }).filter((candidate) => candidate && (includeRejected || candidate.blackbaudConstituentId === selectedId || !rejected.has(candidate.blackbaudConstituentId)))
    .sort((a, b) => b.matchRank - a.matchRank || a.name.localeCompare(b.name));
}

export function getSelectedImportMatchId(row) {
  if (isImportMatchRejected(row)) return "";
  const preview = getPreview(row);
  return String(row?.matched_blackbaud_constituent_id || row?.matchedBlackbaudConstituentId ||
    preview?.match?.blackbaudConstituentId || "").trim();
}

export function sameReviewedImportTarget(before, after) {
  const a = normalizeImportMatchCandidate(getPreview(before)?.match);
  const b = normalizeImportMatchCandidate(getPreview(after)?.match);
  return Boolean(a && b && a.blackbaudConstituentId === b.blackbaudConstituentId &&
    a.lookupId === b.lookupId && a.name === b.name);
}

export function canReviewNewImportRecord(row) {
  return canChangeImportMatch(row) && ["Ready", "Needs Review"].includes(row.status) && !getSelectedImportMatchId(row);
}

export function getReviewedNonmatchIds(row) {
  return [...new Set((getPreview(row)?.rejectedMatches || [])
    .filter((entry) => entry.decision === "rejected" && entry.reviewedByUserId && entry.reviewedAt && entry.constituentId)
    .map((entry) => String(entry.constituentId)))].sort();
}

export function rejectedImportMatchPreview(preview, matchReview) {
  const message = "Selected NXT record marked not a match. Select another record to update, or run Check for duplicates below and confirm a new constituent. Rejecting a match alone does not create a record.";
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
    matchCandidates: getImportMatchCandidates(preview, { includeRejected: true }),
    matchSuggestionsCheckedAt: preview.matchSuggestionsCheckedAt || null,
    matchCriteriaVersion: preview.matchCriteriaVersion || null,
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
