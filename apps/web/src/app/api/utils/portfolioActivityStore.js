import { randomUUID } from "node:crypto";
import sql from "./sql";
import { prospectActivityCacheKey } from "./prospectActivityCacheKey";
import { ACTIVITY_DAILY_CALLS, activityOrigin } from "./portfolioActivityData";
import { resolveActivityEnrollment } from "./portfolioActivityEnrollment";
import { portfolioActivityDetailsEnvelope } from "@/utils/portfolioActivity";
import { ACTIVITY_QUEUE_LIMIT, activityNextCheckAt, selectActivityRows } from "./portfolioActivitySchedule";
import { ACTIVITY_CATCHUP_DAILY_CALLS, ACTIVITY_CATCHUP_START_HOUR, ACTIVITY_CATCHUP_END_HOUR } from "./portfolioActivityCatchup";

export async function claimActivityGate(origin) {
  const token = randomUUID();
  const rows = await sql`
    INSERT INTO portfolio_activity_refresh_gates (origin, lease_token, lease_until)
    SELECT ${origin}, ${token}, NOW() + INTERVAL '150 seconds'
    WHERE NOT EXISTS (SELECT 1 FROM blackbaud_api_limit_state
      WHERE state_key = 'subscription' AND blocked_until > NOW())
    ON CONFLICT (origin) DO UPDATE SET lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until
    WHERE (portfolio_activity_refresh_gates.lease_until IS NULL OR portfolio_activity_refresh_gates.lease_until <= NOW())
      AND portfolio_activity_refresh_gates.next_allowed_at <= NOW()
    RETURNING lease_token
  `;
  return rows.length ? { origin, token } : null;
}

export async function reserveActivityCall(gate) {
  const catchup = gate.catchup === true;
  const rows = await sql`
    UPDATE portfolio_activity_refresh_gates SET
      call_count = CASE WHEN call_day = (NOW() AT TIME ZONE 'America/New_York')::date THEN call_count + 1 ELSE 1 END,
      catchup_call_count = CASE WHEN call_day = (NOW() AT TIME ZONE 'America/New_York')::date
        THEN catchup_call_count + ${catchup ? 1 : 0} ELSE ${catchup ? 1 : 0} END,
      call_day = (NOW() AT TIME ZONE 'America/New_York')::date
    WHERE origin = ${gate.origin} AND lease_token = ${gate.token} AND lease_until > NOW()
      AND (call_day <> (NOW() AT TIME ZONE 'America/New_York')::date OR call_count < ${ACTIVITY_DAILY_CALLS})
      AND NOT EXISTS (SELECT 1 FROM blackbaud_api_limit_state
        WHERE state_key = 'subscription' AND blocked_until > NOW())
      AND (NOT ${catchup}::boolean OR (
        EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York') >= ${ACTIVITY_CATCHUP_START_HOUR}
        AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York') < ${ACTIVITY_CATCHUP_END_HOUR}
        AND (call_day <> (NOW() AT TIME ZONE 'America/New_York')::date OR catchup_call_count < ${ACTIVITY_CATCHUP_DAILY_CALLS})
      ))
    RETURNING call_count
  `;
  return rows.length > 0;
}

export async function releaseActivityGate(gate, delayMs = 1000) {
  await sql`
    UPDATE portfolio_activity_refresh_gates SET lease_token = NULL, lease_until = NULL,
      next_allowed_at = NOW() + (${delayMs} * INTERVAL '1 millisecond')
    WHERE origin = ${gate.origin} AND lease_token = ${gate.token}
  `;
}

export async function seedActivityQueue(workspaceIds, origin) {
  await sql`
    INSERT INTO portfolio_activity_snapshots (workspace_user_id, origin, constituent_id, kind)
    SELECT DISTINCT u.id, ${origin}, person ->> 'constituentId', kind
    FROM users u CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
        THEN u.blackbaud_portfolio_cache -> 'leadSolicitor' ELSE '[]'::jsonb END ||
      CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array'
        THEN u.blackbaud_portfolio_cache -> 'supportingSolicitor' ELSE '[]'::jsonb END
    ) person CROSS JOIN (VALUES ('gift'), ('action')) AS kinds(kind)
    WHERE u.id = ANY(${workspaceIds}::bigint[]) AND u.active = TRUE
      AND person ->> 'constituentId' ~ '^[0-9]+$'
    ON CONFLICT (workspace_user_id, origin, constituent_id, kind) DO NOTHING
  `;
}

