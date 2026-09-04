import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportRefreshUser } from "@/app/api/utils/reportRefresh";
import sql from "@/app/api/utils/sql";

export const maxDuration = 300;

const PORTFOLIO_REFRESH_HOURS = new Set([1, 2, 3, 4, 5, 6]);

function getRefreshSecret() {
  return String(
    process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET || "",
  ).trim();
}

function isAuthorized(request) {
  const secret = getRefreshSecret();
  return Boolean(
    secret && String(request.headers.get("authorization") || "") === `Bearer ${secret}`,
  );
}

function getNewYorkHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

async function getRefreshTarget() {
  // Membership must not wait behind a multi-night enrichment backlog.
  const staleAssignments = await sql`
    SELECT id AS workspace_user_id, blackbaud_portfolio_cached_at
    FROM users
    WHERE active = TRUE AND blackbaud_portfolio_cache IS NOT NULL
      AND (blackbaud_portfolio_cached_at IS NULL
        OR blackbaud_portfolio_cached_at <= NOW() - INTERVAL '20 hours')
    ORDER BY blackbaud_portfolio_cached_at ASC NULLS FIRST, id ASC LIMIT 1
  `;
  if (staleAssignments[0]) return {
    workspaceUserId: staleAssignments[0].workspace_user_id, refreshAssignments: true, job: null,
  };
  const activeJobs = await sql`
    SELECT id, workspace_user_id, status, paused_until, updated_at
    FROM portfolio_refresh_jobs
    WHERE status IN ('queued', 'processing', 'paused')
    ORDER BY updated_at ASC, id ASC
    LIMIT 1
  `;
  if (activeJobs[0]) {
    return { job: activeJobs[0], workspaceUserId: activeJobs[0].workspace_user_id };
  }

  const staleWorkspaces = await sql`
    WITH portfolio_ids AS (
      SELECT DISTINCT
        u.id AS workspace_user_id,
        u.blackbaud_portfolio_cached_at,
        card.value->>'constituentId' AS constituent_id
      FROM users AS u
      CROSS JOIN LATERAL (
        SELECT value
        FROM jsonb_array_elements(
          COALESCE(u.blackbaud_portfolio_cache->'leadSolicitor', '[]'::jsonb)
        )
        UNION ALL
        SELECT value
        FROM jsonb_array_elements(
          COALESCE(u.blackbaud_portfolio_cache->'supportingSolicitor', '[]'::jsonb)
        )
      ) AS card
      WHERE u.active = TRUE
        AND u.blackbaud_portfolio_cache IS NOT NULL
        AND NULLIF(card.value->>'constituentId', '') IS NOT NULL
    ), stale_counts AS (
      SELECT
        portfolio_ids.workspace_user_id,
        portfolio_ids.blackbaud_portfolio_cached_at,
        COUNT(*)::int AS stale_count
      FROM portfolio_ids
      LEFT JOIN portfolio_constituent_snapshots AS snapshot
        ON snapshot.workspace_user_id = portfolio_ids.workspace_user_id
       AND snapshot.constituent_id = portfolio_ids.constituent_id
      LEFT JOIN portfolio_giving_snapshots AS giving
        ON giving.workspace_user_id = portfolio_ids.workspace_user_id
       AND giving.constituent_id = portfolio_ids.constituent_id
      WHERE snapshot.id IS NULL
        OR snapshot.data_complete = FALSE
        OR snapshot.summary_payload IS NULL
        OR snapshot.stale_after IS NULL
        OR snapshot.stale_after <= NOW()
        OR snapshot.last_error_stage IS NOT NULL
        OR giving.constituent_id IS NULL
        OR giving.stale_after <= NOW()
      GROUP BY portfolio_ids.workspace_user_id, portfolio_ids.blackbaud_portfolio_cached_at
    )
    SELECT
      stale_counts.workspace_user_id,
      stale_counts.blackbaud_portfolio_cached_at,
      stale_counts.stale_count,
      latest_job.completed_at AS last_job_completed_at
    FROM stale_counts
    LEFT JOIN LATERAL (
      SELECT completed_at
      FROM portfolio_refresh_jobs
      WHERE workspace_user_id = stale_counts.workspace_user_id
      ORDER BY created_at DESC
      LIMIT 1
    ) AS latest_job ON TRUE
    WHERE stale_counts.stale_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM portfolio_refresh_jobs AS attempted
        WHERE attempted.workspace_user_id = stale_counts.workspace_user_id
          AND attempted.mode = 'nightly'
          AND attempted.status IN ('completed', 'completed_with_failures', 'cancelled')
          AND attempted.created_at >= (
            date_trunc('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '1 hour'
          ) AT TIME ZONE 'America/New_York'
      )
    ORDER BY latest_job.completed_at ASC NULLS FIRST, stale_counts.workspace_user_id ASC
    LIMIT 1
  `;
  if (staleWorkspaces[0]) {
    return {
      job: null,
      workspaceUserId: staleWorkspaces[0].workspace_user_id,
      portfolioCachedAt: staleWorkspaces[0].blackbaud_portfolio_cached_at,
      staleCount: Number(staleWorkspaces[0].stale_count || 0),
    };
  }

  return null;
}

