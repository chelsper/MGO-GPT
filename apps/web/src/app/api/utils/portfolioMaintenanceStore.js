import { randomUUID } from "node:crypto";
import sql from "./sql";
import { MAINTENANCE_DAYTIME_CALLS, MAINTENANCE_BATCH_CALLS, MAINTENANCE_LEASE_SECONDS } from "./portfolioMaintenanceContinuation";

export async function ensureMaintenanceGate() {
  await sql`
    DO $maintenance_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 31);
      CREATE TABLE IF NOT EXISTS portfolio_maintenance_gate (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        origin TEXT NOT NULL,
        job_id BIGINT,
        lease_token TEXT,
        lease_until TIMESTAMPTZ,
        work_until TIMESTAMPTZ,
        next_allowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        call_day DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/New_York')::date,
        call_count INTEGER NOT NULL DEFAULT 0,
        batch_calls INTEGER NOT NULL DEFAULT 0
      );
    END;
    $maintenance_schema$
  `;
}

export async function claimMaintenanceGate(origin, jobId) {
  await ensureMaintenanceGate();
  const token = randomUUID();
  const rows = await sql`
    INSERT INTO portfolio_maintenance_gate (id, origin, job_id, lease_token, lease_until, work_until)
    SELECT 1, ${origin}, ${jobId}, ${token}, NOW() + (${MAINTENANCE_LEASE_SECONDS} * INTERVAL '1 second'), NOW() + INTERVAL '160 seconds'
    WHERE EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York') NOT IN (1,2,3,4,5,6)
      AND NOT EXISTS (SELECT 1 FROM blackbaud_api_limit_state WHERE state_key = 'subscription' AND blocked_until > NOW())
      AND EXISTS (SELECT 1 FROM portfolio_refresh_jobs j JOIN users u ON u.id = j.workspace_user_id
        WHERE j.id = ${jobId} AND u.active = TRUE AND j.mode = 'nightly' AND NOT j.cancel_requested
          AND j.status IN ('queued', 'processing', 'paused')
          AND (j.paused_until IS NULL OR j.paused_until <= NOW()))
      AND NOT EXISTS (SELECT 1 FROM portfolio_refresh_items WHERE job_id = ${jobId}
        AND status = 'processing' AND updated_at > NOW() - INTERVAL '5 minutes')
    ON CONFLICT (id) DO UPDATE SET origin = EXCLUDED.origin, job_id = EXCLUDED.job_id,
      lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until, work_until = EXCLUDED.work_until, batch_calls = 0
    WHERE (portfolio_maintenance_gate.lease_until IS NULL OR portfolio_maintenance_gate.lease_until <= NOW())
      AND portfolio_maintenance_gate.next_allowed_at <= NOW()
      AND (portfolio_maintenance_gate.call_day <> (NOW() AT TIME ZONE 'America/New_York')::date
        OR portfolio_maintenance_gate.call_count < ${MAINTENANCE_DAYTIME_CALLS})
    RETURNING lease_token
  `;
  return rows.length ? { origin, jobId: String(jobId), token } : null;
}

export async function reserveMaintenanceCall({ origin, token, workspaceUserId, constituentId }) {
  const rows = await sql`
    UPDATE portfolio_maintenance_gate SET
      call_count = CASE WHEN call_day = (NOW() AT TIME ZONE 'America/New_York')::date THEN call_count + 1 ELSE 1 END,
      call_day = (NOW() AT TIME ZONE 'America/New_York')::date,
      batch_calls = batch_calls + 1
    WHERE id = 1 AND origin = ${origin} AND lease_token = ${token} AND lease_until > NOW() AND work_until > NOW()
      AND batch_calls < ${MAINTENANCE_BATCH_CALLS}
      AND (call_day <> (NOW() AT TIME ZONE 'America/New_York')::date OR call_count < ${MAINTENANCE_DAYTIME_CALLS})
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York') NOT IN (1,2,3,4,5,6)
      AND NOT EXISTS (SELECT 1 FROM blackbaud_api_limit_state WHERE state_key = 'subscription' AND blocked_until > NOW())
      AND EXISTS (SELECT 1 FROM portfolio_refresh_jobs j JOIN users u ON u.id = j.workspace_user_id
        JOIN portfolio_refresh_items i ON i.job_id = j.id
        WHERE j.id = portfolio_maintenance_gate.job_id AND j.workspace_user_id = ${workspaceUserId}
          AND u.active = TRUE AND j.mode = 'nightly' AND NOT j.cancel_requested
          AND j.status = 'processing' AND i.constituent_id = ${constituentId} AND i.status = 'processing')
    RETURNING call_count
  `;
  return rows.length > 0;
}

export async function releaseMaintenanceGate(gate) {
  await sql`
    UPDATE portfolio_maintenance_gate SET lease_token = NULL, lease_until = NULL,
      next_allowed_at = NOW() + INTERVAL '1 minute'
    WHERE id = 1 AND lease_token = ${gate.token} AND origin = ${gate.origin}
  `;
}
