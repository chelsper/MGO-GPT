import { randomUUID } from "node:crypto";
import sql from "./sql";

export async function ensurePortfolioSchedule() {
  await sql`
    DO $schedule_schema$ BEGIN
    PERFORM pg_advisory_xact_lock(734019, 32);
    CREATE TABLE IF NOT EXISTS portfolio_maintenance_schedule (
      workspace_user_id BIGINT PRIMARY KEY,
      last_served_at TIMESTAMPTZ,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_token TEXT,
      lease_until TIMESTAMPTZ,
      last_result TEXT
    );
    END; $schedule_schema$
  `;
  await sql`
    INSERT INTO portfolio_maintenance_schedule (workspace_user_id, last_served_at)
    SELECT u.id, (SELECT MAX(updated_at) FROM portfolio_refresh_jobs WHERE workspace_user_id = u.id)
    FROM users u WHERE u.active = TRUE
      AND POSITION(',mgo,' IN ',' || REPLACE(LOWER(COALESCE(u.role, '')), ' ', '') || ',') > 0
      AND NULLIF(BTRIM(u.blackbaud_constituent_id), '') IS NOT NULL
    ON CONFLICT (workspace_user_id) DO NOTHING
  `;
}

export async function claimPortfolioTurn(daytime = false) {
  await ensurePortfolioSchedule();
  const token = randomUUID();
  const rows = await sql`
    WITH eligible AS (
      SELECT u.id, s.last_served_at, j.id AS job_id, j.status AS job_status, j.updated_at AS job_updated_at,
        j.paused_until, u.blackbaud_portfolio_cached_at,
        COALESCE(u.blackbaud_portfolio_cached_at <= NOW() - INTERVAL '20 hours', TRUE)
          OR u.blackbaud_portfolio_cache IS NULL AS assignments_due,
        COALESCE(f.due_count, 0) AS due_count, COALESCE(f.missing_count, 0) AS missing_count, f.oldest_due
      FROM portfolio_maintenance_schedule s JOIN users u ON u.id = s.workspace_user_id
      LEFT JOIN LATERAL (
        SELECT id, status, mode, paused_until, updated_at FROM portfolio_refresh_jobs
        WHERE workspace_user_id = u.id AND status IN ('queued','processing','paused') AND NOT cancel_requested
        ORDER BY created_at ASC, id ASC LIMIT 1
      ) j ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE NOT COALESCE(p.data_complete AND p.summary_payload IS NOT NULL
            AND p.last_error_stage IS NULL AND p.stale_after > NOW(), FALSE)
          OR NOT COALESCE(g.payload IS NOT NULL AND g.stale_after > NOW(), FALSE)) AS due_count,
          COUNT(*) FILTER (WHERE p.summary_payload IS NULL OR g.payload IS NULL) AS missing_count,
          MIN(LEAST(p.stale_after, g.stale_after)) AS oldest_due
        FROM (SELECT DISTINCT card->>'constituentId' AS id FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache->'leadSolicitor') = 'array'
            THEN u.blackbaud_portfolio_cache->'leadSolicitor' ELSE '[]'::jsonb END ||
          CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache->'supportingSolicitor') = 'array'
            THEN u.blackbaud_portfolio_cache->'supportingSolicitor' ELSE '[]'::jsonb END
        ) card WHERE NULLIF(card->>'constituentId', '') IS NOT NULL) ids
        LEFT JOIN portfolio_constituent_snapshots p ON p.workspace_user_id = u.id AND p.constituent_id = ids.id
        LEFT JOIN portfolio_giving_snapshots g ON g.workspace_user_id = u.id AND g.constituent_id = ids.id
      ) f ON TRUE
      WHERE u.active = TRUE
        AND POSITION(',mgo,' IN ',' || REPLACE(LOWER(COALESCE(u.role, '')), ' ', '') || ',') > 0
        AND NULLIF(BTRIM(u.blackbaud_constituent_id), '') IS NOT NULL
        AND s.next_attempt_at <= NOW() AND (s.lease_until IS NULL OR s.lease_until <= NOW())
        AND (j.paused_until IS NULL OR j.paused_until <= NOW())
        AND (j.id IS NULL OR j.mode = 'nightly')
        AND (j.status IS DISTINCT FROM 'processing' OR j.updated_at <= NOW() - INTERVAL '5 minutes')
        AND NOT EXISTS (SELECT 1 FROM portfolio_refresh_items i WHERE i.job_id = j.id
          AND i.status = 'processing' AND i.updated_at > NOW() - INTERVAL '5 minutes')
        AND (NOT ${daytime} OR j.mode = 'nightly')
        AND NOT EXISTS (SELECT 1 FROM blackbaud_api_limit_state WHERE state_key = 'subscription' AND blocked_until > NOW())
    ), candidate AS (
      SELECT e.* FROM eligible e JOIN portfolio_maintenance_schedule s ON s.workspace_user_id = e.id
      WHERE e.job_id IS NOT NULL OR (NOT ${daytime} AND (e.assignments_due OR (e.due_count > 0
        AND NOT EXISTS (SELECT 1 FROM portfolio_refresh_jobs attempted WHERE attempted.workspace_user_id = e.id
          AND attempted.mode = 'nightly' AND attempted.status IN ('completed','completed_with_failures','cancelled')
          AND attempted.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'America/New_York')
            + INTERVAL '1 hour') AT TIME ZONE 'America/New_York'))))
      ORDER BY e.last_served_at ASC NULLS FIRST, e.missing_count DESC, e.oldest_due ASC NULLS FIRST, e.id
      LIMIT 1 FOR UPDATE OF s SKIP LOCKED
    )
    UPDATE portfolio_maintenance_schedule s SET last_served_at = NOW(),
      next_attempt_at = NOW() + INTERVAL '10 minutes', lease_until = NOW() + INTERVAL '5 minutes',
      lease_token = ${token}, last_result = 'running'
    FROM candidate c WHERE s.workspace_user_id = c.id
    RETURNING s.workspace_user_id, c.job_id, c.job_status, c.job_updated_at, c.paused_until,
      c.assignments_due, c.blackbaud_portfolio_cached_at
  `;
  const row = rows[0];
  return row ? { workspaceUserId: row.workspace_user_id, turnToken: token,
    refreshAssignments: !daytime && !row.job_id && row.assignments_due,
    job: row.job_id ? { id: row.job_id, status: row.job_status, updated_at: row.job_updated_at, paused_until: row.paused_until } : null } : null;
}

export async function finishPortfolioTurn(target, result, retryAfterMs = 0) {
  if (!target?.turnToken) return;
  const delay = Math.min(86400000, Math.max(result === "failed" ? 3600000 : 600000, Number(retryAfterMs) || 0));
  await sql`
    UPDATE portfolio_maintenance_schedule SET lease_token = NULL, lease_until = NULL,
      next_attempt_at = NOW() + (${delay} * INTERVAL '1 millisecond'), last_result = ${result}
    WHERE workspace_user_id = ${target.workspaceUserId} AND lease_token = ${target.turnToken}
  `;
}