export async function dueActivityRows(workspaceIds, origin) {
  const candidates = await sql`
    WITH eligible AS (
      SELECT s.*, CASE WHEN s.last_error IS NOT NULL THEN 'retry'
        WHEN s.checked_at IS NULL OR s.requested_at > s.checked_at OR jsonb_typeof(s.scan) = 'object'
          THEN 'priority' ELSE 'routine' END AS queue_lane
      FROM portfolio_activity_snapshots s JOIN users u ON u.id = s.workspace_user_id
      WHERE s.workspace_user_id = ANY(${workspaceIds}::bigint[]) AND s.origin = ${origin}
        AND u.active = TRUE AND s.next_check_at <= NOW()
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
              THEN u.blackbaud_portfolio_cache -> 'leadSolicitor' ELSE '[]'::jsonb END ||
            CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array'
              THEN u.blackbaud_portfolio_cache -> 'supportingSolicitor' ELSE '[]'::jsonb END
          ) person WHERE person ->> 'constituentId' = s.constituent_id
        )
    ), workspace_service AS (
      SELECT workspace_user_id, MAX(last_attempt_at) AS last_served
      FROM portfolio_activity_snapshots
      WHERE origin = ${origin} AND workspace_user_id = ANY(${workspaceIds}::bigint[])
      GROUP BY workspace_user_id
    ), workspace_rounds AS (
      SELECT e.*, w.last_served, ROW_NUMBER() OVER (
        PARTITION BY e.queue_lane, e.workspace_user_id
        ORDER BY CASE WHEN jsonb_typeof(e.scan) = 'object' THEN 0
          WHEN e.requested_at > e.checked_at THEN 1 ELSE 2 END,
          e.next_check_at, e.constituent_id, e.kind
      ) AS workspace_round
      FROM eligible e JOIN workspace_service w ON w.workspace_user_id = e.workspace_user_id
    ), lanes AS (
      SELECT r.*, ROW_NUMBER() OVER (
        PARTITION BY queue_lane ORDER BY workspace_round, last_served NULLS FIRST,
          next_check_at, workspace_user_id, constituent_id, kind
      ) AS lane_rank FROM workspace_rounds r
    )
    SELECT * FROM lanes WHERE lane_rank <= ${ACTIVITY_QUEUE_LIMIT}
    ORDER BY lane_rank, queue_lane
  `;
  return selectActivityRows(candidates);
}

export async function readActivitySeed(row, authUserId) {
  const [saved] = await sql`
    SELECT payload FROM blackbaud_constituent_summary_cache
    WHERE workspace_user_id = ${row.workspace_user_id} AND auth_user_id = ${authUserId}
      AND constituent_id = ${row.constituent_id}
      AND cache_key = ${prospectActivityCacheKey(row.origin, row.constituent_id, row.kind)}
    LIMIT 1
  `;
  return saved?.payload;
}

export async function markActivitySeeded(row) {
  await sql`UPDATE portfolio_activity_snapshots SET seed_complete = TRUE
    WHERE workspace_user_id = ${row.workspace_user_id} AND origin = ${row.origin}
      AND constituent_id = ${row.constituent_id} AND kind = ${row.kind}`;
}

export async function saveActivityResult(row, entry, authUserId, gate) {
  const rows = await sql`
    UPDATE portfolio_activity_snapshots SET record_id = ${entry.id}, activity_date = ${entry.date},
      activity_details = ${JSON.stringify(portfolioActivityDetailsEnvelope(entry, row.kind))}::jsonb,
      checked_at = ${entry.checkedAt}::timestamptz, checked_by = ${authUserId}, seed_complete = TRUE,
      last_attempt_at = NOW(),
      next_check_at = CASE WHEN requested_at > ${entry.checkedAt}::timestamptz
        THEN NOW() ELSE ${activityNextCheckAt(row, entry.checkedAt)}::timestamptz END,
      scan = NULL, last_error = NULL
    WHERE workspace_user_id = ${row.workspace_user_id} AND origin = ${row.origin}
      AND constituent_id = ${row.constituent_id} AND kind = ${row.kind}
      AND (checked_at IS NULL OR checked_at <= ${entry.checkedAt}::timestamptz)
      AND EXISTS (SELECT 1 FROM portfolio_activity_refresh_gates
        WHERE origin = ${gate.origin} AND lease_token = ${gate.token} AND lease_until > NOW())
    RETURNING checked_at
  `;
  return rows.length > 0;
}

export async function deferActivityRow(row, { scan = null, error = null, delayMs = 1000 }, gate) {
  await sql`
    UPDATE portfolio_activity_snapshots SET scan = ${JSON.stringify(scan)}::jsonb,
      last_error = ${error}, last_attempt_at = NOW(), next_check_at = NOW() + (${delayMs} * INTERVAL '1 millisecond')
    WHERE workspace_user_id = ${row.workspace_user_id} AND origin = ${row.origin}
      AND constituent_id = ${row.constituent_id} AND kind = ${row.kind}
      AND EXISTS (SELECT 1 FROM portfolio_activity_refresh_gates
        WHERE origin = ${gate.origin} AND lease_token = ${gate.token} AND lease_until > NOW())
  `;
}

// A confirmed NXT write is a refresh hint, not proof of the latest action.
export async function requestPortfolioActionRefresh({ origin, constituentId }) {
  if (process.env.VERCEL_ENV === "preview" || origin !== activityOrigin() || !/^\d+$/.test(String(constituentId))) return;
  const { workspaceIds } = await resolveActivityEnrollment();
  if (!workspaceIds.length) return;
  await sql`
    UPDATE portfolio_activity_snapshots SET next_check_at = NOW(), requested_at = NOW()
    WHERE origin = ${origin} AND constituent_id = ${String(constituentId)} AND kind = 'action'
      AND workspace_user_id = ANY(${workspaceIds}::bigint[])
  `;
}
