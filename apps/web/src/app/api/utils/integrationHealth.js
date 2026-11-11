import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { activityOrigin, ACTIVITY_DAILY_CALLS } from "./portfolioActivityData";
import { activityEnrollmentConfig, resolveActivityEnrollment } from "./portfolioActivityEnrollment";
import { readPortfolioActivityCoverage } from "./portfolioActivityCoverage";
import { activityCapacity, readPortfolioRefreshCapacity } from "./portfolioRefreshCapacity";
import { activityCatchupEnabled } from "./portfolioActivityCatchup";
import { maintenanceContinuationEnabled, maintenanceOrigin, isPortfolioOvernight, MAINTENANCE_DAYTIME_CALLS, MAINTENANCE_NIGHT_CALLS, MAINTENANCE_BATCH_CALLS } from "./portfolioMaintenanceContinuation";

const LIMIT = 100;
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const name = value => String(value || "Unnamed workspace").slice(0, 200);
const status = (level, label, guidance) => ({ level, label, guidance });

export function connectionHealth(row, now = Date.now()) {
  if (!row.has_access) return status("notice", "No saved connection", "A connection is needed only for accounts used for NXT work. Have that account's owner connect in My Account & Connections.");
  if (row.has_refresh) return status("quiet", "Saved connection; renewal available", "An expired access token can renew automatically. This is saved configuration, not a live connection test; do not reconnect for throttling alone.");
  if (date(row.expires_at) && Date.parse(row.expires_at) <= now) return status("review", "Reconnect needed", "The saved access token has expired and no renewal token is stored. Have this account's owner reconnect in My Account & Connections.");
  return status("notice", "Saved connection; renewal unavailable", "A token is saved, but automatic renewal is unavailable. Have the owner check their connection before relying on scheduled work.");
}

export function portfolioJobFailureCounts(row) {
  // Item checkpoints and the job counter can briefly disagree. Missing recovery
  // evidence must not hide a failure; the stored job history is never rewritten.
  const failedItems = count(row.failed_item_count);
  const failed = Math.max(count(row.failed_count), failedItems);
  const recoveredFailed = Math.min(count(row.recovered_failed_count), failedItems);
  return { failed, recoveredFailed, unresolvedFailed: failed - recoveredFailed };
}

export function portfolioHealth(row, now = Date.now(), { maintenance, quota } = {}) {
  if (!row.has_mapping) return status("review", "Fundraiser mapping needed", "Check this MGO's system-ID mapping in Security & Access. Reconnecting will not fix a missing fundraiser mapping.");
  if (!row.has_portfolio) return status("notice", "No assignment snapshot", "Select this MGO in My Prospects and check the saved portfolio before choosing Sync NXT portfolio.");
  if (count(row.summary_failed) || portfolioJobFailureCounts(row).unresolvedFailed) return status("review", "Refresh needs investigation", "Open maintenance details below. Keep saved values; retry reads only after checking the cause.");
  const scheduled = maintenance?.available === true && maintenance.enabled === true && maintenance.initialized === true;
  const active = ["queued", "processing", "paused"].includes(row.job_status);
  const automaticJob = scheduled && row.job_mode === "nightly";
  const due = count(row.summary_current) < count(row.total) || count(row.giving_current) < count(row.total);
  const paused = (active && date(row.paused_until) && Date.parse(row.paused_until) > now) ||
    ((active || due) && quota?.available === true && quota.paused === true && date(quota.blockedUntil) && Date.parse(quota.blockedUntil) > now);
  const overnight = isPortfolioOvernight(new Date(now));
  const used = overnight ? maintenance?.nightCalls : maintenance?.dayCalls;
  const limit = overnight ? MAINTENANCE_NIGHT_CALLS : MAINTENANCE_DAYTIME_CALLS;
  // Unknown or expired-day counters cannot explain a quiet job. These counters
  // are read for today's Eastern date, from the configured origin only.
  const budgetWait = automaticJob && active && Number.isSafeInteger(used) && used >= limit;
  const waitGuidance = paused ? automaticJob
      ? "Automatic updates will continue when the saved pause and request allowance permit. No manual retry is needed."
      : "Wait until the saved pause ends before continuing the original workflow. Do not reconnect or repeatedly retry."
    : budgetWait ? "Automatic updates are waiting for the next background request allowance. No manual retry is needed." : null;
  if (count(row.delayed_count)) return status("delayed", "Some information is delayed",
    `Saved details remain available, but some checks are older than the normal update window. ${waitGuidance || "Check the saved maintenance details if the delay persists; this does not by itself mean a failure."}`);
  if (paused) return status("wait", "Updates temporarily paused", `Showing saved information. ${waitGuidance}`);
  if (budgetWait) return status("notice", "Scheduled update pending", `Showing saved information. ${waitGuidance}`);
  if (active) {
    if (!date(row.job_updated_at) || now - Date.parse(row.job_updated_at) > 15 * 60_000) {
      return status("delayed", "Update timing needs a check", "No progress has been saved in 15 minutes, and no current pause or exhausted background allowance explains the wait. Check maintenance details before retrying; this is not a confirmed failure.");
    }
    return status("notice", automaticJob ? "Updating automatically" : "Update in progress", "Showing saved information while updates continue. No additional refresh is needed. These are saved progress counts, not a live worker heartbeat.");
  }
  if (due) {
    return status("notice", scheduled ? "Scheduled update pending" : "Updates pending", scheduled
      ? "Showing saved information. Automatic updates run in scheduled batches; no action is needed for routine due checks."
      : "Showing saved information. Check maintenance setup in Admin before starting an update; an automatic schedule has not been confirmed here.");
  }
  return status("quiet", "Saved data current", "No refresh is needed according to the saved freshness rules. This is not a live NXT check.");
}

