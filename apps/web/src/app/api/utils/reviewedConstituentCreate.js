import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { checkClearNonmatch } from "./safeConstituentCreate";
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
  if (getReviewedNonmatchIds(row).length && String(body.reviewNote || "").trim().length < 10) return "Add a review note explaining why the suggested records are different people (at least 10 characters).";
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
