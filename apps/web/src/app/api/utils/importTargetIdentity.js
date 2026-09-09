import { blackbaudApiFetch } from "./blackbaud";
import { importMatchEvidence, normalizeImportMatchCandidate, normalizeMatchName } from "@/utils/importMatchEvidence";

const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

// Saved match IDs are routing hints, never authorization to update a person.
// Read the exact target again after claiming the row and before the first write.
export async function verifyImportTargetIdentity({ request, user, row }) {
  const preview = row.preview || {};
  const saved = normalizeImportMatchCandidate(preview.match);
  const targetId = text(row.matched_blackbaud_constituent_id || saved?.blackbaudConstituentId);
  const endpoint = targetId ? `/constituent/v1/constituents/${encodeURIComponent(targetId)}` : null;
  const started = Date.now();
  const hold = (code, httpStatus = null) => ({
    ok: false,
    message: "Live NXT identity could not be confirmed against the reviewed match. No changes were sent for this row in this attempt. Open the selected NXT record, then reject or reselect the match and review again. If this row has earlier writes, audit those before starting a corrected import.",
    diagnostic: { code, endpoint, httpStatus, durationMs: Date.now() - started, checkedAt: new Date().toISOString() },
  });
  if (!targetId || !saved || targetId !== saved.blackbaudConstituentId || preview.matchReview?.decision === "rejected") {
    return hold("missing_or_conflicting_saved_target");
  }

  let payload;
  try {
    payload = await blackbaudApiFetch(endpoint, {
      userId: user.id, authUserId: user.id, origin: new URL(request.url).origin,
      method: "GET", timeoutMs: 15000, maxRetries: 1,
    });
  } catch (error) {
    // Provider messages can contain donor data; store only allowlisted metadata.
    const status = Number(error?.httpStatus || error?.status);
    return hold("identity_read_failed", Number.isInteger(status) && status >= 100 && status <= 599 ? status : null);
  }
  if (!payload || Array.isArray(payload) || text(payload.id) !== targetId ||
      !(text(payload.name) || text(payload.first) && text(payload.last) || text(payload.org_name))) {
    return hold("malformed_identity_response", 200);
  }
  const live = normalizeImportMatchCandidate(payload);
  const savedLookup = text(row.matched_lookup_id || saved.lookupId);
  if ((saved.lookupId && savedLookup !== saved.lookupId) || (savedLookup && savedLookup !== live.lookupId)) {
    return hold("lookup_id_changed", 200);
  }
  const created = text(row.created_blackbaud_constituent_id) === targetId;
  const selected = preview.matchReview?.decision === "selected" && text(preview.matchReview.constituentId) === targetId;
  // A deliberate manual selection or audited creation may override CSV IDs,
  // but never a change to the identity the reviewer actually selected.
  if (!created && !selected) {
    const input = preview.input || {};
    if ((text(input.blackbaudConstituentId) && text(input.blackbaudConstituentId) !== targetId) ||
        (text(input.lookupId) && text(input.lookupId) !== live.lookupId)) return hold("source_identifier_conflict", 200);
    const evidence = importMatchEvidence(input, live);
    if (evidence.rank !== 100 || evidence.identityConflict) return hold("explicit_identity_review_required", 200);
  }
  // A prior successful name update on a failed row may legitimately differ
  // from the original preview. Require fresh review rather than guessing.
  if ((saved.firstName && normalizeMatchName(saved.firstName) !== normalizeMatchName(live.firstName)) ||
      (saved.lastName && normalizeMatchName(saved.lastName) !== normalizeMatchName(live.lastName)) ||
      (!saved.firstName && !saved.lastName && saved.name !== "Unnamed constituent" && normalizeMatchName(saved.name) !== normalizeMatchName(live.name))) {
    return hold("reviewed_name_changed", 200);
  }
  return { ok: true };
}