async function connections(viewerId) {
  // This resolver only reads account metadata; it does not renew tokens.
  const scheduled = await getReportRefreshUser();
  const rows = await sql`
    SELECT u.id, u.name, COUNT(*) OVER()::int AS total_rows,
      NULLIF(BTRIM(bc.access_token), '') IS NOT NULL AS has_access,
      NULLIF(BTRIM(bc.refresh_token), '') IS NOT NULL AS has_refresh,
      bc.expires_at, bc.updated_at
    FROM users u LEFT JOIN blackbaud_connections bc ON bc.user_id = u.id
    WHERE u.active = TRUE AND (bc.user_id IS NOT NULL OR u.id = ${viewerId} OR u.id = ${scheduled?.id || null})
    ORDER BY (u.id = ${scheduled?.id || null}) DESC NULLS LAST, LOWER(u.name), u.id LIMIT 100
  `;
  return {
    total: count(rows[0]?.total_rows),
    scheduledOwner: scheduled ? { id: String(scheduled.id), name: name(scheduled.name) } : null,
    credentialsPresent: ["BLACKBAUD_CLIENT_ID", "BLACKBAUD_CLIENT_SECRET", "BLACKBAUD_SUBSCRIPTION_KEY"]
      .every(key => Boolean(process.env[key]?.trim())),
    items: rows.map(row => ({ id: String(row.id), name: name(row.name),
      isViewer: String(row.id) === String(viewerId), isScheduledOwner: String(row.id) === String(scheduled?.id),
      expiresAt: date(row.expires_at), updatedAt: date(row.updated_at), ...connectionHealth(row) })),
  };
}

