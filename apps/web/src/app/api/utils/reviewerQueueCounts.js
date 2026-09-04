import sql from "@/app/api/utils/sql";

// Counts are independent of the limited previews in /api/worklist. This is a
// database-only read: opening the dashboard must not call NXT or run imports.
export default async function getReviewerQueueCounts() {
  const rows = await sql`
    SELECT
      (SELECT COUNT(*) FROM submissions
       WHERE LOWER(TRIM(COALESCE(blackbaud_sync_status, ''))) = 'failed'
          OR NULLIF(TRIM(blackbaud_sync_error), '') IS NOT NULL
          OR (status IN ('Pending', 'Ready for CRM')
              AND LOWER(TRIM(COALESCE(blackbaud_sync_status, ''))) NOT IN ('synced', 'success'))
      ) AS submissions,
      (SELECT COUNT(*) FROM data_change_requests
       WHERE status IN ('Open', 'In Progress')) AS data_requests,
      (SELECT COUNT(*) FROM list_requests
       WHERE COALESCE(TRIM(status), '') NOT IN ('Needs Clarification', 'Complete', 'Completed', 'Approved')) AS list_requests,
      (SELECT COUNT(*) FROM constituency_import_runs
       WHERE ready_count > 0 OR needs_review_count > 0 OR conflict_count > 0 OR failed_count > 0
      ) AS constituency_imports,
      (SELECT COUNT(*) FROM family_import_runs
       WHERE ready_count > 0 OR needs_review_count > 0 OR failed_count > 0
      ) AS family_imports,
      (SELECT COUNT(*) FROM prospect_pool
       WHERE needs_contact_info = TRUE
          OR (assigned_user_id IS NULL AND COALESCE(solicitor_assignment_sync_state, '') <> 'success')
          OR solicitor_assignment_sync_state = 'failed'
          OR mgogpt_disposition_sync_state = 'failed'
      ) AS prospect_pool,
      (SELECT COUNT(*) FROM discussion_items WHERE status = 'Open') AS discussions
  `;
  const row = rows[0];
  if (!row) throw new Error("Queue counts were not returned");
  const count = (key) => {
    const raw = row[key];
    const value = Number(raw);
    if (raw == null || typeof raw === "boolean" || String(raw).trim() === "" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error("Invalid queue count");
    }
    return value;
  };
  const counts = {
    submissions: count("submissions"),
    dataRequests: count("data_requests"),
    listRequests: count("list_requests"),
    constituencyImports: count("constituency_imports"),
    familyImports: count("family_imports"),
    prospectPool: count("prospect_pool"),
    discussions: count("discussions"),
  };
  // The submissions screen includes these four queues. Pool and family import
  // work have their own destinations; do not add them to this overview badge.
  return {
    ...counts,
    workQueue: counts.submissions + counts.dataRequests + counts.listRequests + counts.constituencyImports,
  };
}
