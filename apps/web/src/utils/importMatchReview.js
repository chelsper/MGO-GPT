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

export function normalizeImportMatchCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  // Lookup IDs are not system IDs and must not be used for NXT profile links.
  const id = text(candidate.blackbaudConstituentId || candidate.constituentId || candidate.record_id || candidate.id);
  if (!id) return null;
  return {
    blackbaudConstituentId: id,
    lookupId: text(candidate.lookupId || candidate.blackbaudLookupId || candidate.lookup_id || candidate.constituent_id),
    name: text(candidate.name) || [candidate.firstName || candidate.first_name || candidate.first, candidate.middle_name || candidate.middle, candidate.lastName || candidate.last_name || candidate.last].map(text).filter(Boolean).join(" ") || text(candidate.display_name || candidate.org_name) || "Unnamed constituent",
    email: text(candidate.email?.address || candidate.email || candidate.primary_email),
    email2: text(candidate.email2 || candidate.matched_email),
    address: text(candidate.address?.address_lines || candidate.address || candidate.addressLine1 || candidate.address_block),
    postalCode: text(candidate.postalCode || candidate.address?.postal_code || candidate.address_post_code),
    reason: text(candidate.reason),
  };
}

export function getImportMatchCandidates(row, { includeRejected = false } = {}) {
  const preview = getPreview(row) || {};
  const result = row?.blackbaud_result || row?.blackbaudResult || {};
  const rejected = new Set((preview.rejectedMatches || []).map((entry) => String(entry.constituentId)));
  const selectedId = getSelectedImportMatchId(row);
  const candidates = new Map();
  for (const raw of [preview.match, ...(preview.matchCandidates || []), ...(result.matchCandidates || []), result.duplicateCandidate]) {
    const candidate = normalizeImportMatchCandidate(raw);
    if (!candidate) continue;
    const existing = candidates.get(candidate.blackbaudConstituentId);
    if (existing) {
      for (const [field, value] of Object.entries(candidate)) {
        if (!existing[field] || existing[field] === "Unnamed constituent") existing[field] = value;
      }
    } else candidates.set(candidate.blackbaudConstituentId, candidate);
  }
  return [...candidates.values()].filter((candidate) => includeRejected || candidate.blackbaudConstituentId === selectedId || !rejected.has(candidate.blackbaudConstituentId));
}

export function getSelectedImportMatchId(row) {
  if (isImportMatchRejected(row)) return "";
  const preview = getPreview(row);
  return String(row?.matched_blackbaud_constituent_id || row?.matchedBlackbaudConstituentId ||
    preview?.match?.blackbaudConstituentId || "").trim();
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
    matchCandidates: getImportMatchCandidates(preview, { includeRejected: true }),
    matchSuggestionsCheckedAt: preview.matchSuggestionsCheckedAt || null,
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