async function portfolios(context) {
  // Only optional enrichment and narrative generation prove a summary-only
  // failure. Other nightly stages can fail during giving, so require both saved
  // checks after the failed attempt. Freshness/backlog is evaluated separately.
  const rows = await sql`
    WITH workspaces AS (
      SELECT id, name, blackbaud_constituent_id, blackbaud_portfolio_cache, blackbaud_portfolio_cached_at,
        COUNT(*) OVER()::int AS total_rows
      FROM users WHERE active = TRUE
        AND POSITION(',mgo,' IN ',' || REPLACE(LOWER(COALESCE(role, '')), ' ', '') || ',') > 0
      ORDER BY LOWER(name), id LIMIT 100
    )
    SELECT w.id, w.name, w.total_rows,
      NULLIF(BTRIM(w.blackbaud_constituent_id), '') IS NOT NULL AS has_mapping,
      (jsonb_typeof(w.blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
        AND jsonb_typeof(w.blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array') AS has_portfolio,
      w.blackbaud_portfolio_cached_at, totals.*,
      j.status AS job_status, j.mode AS job_mode, j.processed_count, j.total_count AS job_total,
      j.success_count, j.failed_count, j.paused_until, j.updated_at AS job_updated_at,
      failures.failed_item_count, failures.recovered_failed_count
    FROM workspaces w
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.data_complete AND s.summary_payload IS NOT NULL
          AND s.last_error_stage IS NULL AND s.stale_after > NOW())::int AS summary_current,
        COUNT(*) FILTER (WHERE g.payload IS NOT NULL AND g.stale_after > NOW())::int AS giving_current,
        COUNT(*) FILTER (WHERE s.last_error_stage IS NOT NULL)::int AS summary_failed,
        COUNT(*) FILTER (WHERE g.refreshed_at < NOW() - INTERVAL '48 hours'
          OR s.stale_after < NOW() - INTERVAL '24 hours')::int AS delayed_count,
        MAX(s.last_refreshed_at) AS last_summary_check, MAX(g.refreshed_at) AS last_giving_check
      FROM (
        SELECT DISTINCT person ->> 'constituentId' AS id FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(w.blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
            THEN w.blackbaud_portfolio_cache -> 'leadSolicitor' ELSE '[]'::jsonb END ||
          CASE WHEN jsonb_typeof(w.blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array'
            THEN w.blackbaud_portfolio_cache -> 'supportingSolicitor' ELSE '[]'::jsonb END
        ) person WHERE NULLIF(person ->> 'constituentId', '') IS NOT NULL
      ) ids
      LEFT JOIN portfolio_constituent_snapshots s ON s.workspace_user_id = w.id AND s.constituent_id = ids.id
      LEFT JOIN portfolio_giving_snapshots g ON g.workspace_user_id = w.id AND g.constituent_id = ids.id
    ) totals
    LEFT JOIN LATERAL (
      SELECT id, mode, status, processed_count, total_count, success_count, failed_count, paused_until, updated_at
      FROM portfolio_refresh_jobs WHERE workspace_user_id = w.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) j ON TRUE
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS failed_item_count,
        COUNT(*) FILTER (WHERE s.data_complete AND jsonb_typeof(s.summary_payload) = 'object'
          AND s.last_error_stage IS NULL AND s.last_refreshed_at > i.completed_at
          AND (
            j.mode IN ('stale', 'full') OR i.stage IN ('optional_enrichment', 'summary_generation')
            OR (j.mode = 'nightly' AND g.refreshed_at > i.completed_at
              AND jsonb_typeof(g.payload #> '{mapped,lifetimeGiving}') = 'object'
              AND jsonb_typeof(g.payload -> 'currentFyGiving') = 'object')
          ))::int AS recovered_failed_count
      FROM portfolio_refresh_items i
      LEFT JOIN portfolio_constituent_snapshots s ON s.workspace_user_id = w.id AND s.constituent_id = i.constituent_id
      LEFT JOIN portfolio_giving_snapshots g ON g.workspace_user_id = w.id AND g.constituent_id = i.constituent_id
      WHERE i.job_id = j.id AND i.status = 'failed'
    ) failures ORDER BY LOWER(w.name), w.id
  `;
  return { total: count(rows[0]?.total_rows), items: rows.map(row => ({
    id: String(row.id), name: name(row.name), ...portfolioHealth(row, Date.now(), context),
    total: row.has_portfolio ? count(row.total) : null,
    summaryDue: row.has_portfolio ? Math.max(0, count(row.total) - count(row.summary_current)) : null,
    givingDue: row.has_portfolio ? Math.max(0, count(row.total) - count(row.giving_current)) : null,
    failed: row.has_portfolio ? count(row.summary_failed) : null,
    delayed: row.has_portfolio ? count(row.delayed_count) : null,
    assignmentsCheckedAt: date(row.blackbaud_portfolio_cached_at),
    lastSummaryCheck: date(row.last_summary_check), lastGivingCheck: date(row.last_giving_check),
    job: row.job_status ? { processed: count(row.processed_count), total: count(row.job_total),
      completed: count(row.success_count), ...portfolioJobFailureCounts(row),
      updatedAt: date(row.job_updated_at), pausedUntil: date(row.paused_until) } : null,
  })) };
}

async function activity(origin) {
  const config = activityEnrollmentConfig();
  const enabled = config.enabled && activityOrigin() === origin && process.env.VERCEL_ENV !== "preview";
  if (!enabled) return { enabled: false };
  const { workspaceIds: ids, mode } = await resolveActivityEnrollment(config);
  const coverage = await readPortfolioActivityCoverage(ids, origin);
  const [gate] = await sql`
    SELECT next_allowed_at, lease_until,
      CASE WHEN call_day = (NOW() AT TIME ZONE 'America/New_York')::date THEN call_count ELSE 0 END AS calls_today,
      CASE WHEN call_day = (NOW() AT TIME ZONE 'America/New_York')::date
        THEN (to_jsonb(portfolio_activity_refresh_gates)->>'catchup_call_count')::int ELSE 0 END AS catchup_calls_today
    FROM portfolio_activity_refresh_gates WHERE origin = ${origin}
  `;
  const catchupEnabled = activityCatchupEnabled();
  return { enabled: true, enrollmentMode: mode, ...coverage, capacity: activityCapacity(coverage.total, catchupEnabled),
    catchupEnabled, catchupCallsToday: gate?.catchup_calls_today == null ? null : count(gate.catchup_calls_today),
    nextAllowedAt: date(gate?.next_allowed_at), leaseUntil: date(gate?.lease_until),
    callsToday: count(gate?.calls_today), dailyBudget: ACTIVITY_DAILY_CALLS };
}

