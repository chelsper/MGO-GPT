import sql from "./sql";

export async function saveImportVerification({ row, audit, complete }) {
  const saved = await sql`
    UPDATE constituency_import_rows
    SET blackbaud_result = ${JSON.stringify(audit)}::jsonb,
      status = CASE WHEN ${complete} THEN 'Applied' ELSE status END,
      blackbaud_error = CASE WHEN ${complete} THEN NULL ELSE blackbaud_error END,
      applied_at = CASE WHEN ${complete} THEN COALESCE(applied_at, NOW()) ELSE applied_at END,
      updated_at = NOW()
    WHERE id = ${row.id} AND run_id = ${row.run_id} AND status = ${row.status}
      AND status NOT IN ('Applying', 'Creating')
      AND preview IS NOT DISTINCT FROM ${row.preview == null ? null : JSON.stringify(row.preview)}::jsonb
      AND requested_writes IS NOT DISTINCT FROM ${row.requested_writes == null ? null : JSON.stringify(row.requested_writes)}::jsonb
      AND matched_blackbaud_constituent_id IS NOT DISTINCT FROM ${row.matched_blackbaud_constituent_id ?? null}
      AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
      AND applied_at IS NOT DISTINCT FROM ${row.applied_at ?? null}::timestamptz
    RETURNING id, status, applied_at
  `;
  if (!saved.length) {
    const error = new Error("This import row changed during verification. Reload it and check NXT again; no NXT changes were sent.");
    error.status = 409;
    throw error;
  }
  return saved[0];
}

export async function refreshVerifiedImportSummary(runId) {
  await sql`
    WITH counts AS (
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Ready')::int AS ready,
        COUNT(*) FILTER (WHERE status = 'Needs Review')::int AS needs_review,
        COUNT(*) FILTER (WHERE status = 'Conflict')::int AS conflict,
        COUNT(*) FILTER (WHERE status = 'Skipped')::int AS skipped,
        COUNT(*) FILTER (WHERE status = 'Applied')::int AS applied,
        COUNT(*) FILTER (WHERE status = 'Failed')::int AS failed,
        COUNT(*) FILTER (WHERE status NOT IN ('Applied', 'Skipped'))::int AS outstanding
      FROM constituency_import_rows WHERE run_id = ${runId}
    )
    UPDATE constituency_import_runs r
    SET status = CASE WHEN counts.outstanding > 0 THEN 'partially_applied' ELSE 'applied' END,
      ready_count = counts.ready, needs_review_count = counts.needs_review,
      conflict_count = counts.conflict, skipped_count = counts.skipped,
      applied_count = counts.applied, failed_count = counts.failed,
      applied_at = CASE WHEN counts.applied > 0 THEN COALESCE(r.applied_at, NOW()) ELSE r.applied_at END,
      summary = COALESCE(r.summary, '{}'::jsonb) || jsonb_build_object(
        'total', counts.total, 'ready', counts.ready, 'needsReview', counts.needs_review,
        'conflict', counts.conflict, 'skipped', counts.skipped, 'applied', counts.applied, 'failed', counts.failed),
      updated_at = NOW()
    FROM counts WHERE r.id = ${runId}
  `;
}
