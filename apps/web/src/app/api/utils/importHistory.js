export const IMPORT_HISTORY_PAGE_SIZE = 50;

// Only saved write outcomes belong in history. Preview/review status alone is
// not evidence of an attempted import; applied_at alone can mean partial writes.
export const constituencyOutcomeSql = `CASE
  WHEN r.status = 'Applied' THEN 'imported'
  WHEN r.status IN ('Applying', 'Creating') THEN NULL
  WHEN r.quick_create_status = 'uncertain' THEN 'unconfirmed'
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.blackbaud_result->'results') = 'array'
      THEN r.blackbaud_result->'results' ELSE '[]'::jsonb END) result
    WHERE result->>'status' IN ('unconfirmed', 'started')
  ) THEN 'unconfirmed'
  WHEN r.status = 'Failed' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.blackbaud_result->'results') = 'array'
      THEN r.blackbaud_result->'results' ELSE '[]'::jsonb END) result
    WHERE result->>'status' IN ('failed', 'manual_required', 'blocked')
  ) THEN CASE WHEN NULLIF(r.created_blackbaud_constituent_id, '') IS NOT NULL OR r.applied_at IS NOT NULL
    THEN 'partial' ELSE 'failed' END
  WHEN NULLIF(r.created_blackbaud_constituent_id, '') IS NOT NULL THEN 'created'
  WHEN NULLIF(r.blackbaud_error, '') IS NOT NULL AND r.blackbaud_result->>'createAttemptedAt' IS NOT NULL THEN 'unconfirmed'
  WHEN NULLIF(r.blackbaud_error, '') IS NOT NULL AND r.blackbaud_result->>'createFailedAt' IS NOT NULL THEN 'failed'
  ELSE NULL END`;

export const familyOutcomeSql = `CASE
  WHEN r.status = 'Applied' THEN 'imported'
  WHEN r.status = 'Failed' THEN CASE WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.application->'steps') = 'array'
      THEN r.application->'steps' ELSE '[]'::jsonb END) step
    WHERE step->>'status' = 'applied' AND (step->>'kind' LIKE 'parent_%'
      OR (step->>'kind' = 'relationship' AND COALESCE(step->>'existed', 'false') <> 'true'))
  ) THEN 'partial' ELSE 'failed' END
  ELSE NULL END`;

export const IMPORT_RESULT_COPY = {
  imported: { label: 'Imported', note: 'The saved import completed successfully.' },
  created: { label: 'Record created', note: 'The new NXT record was created. Any additional staged changes are not included in this result.' },
  partial: { label: 'Partially imported', note: 'Some changes were saved in NXT, but the import did not fully complete.' },
  failed: { label: 'Import failed', note: 'The saved import attempt did not complete successfully.' },
  unconfirmed: { label: 'Not confirmed', note: 'NXT did not confirm a write result. A record or change may already be saved; do not repeat an unconfirmed write.' },
};

export function parseImportHistoryFilters(url) {
  const params = new URL(url).searchParams;
  const outcome = params.get('outcome') || 'successful';
  const type = params.get('type') || 'all';
  const search = (params.get('q') || '').trim();
  const pageValue = params.get('page') || '1';
  const page = Number(pageValue);
  if (!['successful', 'failed'].includes(outcome) || !['all', 'constituency', 'family'].includes(type)
    || search.length > 160 || !/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
    throw new Error('Invalid history filters.');
  }
  return { outcome, type, search, page };
}

export const importHistoryQuery = `
  WITH outcomes AS (
    SELECT 'constituency' AS source, r.id::text AS id, r.run_id::text AS run_id, r.row_number,
      COALESCE(NULLIF(r.constituent_name, ''), 'Unnamed constituent') AS name,
      COALESCE(r.created_blackbaud_lookup_id, r.matched_lookup_id, '') AS lookup_id,
      b.source_filename, u.name AS submitted_by, r.updated_at,
      ${constituencyOutcomeSql} AS result_code
    FROM constituency_import_rows r
    JOIN constituency_import_runs b ON b.id = r.run_id
    LEFT JOIN users u ON u.id = b.created_by_user_id
    WHERE $1::text IN ('all', 'constituency')
    UNION ALL
    SELECT 'family', r.id::text, r.run_id::text, r.row_number,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', r.input#>>'{student,firstName}', r.input#>>'{student,lastName}')), ''), 'Unnamed student') || ' / family',
      COALESCE(r.input#>>'{student,lookupId}', ''), b.source_filename, u.name, r.updated_at,
      ${familyOutcomeSql}
    FROM family_import_rows r
    JOIN family_import_runs b ON b.id = r.run_id
    LEFT JOIN users u ON u.id = b.created_by_user_id
    WHERE $1::text IN ('all', 'family')
  ), filtered AS (
    SELECT *, CASE WHEN result_code IN ('imported', 'created') THEN 'successful' ELSE 'failed' END AS outcome
    FROM outcomes WHERE result_code IS NOT NULL
      AND ($2::text = '' OR POSITION(LOWER($2) IN LOWER(CONCAT_WS(' ', name, lookup_id, source_filename, run_id))) > 0)
  ), page AS (
    SELECT * FROM filtered WHERE outcome = $3
    ORDER BY updated_at DESC, source, id::bigint DESC LIMIT $4 OFFSET $5
  )
  SELECT (SELECT COUNT(*) FROM filtered WHERE outcome = 'successful') AS successful,
    (SELECT COUNT(*) FROM filtered WHERE outcome = 'failed') AS failed,
    COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY updated_at DESC, source, id::bigint DESC) FROM page), '[]'::jsonb) AS records
`;

export function serializeImportHistory(result, filters) {
  const counts = { successful: Number(result?.successful), failed: Number(result?.failed) };
  if (['successful', 'failed'].some((key) => result?.[key] == null || typeof result[key] === 'boolean' || String(result[key]).trim() === '')
    || Object.values(counts).some((n) => !Number.isSafeInteger(n) || n < 0) || !Array.isArray(result?.records)) {
    throw new Error('Invalid history result.');
  }
  return {
    counts, page: filters.page, pageSize: IMPORT_HISTORY_PAGE_SIZE,
    hasMore: filters.page * IMPORT_HISTORY_PAGE_SIZE < counts[filters.outcome],
    records: result.records.map((row) => {
      const copy = IMPORT_RESULT_COPY[row.result_code];
      if (!copy) throw new Error('Unknown import outcome.');
      // Explicit allowlist: never expose raw CSV values or provider error payloads.
      return { key: `${row.source}-${row.id}`, source: row.source, runId: row.run_id,
        rowNumber: row.row_number, name: row.name, lookupId: row.lookup_id,
        filename: row.source_filename || 'Untitled import', submittedBy: row.submitted_by || '',
        updatedAt: row.updated_at, result: row.result_code, ...copy };
    }),
  };
}
