import sql from "./sql";
import { ACTIVITY_BATCH_CALLS, ACTIVITY_DAILY_CALLS } from "./portfolioActivityData";
import { PORTFOLIO_BATCH_SIZE, PORTFOLIO_CRON_MINUTES, ACTIVITY_CRON_MINUTES, normalNightSlots } from "./portfolioMaintenancePolicy";

const count = value => {
  if (value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error("Invalid capacity count");
  return Number(value);
};
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export function activityCapacity(total) {
  const checks = count(total);
  const callsPerNight = Math.min(ACTIVITY_DAILY_CALLS, normalNightSlots(ACTIVITY_CRON_MINUTES) * ACTIVITY_BATCH_CALLS);
  return { callsPerNight, minimumSweepNights: Math.ceil(checks / callsPerNight),
    exceedsNight: checks > callsPerNight };
}

export function portfolioCapacity(row) {
  const slots = count(row.assignment_slots);
  const due = count(row.due_slots);
  const itemsPerNight = normalNightSlots(PORTFOLIO_CRON_MINUTES) * PORTFOLIO_BATCH_SIZE;
  return {
    workspaces: count(row.workspace_count), unknownWorkspaces: count(row.unknown_workspaces),
    assignmentsDue: count(row.assignments_due), slots, uniqueConstituents: count(row.unique_constituents),
    due, givingDue: count(row.giving_due), summaryDue: count(row.summary_due),
    neverChecked: count(row.never_checked), givingOver48Hours: count(row.giving_over_48_hours),
    givingChecked24Hours: count(row.giving_checked_24_hours), oldestGivingCheck: date(row.oldest_giving_check),
    itemsPerNight, minimumSweepNights: Math.ceil(slots / itemsPerNight),
    minimumBacklogNights: Math.ceil(due / itemsPerNight), exceedsNight: slots > itemsPerNight,
  };
}

export async function readPortfolioRefreshCapacity() {
  // Aggregate all active scheduler workspaces, not the health page's first 100.
  // Read snapshots only: no jobs, tokens, provider calls, or schema initialization.
  const [row] = await sql`
    WITH capacity_workspaces AS (
      SELECT id, blackbaud_portfolio_cache AS cache, blackbaud_portfolio_cached_at AS checked_at
      FROM users WHERE active = TRUE AND (blackbaud_portfolio_cache IS NOT NULL
        OR POSITION(',mgo,' IN ',' || REPLACE(LOWER(COALESCE(role, '')), ' ', '') || ',') > 0)
    ), membership AS (
      SELECT *, COALESCE(jsonb_typeof(cache->'leadSolicitor') = 'array'
        AND jsonb_typeof(cache->'supportingSolicitor') = 'array'
        AND (cache->'leadSolicitor' <> '[]'::jsonb OR cache->'supportingSolicitor' <> '[]'::jsonb
          OR cache->'portfolioMeta'->>'assignmentDataStatus' = 'live'), FALSE) AS known
      FROM capacity_workspaces
    ), ids AS (
      SELECT DISTINCT w.id AS workspace_user_id, person->>'constituentId' AS constituent_id
      FROM membership w CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN known THEN (cache->'leadSolicitor') || (cache->'supportingSolicitor') ELSE '[]'::jsonb END
      ) person WHERE NULLIF(person->>'constituentId', '') IS NOT NULL
    ), freshness AS (
      SELECT ids.*,
        COALESCE(s.data_complete AND s.summary_payload IS NOT NULL
          AND s.last_error_stage IS NULL AND s.stale_after > NOW(), FALSE) AS summary_current,
        COALESCE(g.payload IS NOT NULL AND g.stale_after > NOW(), FALSE) AS giving_current,
        g.refreshed_at AS giving_checked_at
      FROM ids LEFT JOIN portfolio_constituent_snapshots s
        ON s.workspace_user_id = ids.workspace_user_id AND s.constituent_id = ids.constituent_id
      LEFT JOIN portfolio_giving_snapshots g
        ON g.workspace_user_id = ids.workspace_user_id AND g.constituent_id = ids.constituent_id
    )
    SELECT (SELECT COUNT(*)::int FROM membership) AS workspace_count,
      (SELECT COUNT(*)::int FROM membership WHERE NOT known) AS unknown_workspaces,
      (SELECT COUNT(*)::int FROM membership WHERE checked_at IS NULL
        OR checked_at <= NOW() - INTERVAL '20 hours') AS assignments_due,
      COUNT(*)::int AS assignment_slots, COUNT(DISTINCT constituent_id)::int AS unique_constituents,
      COUNT(*) FILTER (WHERE NOT summary_current OR NOT giving_current)::int AS due_slots,
      COUNT(*) FILTER (WHERE NOT summary_current)::int AS summary_due,
      COUNT(*) FILTER (WHERE NOT giving_current)::int AS giving_due,
      COUNT(*) FILTER (WHERE giving_checked_at IS NULL)::int AS never_checked,
      COUNT(*) FILTER (WHERE giving_checked_at <= NOW() - INTERVAL '48 hours')::int AS giving_over_48_hours,
      COUNT(*) FILTER (WHERE giving_checked_at > NOW() - INTERVAL '24 hours'
        AND giving_checked_at <= NOW())::int AS giving_checked_24_hours,
      MIN(giving_checked_at) AS oldest_giving_check
    FROM freshness
  `;
  if (!row) throw new Error("Capacity data unavailable");
  return portfolioCapacity(row);
}
