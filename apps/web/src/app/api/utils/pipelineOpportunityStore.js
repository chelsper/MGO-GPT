import sql from "./sql";
import { pipelineError } from "./pipelineOpportunityValues";

export async function loadPipelineCopies(id) {
  return sql`
    WITH RECURSIVE linked AS (
      SELECT id, blackbaud_opportunity_id, shared_opportunity_key FROM prospect_opportunities WHERE id = ${id}::bigint
      UNION
      SELECT po.id, po.blackbaud_opportunity_id, po.shared_opportunity_key
      FROM prospect_opportunities po JOIN linked l ON
        (NULLIF(po.blackbaud_opportunity_id, '') = NULLIF(l.blackbaud_opportunity_id, '')) OR
        (NULLIF(po.shared_opportunity_key, '') = NULLIF(l.shared_opportunity_key, ''))
    )
    SELECT po.*, po.updated_at::text AS revision, po.nxt_checked_at::text AS checked_revision,
      p.user_id, COALESCE(NULLIF(BTRIM(p.blackbaud_constituent_id), ''), c.blackbaud_constituent_id) AS blackbaud_constituent_id
    FROM prospect_opportunities po JOIN linked l ON l.id = po.id
    JOIN prospects p ON p.id = po.prospect_id
    LEFT JOIN constituents c ON c.id = COALESCE(po.constituent_id, p.constituent_id)
    ORDER BY po.id LIMIT 101
  `;
}

export async function getPipelineReceipt(id) {
  const rows = await sql`SELECT * FROM opportunity_change_receipts WHERE id = ${id}::uuid`;
  return rows[0] || null;
}

export function copySnapshot(copies) {
  return copies.map(row => ({ id: String(row.id), revision: row.revision, checked_revision: row.checked_revision,
    user_id: String(row.user_id), constituent_id: row.blackbaud_constituent_id,
    nxt_id: row.blackbaud_opportunity_id ?? null, shared_key: row.shared_opportunity_key ?? null }));
}

export async function claimPipelineChange(receipt) {
  // Lock all copies in ID order and compare every revision before recording
  // intent. A crash from this point onward must use verification, not replay.
  const claimed = await sql`
    WITH expected AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(receipt.copies)}::jsonb)
      AS x(id bigint, revision text, checked_revision text, user_id text, constituent_id text, nxt_id text, shared_key text)),
    locked AS MATERIALIZED (SELECT po.*, p.user_id AS owner_id,
      COALESCE(NULLIF(BTRIM(p.blackbaud_constituent_id), ''), c.blackbaud_constituent_id) AS nxt_constituent_id
      FROM prospect_opportunities po JOIN expected e ON e.id = po.id JOIN prospects p ON p.id = po.prospect_id
      LEFT JOIN constituents c ON c.id = COALESCE(po.constituent_id, p.constituent_id) ORDER BY po.id FOR UPDATE OF po, p),
    eligible AS (SELECT l.id FROM locked l JOIN expected e ON e.id = l.id
      WHERE l.updated_at::text IS NOT DISTINCT FROM e.revision
        AND l.nxt_checked_at::text IS NOT DISTINCT FROM e.checked_revision AND l.pipeline_change_id IS NULL
        AND l.owner_id::text = e.user_id AND l.nxt_constituent_id = e.constituent_id
        AND l.blackbaud_opportunity_id IS NOT DISTINCT FROM e.nxt_id AND l.shared_opportunity_key IS NOT DISTINCT FROM e.shared_key),
    receipt AS (
      INSERT INTO opportunity_change_receipts(id, opportunity_id, nxt_id, constituent_id, actor_id, operation, patch, before_remote, copies)
      SELECT ${receipt.id}::uuid, ${receipt.opportunity_id}::bigint, ${receipt.nxt_id}, ${receipt.constituent_id}, ${receipt.actor_id}::bigint,
        ${receipt.operation}, ${JSON.stringify(receipt.patch)}::jsonb, ${JSON.stringify(receipt.before_remote)}::jsonb, ${JSON.stringify(receipt.copies)}::jsonb
      WHERE (SELECT COUNT(*) FROM eligible) = ${receipt.copies.length} AND ${receipt.copies.length} > 0
      ON CONFLICT DO NOTHING RETURNING id
    )
    UPDATE prospect_opportunities po SET pipeline_change_id = receipt.id FROM receipt, eligible
    WHERE po.id = eligible.id RETURNING po.id
  `;
  if (claimed.length !== receipt.copies.length) throw pipelineError("This opportunity changed or another save is in progress. Reload saved data before continuing.");
}

export async function rejectPipelineChange(id) {
  await sql`WITH rejected AS (UPDATE opportunity_change_receipts SET state = 'rejected', completed_at = NOW()
    WHERE id = ${id}::uuid AND state = 'pending' RETURNING id)
    UPDATE prospect_opportunities po SET pipeline_change_id = NULL FROM rejected WHERE po.pipeline_change_id = rejected.id`;
}

