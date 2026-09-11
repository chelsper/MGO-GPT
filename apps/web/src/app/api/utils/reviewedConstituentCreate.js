import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { checkClearNonmatch, findLocalImportDuplicate } from "./safeConstituentCreate";
import { duplicateEvidenceFingerprint, readLocalDuplicateIdentity } from "./importLocalDuplicateEvidence";
import { ImportReviewRequired } from "@/utils/newConstituentImport";
import { canReviewNewImportRecord, getImportMatchCandidates, getReviewedNonmatchIds } from "@/utils/importMatchReview";
import { IMPORT_MATCH_CRITERIA_VERSION } from "@/utils/importMatchEvidence";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function newRecordReviewFingerprint(row) {
  return createHash("sha256").update(JSON.stringify(stable({
    criteriaVersion: IMPORT_MATCH_CRITERIA_VERSION,
    input: row.preview.input,
    rejectedMatches: row.preview.rejectedMatches || [],
    reviewedLocalDuplicates: row.preview.reviewedLocalDuplicates || [],
    remaining: getImportMatchCandidates(row).map((entry) => entry.blackbaudConstituentId).sort(),
  }))).digest("hex");
}

export function reviewedCreationBlocker(row, body, now = Date.now()) {
  if (!canReviewNewImportRecord(row)) return "This row is matched, locked, or already attempted. Reopen it and verify its NXT record instead of creating another.";
  if (getImportMatchCandidates(row).length) return "Review the suggested matches first. Select the correct record or mark each unrelated suggestion Not a match.";
  const review = row.preview.newRecordReview;
  if (review?.status !== "clear" || !review.token || body.reviewToken !== review.token ||
      !Number.isFinite(Date.parse(review.checkedAt)) || now - Date.parse(review.checkedAt) > 30 * 60 * 1000 ||
      review.fingerprint !== newRecordReviewFingerprint(row)) return "Run fresh duplicate checks before confirming this new constituent. The earlier check expired or this row changed.";
  if (body.confirmed !== true) return "Explicitly confirm that this is a new constituent before creating it.";
  if ((getReviewedNonmatchIds(row).length || row.preview.reviewedLocalDuplicates?.length) && String(body.reviewNote || "").trim().length < 10) return "Add a review note explaining why the suggested records are different people (at least 10 characters).";
  if (String(body.reviewNote || "").length > 2000) return "Keep the review note under 2,000 characters.";
  return null;
}

export function duplicateReviewFailure(error) {
  const status = Number(error?.httpStatus || error?.status);
  if ([401, 403, 429].includes(status) || error?.retryAfterMs > 0 || /quota|not connected/i.test(error?.message || "")) {
    return { message: "NXT checks are paused by the connection or quota. No record was created. Check your connection, then retry when available.", nextAction: "retry", retryAfterMs: error.retryAfterMs || null };
  }
  if (error instanceof ImportReviewRequired) {
    const message = error.message;
    const correctInput = /Prepare a new preview|First and last name|valid US ZIP|address line is required|email address needs review|address needs an individual|name format no longer exists|either an NXT table format/i.test(message);
    return { message, nextAction: correctInput ? "correct_csv" : "retry" };
  }
  return { message: "NXT duplicate checks could not finish. Retry checks; a failed lookup is not a confirmed nonmatch.", nextAction: "retry" };
}

// Read-only in NXT. Only a saved, current review token can reach the separate create action.
export async function prepareNewRecordReview({ row, runId, user, origin }) {
  // Keep genuine/unknown saved candidates until reviewed. The shared filter
  // removes demonstrably unrelated legacy hits, not known duplicate evidence.
  let candidates = getImportMatchCandidates(row);
  let message;
  let nextAction;
  let retryAfterMs;
  let checked = false;
  let localDuplicate = null;
  try {
    message = await checkClearNonmatch({
      input: row.preview.input || {}, rowId: row.id, runId,
      credentials: { userId: user.id, authUserId: user.id, origin },
      reviewedCandidateIds: getReviewedNonmatchIds(row),
      reviewedLocalDuplicates: row.preview.reviewedLocalDuplicates || [],
      onCandidates: (found) => { candidates = [...candidates, ...found]; },
      onLocalDuplicate: (found) => { localDuplicate = found; },
    });
    checked = true;
    nextAction = message?.startsWith("Another import row") ? "review_batch" : "review_matches";
  } catch (error) {
    ({ message, nextAction, retryAfterMs } = duplicateReviewFailure(error));
  }
  const nextPreview = { ...row.preview,
    ...(checked ? { localDuplicate, localDuplicateCheckedAt: new Date().toISOString(), matchCandidates: candidates, matchCriteriaVersion: IMPORT_MATCH_CRITERIA_VERSION,
      matchSuggestionsCheckedAt: new Date().toISOString() } : {}) };
  const nextRow = { ...row, preview: nextPreview };
  if (!message && getImportMatchCandidates(nextRow).length) {
    message = "Review the remaining suggested matches. Select a match or mark each unrelated record Not a match, then run checks again.";
    nextAction = "review_matches";
  }
  const review = {
    status: message ? "blocked" : "clear",
    message: message || "Duplicate checks completed. No unreviewed match was found. Nothing has been created yet.",
    nextAction: message ? nextAction : "confirm_new",
    checkedAt: new Date().toISOString(), checkedByUserId: String(user.id),
    retryAfterMs: retryAfterMs || null,
    ...(message ? {} : { token: randomUUID(), fingerprint: newRecordReviewFingerprint(nextRow) }),
  };
  nextPreview.newRecordReview = review;
  const saved = await sql`
    UPDATE constituency_import_rows SET preview = ${JSON.stringify(nextPreview)}::jsonb,
      blackbaud_error = ${message || null}, updated_at = NOW()
    WHERE id = ${row.id} AND run_id = ${runId} AND status = ${row.status}
      AND applied_at IS NULL AND created_blackbaud_constituent_id IS NULL AND create_request_started_at IS NULL
      AND create_approved_at IS NOT DISTINCT FROM ${row.create_approved_at || null}::timestamptz
      AND matched_blackbaud_constituent_id IS NULL
      AND preview IS NOT DISTINCT FROM ${JSON.stringify(row.preview)}::jsonb
      AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
    RETURNING id
  `;
  if (!saved.length) return Response.json({ error: "This row changed while checking. Reload it and run checks again." }, { status: 409 });
  return Response.json({ review });
}