async function callRefreshRoute({ origin, authorization, workspaceUserId, body, path }) {
  const url = new URL(path, origin);
  url.searchParams.set("workspaceUserId", String(workspaceUserId));
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      authorization,
      "x-mgogpt-report-refresh": "scheduled",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Portfolio refresh returned ${response.status}`);
  }
  return payload;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppSchema();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const currentHour = getNewYorkHour();
  if (!force && !PORTFOLIO_REFRESH_HOURS.has(currentHour)) {
    return Response.json({
      status: "skipped",
      reason: "Outside the overnight portfolio refresh window.",
    });
  }

  const refreshUser = await getReportRefreshUser();
  if (!refreshUser) {
    return Response.json(
      { status: "skipped", reason: "No connected refresh service account is available." },
      { status: 503 },
    );
  }

  const target = await getRefreshTarget();
  if (!target) {
    return Response.json({ status: "complete", reason: "Portfolio maintenance is current or already attempted this night." });
  }

  const authorization = request.headers.get("authorization") || "";
  if (target.job?.status === "paused") {
    const pausedUntil = target.job.paused_until
      ? new Date(target.job.paused_until).getTime()
      : 0;
    if (Number.isFinite(pausedUntil) && pausedUntil > Date.now()) {
      return Response.json({
        status: "paused",
        workspaceUserId: Number(target.workspaceUserId),
        pausedUntil: target.job.paused_until,
      });
    }
  }
  if (target.job?.status === "processing") {
    const updatedAt = new Date(target.job.updated_at || 0).getTime();
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt < 5 * 60 * 1000) {
      return Response.json({
        status: "processing",
        workspaceUserId: Number(target.workspaceUserId),
        jobId: String(target.job.id),
      });
    }
  }

  try {
    let job = target.job;
    if (!job) {
      // Refresh assignment membership once before constructing a new manifest.
      // This call persists every assignment before enrichment starts.
      if (target.refreshAssignments) await callRefreshRoute({
        origin: url.origin,
        authorization,
        workspaceUserId: target.workspaceUserId,
        path: "/api/blackbaud/portfolio?refreshAssignments=1",
      });
      const started = await callRefreshRoute({
        origin: url.origin,
        authorization,
        workspaceUserId: target.workspaceUserId,
        path: "/api/blackbaud/portfolio-refresh",
        body: { action: "start", mode: "nightly" },
      });
      job = started?.job || null;
    }

    if (!job?.jobId && !job?.id) {
      return Response.json({
        status: "complete",
        workspaceUserId: Number(target.workspaceUserId),
        reason: "No stale constituents were selected.",
      });
    }

    const processed = await callRefreshRoute({
      origin: url.origin,
      authorization,
      workspaceUserId: target.workspaceUserId,
      path: "/api/blackbaud/portfolio-refresh",
      body: { action: "process", jobId: job.jobId || job.id },
    });
    return Response.json({
      status: processed?.job?.status || "queued",
      workspaceUserId: Number(target.workspaceUserId),
      job: processed?.job || null,
      batchSize: Number(processed?.job?.batchSize || 10),
    });
  } catch (error) {
    console.error("Scheduled portfolio refresh failed:", error);
    return Response.json(
      {
        status: "failed",
        workspaceUserId: Number(target.workspaceUserId),
        error: error instanceof Error ? error.message : "Scheduled portfolio refresh failed.",
      },
      { status: 502 },
    );
  }
}