export async function completePipelineChange(receipt, next) {
  const completed = await sql`
    WITH expected AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(receipt.copies)}::jsonb)
      AS x(id bigint, revision text, checked_revision text, user_id text, constituent_id text, nxt_id text, shared_key text)),
    locked AS MATERIALIZED (SELECT po.*, p.user_id AS owner_id,
      COALESCE(NULLIF(BTRIM(p.blackbaud_constituent_id), ''), c.blackbaud_constituent_id) AS nxt_constituent_id
      FROM prospect_opportunities po JOIN expected e ON e.id = po.id JOIN prospects p ON p.id = po.prospect_id
      LEFT JOIN constituents c ON c.id = COALESCE(po.constituent_id, p.constituent_id) ORDER BY po.id FOR UPDATE OF po, p),
    eligible AS (SELECT l.id FROM locked l JOIN expected e ON e.id = l.id
      WHERE l.pipeline_change_id = ${receipt.id}::uuid AND l.updated_at::text IS NOT DISTINCT FROM e.revision
        AND l.nxt_checked_at::text IS NOT DISTINCT FROM e.checked_revision
        AND l.owner_id::text = e.user_id AND l.nxt_constituent_id = e.constituent_id
        AND l.blackbaud_opportunity_id IS NOT DISTINCT FROM e.nxt_id AND l.shared_opportunity_key IS NOT DISTINCT FROM e.shared_key),
    applied AS (
      UPDATE prospect_opportunities po SET title = ${next.title}, purpose = ${next.purpose}, current_stage = ${next.current_stage},
        opportunity_status = ${next.opportunity_status}, estimated_amount = ${next.estimated_amount}, ask_date = ${next.ask_date}::date,
        expected_date = ${next.expected_date}::date, closed_amount = ${next.closed_amount}, close_date = ${next.close_date}::date,
        blackbaud_opportunity_id = ${receipt.nxt_id}, nxt_checked_at = NOW(), nxt_retry_after = NULL, updated_at = NOW(), pipeline_change_id = NULL
      WHERE po.id IN (SELECT id FROM eligible) AND (SELECT COUNT(*) FROM eligible) = ${receipt.copies.length}
        AND EXISTS (SELECT 1 FROM opportunity_change_receipts WHERE id = ${receipt.id}::uuid AND state = 'pending')
      RETURNING po.*
    ),
    totals AS (
      SELECT po.prospect_id,
        COALESCE(SUM(CASE WHEN COALESCE(a.opportunity_status, po.opportunity_status) = 'Active' THEN CASE WHEN a.id IS NOT NULL THEN a.estimated_amount ELSE po.estimated_amount END ELSE 0 END), 0) AS amount,
        COUNT(*) FILTER (WHERE COALESCE(a.opportunity_status, po.opportunity_status) = 'Active') AS active_count,
        COUNT(*) FILTER (WHERE COALESCE(a.opportunity_status, po.opportunity_status) = 'Closed – Gift Secured') AS funded_count,
        COUNT(*) FILTER (WHERE COALESCE(a.opportunity_status, po.opportunity_status) = 'Closed – Declined') AS declined_count,
        COUNT(*) AS total_count,
        SUM(CASE WHEN COALESCE(a.opportunity_status, po.opportunity_status) = 'Closed – Gift Secured' THEN CASE WHEN a.id IS NOT NULL THEN a.closed_amount ELSE po.closed_amount END END) AS funded,
        MAX(CASE WHEN a.id IS NOT NULL THEN a.close_date ELSE po.close_date END) AS closed_on
      FROM prospect_opportunities po LEFT JOIN applied a ON a.id = po.id
      WHERE po.prospect_id IN (SELECT prospect_id FROM applied) GROUP BY po.prospect_id
    ),
    parents AS (UPDATE prospects p SET ask_amount = t.amount, closed_amount = t.funded,
      close_date = CASE WHEN t.active_count > 0 THEN NULL ELSE t.closed_on END,
      status = CASE WHEN p.status = 'Archived' THEN p.status
        WHEN t.active_count > 0 THEN 'Active'
        WHEN t.funded_count = t.total_count THEN 'Closed – Gift Secured'
        WHEN t.declined_count = t.total_count THEN 'Closed – Declined' ELSE p.status END
      FROM totals t WHERE p.id = t.prospect_id RETURNING p.id, p.user_id),
    caches AS (UPDATE users SET blackbaud_summary_cache = NULL, blackbaud_summary_cache_key = NULL, blackbaud_summary_cached_at = NULL
      WHERE id IN (SELECT user_id FROM parents) RETURNING id),
    snapshots AS (UPDATE portfolio_constituent_snapshots SET stale_after = NOW()
      WHERE constituent_id = ${receipt.constituent_id} AND workspace_user_id IN (SELECT user_id FROM parents) RETURNING id)
    UPDATE opportunity_change_receipts SET state = 'complete', completed_at = NOW()
    WHERE id = ${receipt.id}::uuid AND state = 'pending' AND (SELECT COUNT(*) FROM applied) = ${receipt.copies.length}
    RETURNING id
  `;
  if (!completed.length) throw pipelineError("NXT was checked, but an app copy changed during the save. The change is held for reconciliation; it will not be sent again.");
}
