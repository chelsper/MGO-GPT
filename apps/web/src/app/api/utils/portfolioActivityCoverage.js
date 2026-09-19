import sql from "./sql";

const LIMIT = 100;
const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export function activityCoverageStatus(item) {
  if (!item.hasAssignments) return { level: "notice", label: "Assignment sync needed" };
  if (!item.assigned) return { level: "notice", label: "No assigned constituents" };
  if (item.connectionErrors || item.otherErrors) return { level: "review", label: "Checks need attention" };
  if (item.throttled) return { level: "wait", label: "Waiting for retry" };
  if (item.waiting) return { level: "notice", label: "Initial checks pending" };
  if (item.due) return { level: "notice", label: "Rechecks queued" };
  return { level: "quiet", label: "Checks saved" };
}

// One aggregate read for the whole enrollment, not a query per portfolio/card.
// Explicitly verified empty results count as checked; missing queue rows do not.
export async function readPortfolioActivityCoverage(workspaceIds, origin) {
  const [row] = await sql`
    WITH enrolled_workspaces AS (
      SELECT id, name, blackbaud_portfolio_cache,
        (jsonb_typeof(blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
          AND jsonb_typeof(blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array') AS has_portfolio
      FROM users WHERE id = ANY(${workspaceIds}::bigint[]) AND active = TRUE
    ), assigned AS (
      SELECT DISTINCT u.id AS workspace_id, person ->> 'constituentId' AS constituent_id, kind
      FROM enrolled_workspaces u CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
          THEN u.blackbaud_portfolio_cache -> 'leadSolicitor' ELSE '[]'::jsonb END ||
        CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array'
          THEN u.blackbaud_portfolio_cache -> 'supportingSolicitor' ELSE '[]'::jsonb END
      ) person CROSS JOIN (VALUES ('gift'), ('action')) kinds(kind)
      WHERE person ->> 'constituentId' ~ '^[0-9]+$'
    ), record_checks AS (
      SELECT a.workspace_id, a.constituent_id,
        BOOL_AND(s.checked_at IS NOT NULL) AS both_checked,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.kind = 'gift' AND s.checked_at IS NOT NULL)::int AS gifts_checked,
        COUNT(*) FILTER (WHERE a.kind = 'action' AND s.checked_at IS NOT NULL)::int AS actions_checked,
        COUNT(*) FILTER (WHERE s.checked_at IS NULL)::int AS never_checked,
        COUNT(*) FILTER (WHERE s.next_check_at IS NULL OR s.next_check_at <= NOW())::int AS due,
        COUNT(*) FILTER (WHERE s.last_error = 'connection')::int AS connection_errors,
        COUNT(*) FILTER (WHERE s.last_error = 'throttled')::int AS throttled,
        COUNT(*) FILTER (WHERE s.last_error IS NOT NULL AND s.last_error NOT IN ('connection', 'throttled'))::int AS other_errors,
        MIN(s.checked_at) AS oldest_checked_at, MAX(s.checked_at) AS last_checked_at,
        MAX(s.last_attempt_at) AS last_attempt_at
      FROM assigned a LEFT JOIN portfolio_activity_snapshots s ON s.workspace_user_id = a.workspace_id
        AND s.constituent_id = a.constituent_id AND s.kind = a.kind AND s.origin = ${origin}
      GROUP BY a.workspace_id, a.constituent_id
    ), coverage AS (
      SELECT u.id::text AS id, u.name, u.has_portfolio,
        COUNT(r.constituent_id)::int AS assigned,
        COUNT(*) FILTER (WHERE r.both_checked)::int AS checked,
        COALESCE(SUM(r.total), 0)::int AS total,
        COALESCE(SUM(r.gifts_checked), 0)::int AS gifts_checked,
        COALESCE(SUM(r.actions_checked), 0)::int AS actions_checked,
        COALESCE(SUM(r.never_checked), 0)::int AS never_checked,
        COALESCE(SUM(r.due), 0)::int AS due,
        COALESCE(SUM(r.connection_errors), 0)::int AS connection_errors,
        COALESCE(SUM(r.throttled), 0)::int AS throttled,
        COALESCE(SUM(r.other_errors), 0)::int AS other_errors,
        MIN(r.oldest_checked_at) AS oldest_checked_at, MAX(r.last_checked_at) AS last_checked_at,
        MAX(r.last_attempt_at) AS last_attempt_at
      FROM enrolled_workspaces u LEFT JOIN record_checks r ON r.workspace_id = u.id
      GROUP BY u.id, u.name, u.has_portfolio
    )
    SELECT COUNT(*)::int AS workspace_count,
      COUNT(*) FILTER (WHERE has_portfolio IS NOT TRUE)::int AS awaiting_assignments,
      COALESCE(SUM(total), 0)::int AS total, COALESCE(SUM(never_checked), 0)::int AS never_checked,
      COALESCE(SUM(due), 0)::int AS due, COALESCE(SUM(connection_errors), 0)::int AS connection_errors,
      COALESCE(SUM(throttled), 0)::int AS throttled, COALESCE(SUM(other_errors), 0)::int AS other_errors,
      MAX(last_checked_at) AS last_checked_at,
      (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY LOWER(c.name), c.id::bigint), '[]'::jsonb)
        FROM (SELECT * FROM coverage ORDER BY LOWER(name), id::bigint LIMIT ${LIMIT}) c) AS items
    FROM coverage
  `;
  if (!row || !Array.isArray(row.items)) throw new Error("Activity coverage unavailable");
  return {
    workspaceCount: count(row.workspace_count), awaitingAssignments: count(row.awaiting_assignments),
    total: count(row.total), neverChecked: count(row.never_checked), due: count(row.due),
    connectionErrors: count(row.connection_errors), throttled: count(row.throttled), otherErrors: count(row.other_errors),
    lastCheckedAt: date(row.last_checked_at),
    items: row.items.slice(0, LIMIT).map(saved => {
      const item = {
        id: String(saved.id), name: String(saved.name || "Unnamed workspace").slice(0, 200),
        hasAssignments: saved.has_portfolio === true,
        assigned: saved.has_portfolio === true ? count(saved.assigned) : null,
        checked: count(saved.checked), waiting: Math.max(0, count(saved.assigned) - count(saved.checked)),
        giftsChecked: count(saved.gifts_checked), actionsChecked: count(saved.actions_checked),
        due: count(saved.due), connectionErrors: count(saved.connection_errors),
        throttled: count(saved.throttled), otherErrors: count(saved.other_errors),
        lastCheckedAt: date(saved.last_checked_at), oldestCheckedAt: date(saved.oldest_checked_at),
        lastAttemptAt: date(saved.last_attempt_at),
      };
      return { ...item, ...activityCoverageStatus(item) };
    }),
  };
}
