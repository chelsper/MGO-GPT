import sql from "./sql";
import { listError } from "./listConfigurations";
import { validActionDate } from "@/utils/actionEntryOptions";

// Aggregate assignments and authored actions separately to avoid multiplying counts.
// Persisted access is checked in the same statement, including for managers.
export async function readOutreachPriorities(
  { userId, origin, today },
  db = sql,
) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !validActionDate(today))
    throw listError("Reload your saved outreach priorities.", 400);
  const rows = await db(
    `WITH allowed AS (
    SELECT r.report_key FROM report_configurations r JOIN users u ON u.id=$1::bigint
    WHERE u.active=TRUE AND r.active=TRUE AND r.configuration_kind='constituent_list'
      AND r.visibility='specific_users' AND r.specific_user_ids @> jsonb_build_array(u.id)
      AND r.data_configuration->>'section'='project-prospecting'
      AND regexp_split_to_array(lower(trim(u.role)), '\\s*,\\s*')
        && ARRAY['mgo','admin','advancement_services','reviewer','advancement_admin']
  ), assignments AS (
    SELECT t.project_key,
      count(*) FILTER (WHERE t.stage<>'complete') AS open,
      count(*) FILTER (WHERE t.stage<>'complete' AND t.due_date<$3::date) AS overdue,
      count(*) FILTER (WHERE t.stage<>'complete' AND t.due_date=$3::date) AS today,
      count(*) FILTER (WHERE t.stage<>'complete' AND t.due_date>$3::date) AS upcoming
    FROM project_outreach_tasks t JOIN allowed a ON a.report_key=t.project_key
    WHERE t.origin=$2 AND t.assignee_id=$1::bigint GROUP BY t.project_key
  ), actions AS (
    SELECT t.project_key,
      count(*) FILTER (WHERE e.state='draft') AS drafts,
      count(*) FILTER (WHERE e.state IN ('processing','review')) AS verification
    FROM project_outreach_events e JOIN project_outreach_tasks t ON t.id=e.task_id
    JOIN allowed a ON a.report_key=t.project_key
    WHERE t.origin=$2 AND e.actor_id=$1::bigint GROUP BY t.project_key
  ) SELECT a.report_key AS key,
    COALESCE(t.open,0) AS open, COALESCE(t.overdue,0) AS overdue,
    COALESCE(t.today,0) AS today, COALESCE(t.upcoming,0) AS upcoming,
    COALESCE(e.drafts,0) AS drafts, COALESCE(e.verification,0) AS verification
    FROM allowed a LEFT JOIN assignments t ON t.project_key=a.report_key
    LEFT JOIN actions e ON e.project_key=a.report_key ORDER BY a.report_key LIMIT 1001`,
    [userId, origin, today],
  );
  if (rows.length > 1000)
    throw listError(
      "Too many projects for this overview. Open an individual project instead.",
      422,
    );
  return rows.map(({ key, ...counts }) => ({
    key,
    ...Object.fromEntries(
      Object.entries(counts).map(([name, value]) => [name, Number(value)]),
    ),
  }));
}