// This records a review decision only. The separate create path repeats every
// duplicate check under the creation lease before sending anything to NXT.
export async function reviewLocalImportDuplicate({ row, runId, user, origin, body, reject = false }) {
  if (!canReviewNewImportRecord(row)) return Response.json({ error: "This row is matched, locked, or already attempted. Reopen its review." }, { status: 409 });
  const preview = row.preview;
  const credentials = { userId: user.id, authUserId: user.id, origin };
  let duplicate;
  let current = null;
  try {
    await findLocalImportDuplicate({ input: preview.input || {}, rowId: row.id, runId, credentials,
      reviewedLocalDuplicates: preview.reviewedLocalDuplicates || [], onLocalDuplicate: (found) => { duplicate = found; } });
    if (!duplicate || !body.blockerFingerprint || body.blockerFingerprint !== duplicate.fingerprint) {
      return Response.json({ error: "The duplicate hold changed. Run duplicate checks again before reviewing it." }, { status: 409 });
    }
    if (duplicate.kind === "unconfirmed_creation") return Response.json({ error: "An earlier creation has an uncertain outcome. Verify it in NXT first; a review acknowledgment cannot safely authorize another creation." }, { status: 409 });
    if (duplicate.kind === "created") current = await readLocalDuplicateIdentity(duplicate, credentials);
  } catch (error) {
    return Response.json({ error: duplicateReviewFailure(error).message }, { status: 409 });
  }
  const liveIdentityFingerprint = current ? duplicateEvidenceFingerprint(current) : null;
  const checkedAt = new Date().toISOString();
  let nextPreview;
  if (!reject) {
    nextPreview = { ...preview, newRecordReview: null, localDuplicate: duplicate, localDuplicateCheckedAt: checkedAt,
      localDuplicateReview: { token: randomUUID(), checkedAt, duplicate, current, liveIdentityFingerprint } };
  } else {
    const review = preview.localDuplicateReview;
    if (!review?.token || body.reviewToken !== review.token || review.duplicate?.fingerprint !== duplicate.fingerprint ||
        !Number.isFinite(Date.parse(review.checkedAt)) || Date.now() - Date.parse(review.checkedAt) > 30 * 60 * 1000 ||
        review.liveIdentityFingerprint !== liveIdentityFingerprint) {
      return Response.json({ error: "This comparison expired or the record changed. Load the comparison again before confirming a different person." }, { status: 409 });
    }
    const note = String(body.reviewNote || "").trim();
    if (body.confirmed !== true || note.length < 10 || note.length > 2000) return Response.json({ error: "Confirm this is a different person and explain what you compared (10 to 2,000 characters)." }, { status: 400 });
    const decisions = preview.reviewedLocalDuplicates || [];
    if (decisions.length >= 200) return Response.json({ error: "This row has too many review decisions. Correct its source values before continuing." }, { status: 409 });
    const decision = { decision: "different_person", fingerprint: duplicate.fingerprint, liveIdentityFingerprint,
      rowId: duplicate.rowId, runId: duplicate.runId, name: duplicate.name, kind: duplicate.kind,
      createdConstituentId: duplicate.createdConstituentId, note, reviewedAt: checkedAt, reviewedByUserId: String(user.id) };
    nextPreview = { ...preview, reviewedLocalDuplicates: [...decisions, decision], newRecordReview: null,
      localDuplicateReview: null, localDuplicate: null, localDuplicateCheckedAt: checkedAt, matchSuggestionsNotice: "" };
    if (current) nextPreview.rejectedMatches = [...(preview.rejectedMatches || []), {
      decision: "rejected", constituentId: current.blackbaudConstituentId, name: current.name, lookupId: current.lookupId,
      reviewedAt: checkedAt, reviewedByUserId: String(user.id), note, localDuplicateFingerprint: duplicate.fingerprint,
    }];
  }
  const saved = await sql`
    UPDATE constituency_import_rows SET preview = ${JSON.stringify(nextPreview)}::jsonb,
      blackbaud_error = NULL, updated_at = NOW()
    WHERE id = ${row.id} AND run_id = ${runId} AND status = ${row.status}
      AND applied_at IS NULL AND created_blackbaud_constituent_id IS NULL AND create_request_started_at IS NULL
      AND create_approved_at IS NOT DISTINCT FROM ${row.create_approved_at || null}::timestamptz
      AND matched_blackbaud_constituent_id IS NULL
      AND preview IS NOT DISTINCT FROM ${JSON.stringify(preview)}::jsonb
      AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
    RETURNING id
  `;
  if (!saved.length) return Response.json({ error: "This row changed during review. Reload before continuing." }, { status: 409 });
  return Response.json({ message: reject ? "Different-person decision saved. Run remaining duplicate checks before confirming a new constituent. No NXT records changed." : "Comparison loaded. Review the details before marking a different person. No NXT records changed." });
}
