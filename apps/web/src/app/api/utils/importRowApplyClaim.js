import sql from "./sql";
import { isImportMatchRejected } from "@/utils/importMatchReview";

export async function claimImportRowForApply(row) {
  if (!["Ready", "Failed"].includes(row.status) || isImportMatchRejected(row)) return false;
  // A match decision and an NXT write must not race. Claim only the exact
  // reviewed row; match changes reject Applying rows and stale previews.
  const claimed = await sql`
    UPDATE constituency_import_rows SET status = 'Applying', updated_at = NOW()
    WHERE id = ${row.id} AND run_id = ${row.run_id} AND status = ${row.status}
      AND preview IS NOT DISTINCT FROM ${row.preview == null ? null : JSON.stringify(row.preview)}::jsonb
      AND requested_writes IS NOT DISTINCT FROM ${row.requested_writes == null ? null : JSON.stringify(row.requested_writes)}::jsonb
      AND matched_blackbaud_constituent_id IS NOT DISTINCT FROM ${row.matched_blackbaud_constituent_id ?? null}
      AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
      AND applied_at IS NOT DISTINCT FROM ${row.applied_at ?? null}::timestamptz
      AND preview->'matchReview'->>'decision' IS DISTINCT FROM 'rejected'
    RETURNING id
  `;
  return claimed.length > 0;
}
