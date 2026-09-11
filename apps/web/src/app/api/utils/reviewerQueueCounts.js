import sql from "@/app/api/utils/sql";
import { submissionQueueGroupSql } from "./submissionReviewSql";

// Counts are independent of the limited previews in /api/worklist. This is a
// database-only read: opening the dashboard must not call NXT or run imports.
export default async function getReviewerQueueCounts() {
  const rows = await sql(`
    SELECT
      (SELECT COUNT(*) FROM submissions s
       WHERE ${submissionQueueGroupSql()} = 'active'
      ) AS submissions,
      (SELECT COUNT(*) FROM data_change_requests
       WHERE status IN ('Open', 'In Progress')) AS data_requests,
      (SELECT COUNT(*) FROM list_requests
       WHERE COALESCE(TRIM(status), '') NOT IN ('Needs Clarification', 'Complete', 'Completed', 'Approved')) AS list_requests,
      (SELECT COUNT(*) FROM prospect_pool
       WHERE needs_contact_info = TRUE
          OR (assigned_user_id IS NULL AND COALESCE(solicitor_assignment_sync_state, '') <> 'success')
          OR solicitor_assignment_sync_state = 'failed'
          OR mgogpt_disposition_sync_state = 'failed'
      ) AS prospect_pool,
      (SELECT COUNT(*) FROM discussion_items WHERE status = 'Open') AS discussions
  `);
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
    prospectPool: count("prospect_pool"),
    discussions: count("discussions"),
  };
  // Import outcomes are read-only history, not outstanding queue work.
  return {
    ...counts,
    workQueue: counts.submissions + counts.dataRequests + counts.listRequests,
  };
}
