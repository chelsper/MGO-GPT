import { CLOSED_SUBMISSION_STATUSES, MANUAL_SUBMISSION_REQUEST_PATTERN } from "@/utils/submissionReview";

const literal = (value) => `'${value.replaceAll("'", "''")}'`;

// Database counterpart of getSubmissionQueueGroup. Only internal identifiers
// are accepted; request values must still be passed as SQL parameters.
export function submissionQueueGroupSql(alias = "s") {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw new Error("Invalid submission SQL alias");
  const sync = `LOWER(TRIM(COALESCE(${alias}.blackbaud_sync_status, '')))`;
  const status = `TRIM(COALESCE(${alias}.status, ''))`;
  const type = `LOWER(TRIM(COALESCE(${alias}.submission_type, '')))`;
  const routine = `(${type} = 'opportunity_update' OR (${type} = 'donor_update' AND COALESCE(${alias}.interaction_type, '') !~* ${literal(MANUAL_SUBMISSION_REQUEST_PATTERN)}))`;
  return `(CASE
    WHEN ${sync} = 'failed' OR NULLIF(TRIM(${alias}.blackbaud_sync_error), '') IS NOT NULL THEN 'active'
    WHEN ${sync} IN ('synced', 'success') THEN 'history'
    WHEN ${routine} AND ${status} <> 'Needs Clarification' AND ${sync} IN ('', 'not_requested') THEN 'history'
    WHEN ${status} = 'Needs Clarification' THEN 'waiting'
    WHEN ${routine} THEN 'active'
    WHEN ${status} IN (${CLOSED_SUBMISSION_STATUSES.map(literal).join(", ")}) THEN 'history'
    ELSE 'active'
  END)`;
}