async function verifications() {
  const rows = await sql`
    SELECT r.pending_action_id, r.owner_user_id, u.name, u.active, r.state,
      r.blackbaud_action_id IS NOT NULL AS has_action_id, r.updated_at,
      p.status AS reminder_status, COUNT(*) OVER()::int AS total_rows
    FROM pending_action_nxt_receipts r JOIN users u ON u.id = r.owner_user_id
    JOIN pending_actions p ON p.id = r.pending_action_id AND p.owner_user_id = r.owner_user_id
    WHERE r.state IN ('review', 'processing') OR (r.state = 'saved' AND r.local_finalized_at IS NULL)
    ORDER BY r.updated_at, r.pending_action_id LIMIT 100
  `;
  return { total: count(rows[0]?.total_rows), items: rows.map(row => ({
    id: String(row.pending_action_id), ownerId: String(row.owner_user_id), ownerName: name(row.name),
    ownerActive: row.active === true, hasActionId: row.has_action_id === true,
    state: row.state === "processing" ? "processing" : "review", updatedAt: date(row.updated_at),
    href: `/follow-ups?tab=next-steps&nextStepId=${encodeURIComponent(row.pending_action_id)}&status=${row.reminder_status === "Done" ? "Done" : "Open"}`,
  })) };
}

export async function readIntegrationHealth({ viewerId, origin }) {
  const sections = {};
  const readers = {
    quota: async () => {
      const [row] = await sql`SELECT blocked_until, updated_at FROM blackbaud_api_limit_state WHERE state_key = 'subscription'`;
      return { blockedUntil: date(row?.blocked_until), updatedAt: date(row?.updated_at),
        paused: Boolean(date(row?.blocked_until) && Date.parse(row.blocked_until) > Date.now()) };
    },
    connections: () => connections(viewerId), capacity: readPortfolioRefreshCapacity,
    maintenance: async () => {
      if (!maintenanceContinuationEnabled() || origin !== maintenanceOrigin()) return { enabled: false };
      const [tables] = await sql`SELECT to_regclass('portfolio_maintenance_gate') IS NOT NULL AS has_gate,
        to_regclass('portfolio_maintenance_schedule') IS NOT NULL AS has_schedule`;
      const [gate] = tables?.has_gate ? await sql`SELECT
        CASE WHEN call_day = (NOW() AT TIME ZONE 'America/New_York')::date THEN call_count ELSE 0 END AS day_calls,
        CASE WHEN call_day = (NOW() AT TIME ZONE 'America/New_York')::date THEN (to_jsonb(portfolio_maintenance_gate)->>'night_call_count')::int ELSE 0 END AS night_calls,
        next_allowed_at, lease_until FROM portfolio_maintenance_gate WHERE id = 1 AND origin = ${origin}` : [];
      const turns = tables?.has_schedule ? await sql`SELECT u.id, u.name, s.last_served_at, s.next_attempt_at, s.last_result
        FROM portfolio_maintenance_schedule s JOIN users u ON u.id = s.workspace_user_id WHERE u.active = TRUE
        ORDER BY s.last_served_at ASC NULLS FIRST, u.id LIMIT 100` : [];
      return { enabled: true, initialized: Boolean(tables?.has_schedule), dayCalls: gate ? count(gate.day_calls) : null,
        nightCalls: gate?.night_calls == null ? null : count(gate.night_calls),
        dayLimit: MAINTENANCE_DAYTIME_CALLS, nightLimit: MAINTENANCE_NIGHT_CALLS, batchLimit: MAINTENANCE_BATCH_CALLS,
        nextAllowedAt: date(gate?.next_allowed_at), leaseUntil: date(gate?.lease_until),
        turns: turns.map(row => ({ id: String(row.id), name: name(row.name), lastServedAt: date(row.last_served_at),
          nextAttemptAt: date(row.next_attempt_at), result: String(row.last_result || "Waiting for first turn") })) };
    },
    portfolios: () => portfolios({ maintenance: sections.maintenance, quota: sections.quota }),
    activity: () => activity(origin), verifications,
  };
  // Partial failures stay unknown, never become empty/healthy sections. No schema,
  // job, token, or provider helpers with write side effects belong in this read.
  for (const [key, read] of Object.entries(readers)) {
    try { sections[key] = { available: true, ...await read() }; }
    catch { sections[key] = { available: false }; }
  }
  return { viewerId: String(viewerId), readAt: new Date().toISOString(), limit: LIMIT, sections };
}
