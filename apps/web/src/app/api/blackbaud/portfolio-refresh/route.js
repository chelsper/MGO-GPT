import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { runPortfolioRefreshBatch } from "@/app/api/utils/portfolioRefreshPipeline";
import {
  getReportRefreshUser,
  isAuthorizedReportRefreshRequest,
} from "@/app/api/utils/reportRefresh";
import sql from "@/app/api/utils/sql";
import { isAdminRole } from "@/utils/workspaceRoles";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 2;
const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;
const PROCESSING_LEASE_MINUTES = 5;

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function portfolioIds(payload) {
  const seen = new Set();
  return [
    ...(Array.isArray(payload?.leadSolicitor) ? payload.leadSolicitor : []),
    ...(Array.isArray(payload?.supportingSolicitor) ? payload.supportingSolicitor : []),
  ].flatMap((constituent) => {
    const id = String(constituent?.constituentId || "").trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [id];
  });
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeJob(job, failedItems = []) {
  if (!job) return null;
  return {
    jobId: String(job.id),
    workspaceUserId: numeric(job.workspace_user_id),
    fundraiserId: job.fundraiser_id || null,
    totalCount: numeric(job.total_count),
    processedCount: numeric(job.processed_count),
    successCount: numeric(job.success_count),
    failedCount: numeric(job.failed_count),
    currentCursor: numeric(job.current_cursor),
    batchSize: numeric(job.batch_size, DEFAULT_BATCH_SIZE),
    concurrency: numeric(job.concurrency, DEFAULT_CONCURRENCY),
    mode: job.mode || "stale",
    status: job.status || "queued",
    lastSuccessfulConstituentId: job.last_successful_constituent_id || null,
    pausedUntil: job.paused_until || null,
    startedAt: job.started_at || null,
    updatedAt: job.updated_at || null,
    completedAt: job.completed_at || null,
    failedItems: failedItems.map((item) => ({
      constituentId: item.constituent_id,
      position: numeric(item.position),
      stage: item.stage || null,
      endpoint: item.last_endpoint || null,
      httpStatus: numeric(item.http_status) || null,
      retryAfterMs: numeric(item.retry_after_ms) || null,
      retryCount: numeric(item.retry_count),
      requestDurationMs: numeric(item.request_duration_ms) || null,
      apiCallCount: numeric(item.api_call_count),
      errorClass: item.error_class || null,
      error: item.error_message || null,
    })),
  };
}

async function getJob(jobId, workspaceUserId) {
  const rows = jobId
    ? await sql`
        SELECT * FROM portfolio_refresh_jobs
        WHERE id = ${jobId} AND workspace_user_id = ${workspaceUserId}
        LIMIT 1
      `
    : await sql`
        SELECT * FROM portfolio_refresh_jobs
        WHERE workspace_user_id = ${workspaceUserId}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `;
  return rows[0] || null;
}

async function getFailedItems(jobId) {
  if (!jobId) return [];
  return sql`
    SELECT
      constituent_id,
      position,
      stage,
      last_endpoint,
      http_status,
      retry_after_ms,
      retry_count,
      request_duration_ms,
      api_call_count,
      error_class,
      error_message
    FROM portfolio_refresh_items
    WHERE job_id = ${jobId} AND status = 'failed'
    ORDER BY position ASC
    LIMIT 50
  `;
}

async function getInventory(workspaceUserId, failedCount = 0) {
  const cacheRows = await sql`
    SELECT blackbaud_portfolio_cache
    FROM users WHERE id = ${workspaceUserId} LIMIT 1
  `;
  const ids = portfolioIds(parsePayload(cacheRows[0]?.blackbaud_portfolio_cache));
  if (!ids.length) {
    return { total: 0, current: 0, stale: 0, failed: numeric(failedCount) };
  }
  const snapshots = await sql`
    SELECT constituent_id, summary_payload, data_complete, stale_after
    FROM portfolio_constituent_snapshots
    WHERE workspace_user_id = ${workspaceUserId}
      AND constituent_id = ANY(${ids})
  `;
  const current = snapshots.filter((snapshot) => {
    const staleAt = snapshot?.stale_after
      ? new Date(snapshot.stale_after).getTime()
      : 0;
    return (
      snapshot?.data_complete === true &&
      Boolean(snapshot?.summary_payload) &&
      Number.isFinite(staleAt) &&
      staleAt > Date.now()
    );
  }).length;
  return {
    total: ids.length,
    current,
    stale: Math.max(0, ids.length - current),
    failed: numeric(failedCount),
  };
}

async function refreshJobProgress(jobId) {
  const rows = await sql`
    WITH counts AS (
      SELECT
        COUNT(*) FILTER (WHERE status IN ('success', 'failed'))::int AS processed_count,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
        COALESCE(MIN(position) FILTER (WHERE status IN ('pending', 'processing')), COUNT(*))::int AS current_cursor,
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS remaining_count
      FROM portfolio_refresh_items
      WHERE job_id = ${jobId}
    )
    UPDATE portfolio_refresh_jobs AS job
    SET
      processed_count = counts.processed_count,
      success_count = counts.success_count,
      failed_count = counts.failed_count,
      current_cursor = counts.current_cursor,
      status = CASE
        WHEN job.cancel_requested THEN 'cancelled'
        WHEN job.status = 'paused' AND job.paused_until > NOW() THEN 'paused'
        WHEN counts.remaining_count = 0 AND counts.failed_count > 0 THEN 'completed_with_failures'
        WHEN counts.remaining_count = 0 THEN 'completed'
        ELSE 'queued'
      END,
      completed_at = CASE
        WHEN counts.remaining_count = 0 OR job.cancel_requested THEN COALESCE(job.completed_at, NOW())
        ELSE NULL
      END,
      updated_at = NOW()
    FROM counts
    WHERE job.id = ${jobId}
    RETURNING job.*
  `;
  return rows[0] || null;
}

async function getContext(request) {
  if (isAuthorizedReportRefreshRequest(request)) {
    const refreshUser = await getReportRefreshUser();
    const workspaceUserId = Number(
      new URL(request.url).searchParams.get("workspaceUserId") || 0,
    );
    if (!refreshUser || !Number.isInteger(workspaceUserId) || workspaceUserId <= 0) {
      return null;
    }
    const workspaceUsers = await sql`
      SELECT * FROM users
      WHERE id = ${workspaceUserId} AND active = TRUE
      LIMIT 1
    `;
    const workspaceUser = workspaceUsers[0] || null;
    if (!workspaceUser) return null;
    return {
      sessionUser: refreshUser,
      workspaceUser,
      isActing: refreshUser.id !== workspaceUser.id,
      authUserId: refreshUser.id,
      scheduledRefresh: true,
    };
  }

  const session = await auth(request);
  if (!session?.user?.email) return null;
  const context = await getWorkspaceUser(session, request);
  if (!context?.workspaceUser) return null;
  return {
    ...context,
    authUserId: context.isActing
      ? context.sessionUser.id
      : context.workspaceUser.id,
  };
}

function hasWarnings(payload) {
  return Object.values(payload?.warnings || {}).some(Boolean);
}

function normalizedPayload(payload) {
  const mapped = payload?.mapped || {};
  const { prospectSummaryNarrative: _summary, ...normalized } = mapped;
  return {
    constituentId: payload?.constituentId || mapped?.constituent?.id || null,
    mapped: normalized,
    warnings: payload?.warnings || {},
  };
}

function mergeWithLastGoodSummary(previous, current) {
  if (!previous || !hasWarnings(current)) return current;
  const warningToField = {
    lifetimeGiving: "lifetimeGiving",
    fundraiserAssignments: "fundraiserAssignments",
    relationships: "primaryBusinessRelationship",
    education: "jacksonvilleUniversityEducation",
    annualGivingSocieties: "annualGivingSocieties",
    proposalSummary: "proposalSummary",
    familySummary: "familySummary",
  };
  const mapped = { ...(current?.mapped || {}) };
  for (const [warning, field] of Object.entries(warningToField)) {
    if (current?.warnings?.[warning] && previous?.mapped?.[field] !== undefined) {
      mapped[field] = previous.mapped[field];
    }
  }
  return { ...current, mapped };
}

async function processItem({ request, item, job, workspaceUserId, authUserId }) {
  const startedAt = Date.now();
  let previousSummary = null;
  const endpoint = `/constituent/v1/constituents/${encodeURIComponent(
    String(item.constituent_id),
  )}`;
  await sql`
    UPDATE portfolio_refresh_items
    SET status = 'processing', stage = 'blackbaud_retrieval', started_at = NOW(), updated_at = NOW()
    WHERE id = ${item.id}
  `;

  try {
    // If a previous execution completed the shared snapshot but terminated
    // before checkpointing the item, recover without spending more API calls.
    const recoveredRows = await sql`
      SELECT summary_payload, data_complete, stale_after
      FROM portfolio_constituent_snapshots
      WHERE workspace_user_id = ${workspaceUserId}
        AND constituent_id = ${String(item.constituent_id)}
      LIMIT 1
    `;
    const recovered = recoveredRows[0];
    const recoveredStaleAt = recovered?.stale_after
      ? new Date(recovered.stale_after).getTime()
      : 0;
    if (
      job.mode !== "full" &&
      recovered?.data_complete === true &&
      recovered?.summary_payload &&
      Number.isFinite(recoveredStaleAt) &&
      recoveredStaleAt > Date.now()
    ) {
      await sql`
        UPDATE portfolio_refresh_items
        SET
          status = 'success',
          stage = 'recovered_snapshot',
          request_duration_ms = ${Date.now() - startedAt},
          api_call_count = 0,
          error_class = NULL,
          error_message = NULL,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${item.id}
      `;
      await sql`
        UPDATE portfolio_refresh_jobs
        SET last_successful_constituent_id = ${String(item.constituent_id)}, updated_at = NOW()
        WHERE id = ${job.id}
      `;
      return { status: "success", recovered: true };
    }

    const url = new URL(
      `/api/blackbaud/constituents/${encodeURIComponent(
        String(item.constituent_id),
      )}/summary`,
      request.url,
    );
    url.searchParams.set("refresh", "1");
    const scheduledRefresh = isAuthorizedReportRefreshRequest(request);
    if (scheduledRefresh) {
      url.searchParams.set("workspaceUserId", String(workspaceUserId));
    }
    const response = await fetch(url, {
      headers: {
        ...(scheduledRefresh
          ? {
              authorization: request.headers.get("authorization") || "",
              "x-mgogpt-report-refresh": "scheduled",
            }
          : { cookie: request.headers.get("cookie") || "" }),
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    const apiCallCount = numeric(response.headers.get("x-mgogpt-nxt-api-calls"));
    const requestDurationMs = numeric(
      response.headers.get("x-mgogpt-nxt-request-duration-ms"),
      Date.now() - startedAt,
    );
    const lastEndpoint =
      response.headers.get("x-mgogpt-nxt-last-endpoint") || endpoint;
    const providerStatus = numeric(
      response.headers.get("x-mgogpt-nxt-last-status"),
      numeric(payload?.providerStatus, response.status),
    );
    const retryAfterMs = numeric(
      response.headers.get("x-mgogpt-nxt-retry-after-ms"),
      numeric(payload?.retryAfterMs),
    );

    if (!response.ok) {
      const paused = response.status === 429 || payload?.quotaPaused === true;
      const error = new Error(payload?.error || `Summary refresh returned ${response.status}`);
      error.stage = "blackbaud_retrieval";
      error.httpStatus = providerStatus || response.status;
      error.retryAfterMs = retryAfterMs;
      error.endpoint = lastEndpoint;
      error.apiCallCount = apiCallCount;
      error.requestDurationMs = requestDurationMs;
      error.paused = paused;
      throw error;
    }

    const identity = payload?.mapped?.constituent;
    if (!identity?.id || !identity?.name) {
      const error = new Error("Blackbaud returned a malformed constituent identity");
      error.stage = "normalization";
      error.httpStatus = providerStatus || response.status;
      error.endpoint = lastEndpoint;
      error.apiCallCount = apiCallCount;
      error.requestDurationMs = requestDurationMs;
      throw error;
    }

    const previousRows = await sql`
      SELECT summary_payload
      FROM portfolio_constituent_snapshots
      WHERE workspace_user_id = ${workspaceUserId}
        AND constituent_id = ${String(item.constituent_id)}
      LIMIT 1
    `;
    previousSummary = parsePayload(previousRows[0]?.summary_payload);
    const normalized = normalizedPayload(payload);

    // Persist the normalized provider snapshot before summary generation. A
    // later summary failure can then resume without erasing retrieved data.
    await sql`
      INSERT INTO portfolio_constituent_snapshots (
        workspace_user_id,
        constituent_id,
        normalized_payload,
        data_complete,
        stale_after,
        source_updated_at,
        last_refreshed_at,
        last_error_stage,
        last_error_message,
        updated_at
      ) VALUES (
        ${workspaceUserId},
        ${String(item.constituent_id)},
        ${JSON.stringify(normalized)}::jsonb,
        FALSE,
        ${new Date(Date.now() + SNAPSHOT_STALE_MS).toISOString()},
        ${identity?.date_modified || identity?.updated_at || null},
        NOW(),
        NULL,
        NULL,
        NOW()
      )
      ON CONFLICT (workspace_user_id, constituent_id) DO UPDATE SET
        normalized_payload = EXCLUDED.normalized_payload,
        stale_after = EXCLUDED.stale_after,
        source_updated_at = COALESCE(EXCLUDED.source_updated_at, portfolio_constituent_snapshots.source_updated_at),
        last_refreshed_at = NOW(),
        last_error_stage = NULL,
        last_error_message = NULL,
        updated_at = NOW()
    `;

    const narrative = String(payload?.mapped?.prospectSummaryNarrative || "").trim();
    if (!narrative) {
      const error = new Error("Summary generation returned no narrative");
      error.stage = "summary_generation";
      error.httpStatus = providerStatus || response.status;
      error.endpoint = lastEndpoint;
      error.apiCallCount = apiCallCount;
      error.requestDurationMs = requestDurationMs;
      throw error;
    }

    const safeSummary = mergeWithLastGoodSummary(previousSummary, payload);
    const complete = !hasWarnings(payload);
    await sql`
      UPDATE portfolio_constituent_snapshots
      SET
        summary_payload = ${JSON.stringify(safeSummary)}::jsonb,
        data_complete = ${complete},
        last_refreshed_at = NOW(),
        updated_at = NOW()
      WHERE workspace_user_id = ${workspaceUserId}
        AND constituent_id = ${String(item.constituent_id)}
    `;
    await sql`
      UPDATE blackbaud_constituent_summary_cache
      SET payload = ${JSON.stringify(safeSummary)}::jsonb, updated_at = NOW()
      WHERE workspace_user_id = ${workspaceUserId}
        AND auth_user_id = ${authUserId}
        AND constituent_id = ${String(item.constituent_id)}
        AND cache_key LIKE 'constituent-summary-v4|%|full'
    `;
    await sql`
      UPDATE portfolio_refresh_items
      SET
        status = 'success',
        stage = 'complete',
        last_endpoint = ${lastEndpoint},
        http_status = ${providerStatus || response.status},
        retry_after_ms = NULL,
        request_duration_ms = ${requestDurationMs},
        api_call_count = ${apiCallCount},
        error_class = NULL,
        error_message = NULL,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${item.id}
    `;
    await sql`
      UPDATE portfolio_refresh_jobs
      SET last_successful_constituent_id = ${String(item.constituent_id)}, updated_at = NOW()
      WHERE id = ${job.id}
    `;
    return { status: "success" };
  } catch (error) {
    const paused = error?.paused === true;
    const retryAfterMs = Math.max(0, numeric(error?.retryAfterMs));
    await sql`
      UPDATE portfolio_refresh_items
      SET
        status = ${paused ? "pending" : "failed"},
        stage = ${error?.stage || "unknown"},
        last_endpoint = ${error?.endpoint || endpoint},
        http_status = ${numeric(error?.httpStatus) || null},
        retry_after_ms = ${retryAfterMs || null},
        request_duration_ms = ${numeric(error?.requestDurationMs, Date.now() - startedAt)},
        api_call_count = ${numeric(error?.apiCallCount)},
        retry_count = retry_count + 1,
        error_class = ${error?.name || "Error"},
        error_message = ${error instanceof Error ? error.message : "Portfolio item refresh failed"},
        completed_at = ${paused ? null : new Date().toISOString()},
        updated_at = NOW()
      WHERE id = ${item.id}
    `;
    if (paused) {
      const pausedUntil = new Date(
        Date.now() + Math.max(retryAfterMs, 60_000),
      ).toISOString();
      await sql`
        UPDATE portfolio_refresh_jobs
        SET status = 'paused', paused_until = ${pausedUntil}, updated_at = NOW()
        WHERE id = ${job.id}
      `;
      return { status: "paused" };
    }

    // A failed regeneration must not replace the last usable card summary.
    if (previousSummary && error?.stage === "summary_generation") {
      await sql`
        UPDATE blackbaud_constituent_summary_cache
        SET payload = ${JSON.stringify(previousSummary)}::jsonb, updated_at = NOW()
        WHERE workspace_user_id = ${workspaceUserId}
          AND auth_user_id = ${authUserId}
          AND constituent_id = ${String(item.constituent_id)}
          AND cache_key LIKE 'constituent-summary-v4|%|full'
      `;
    }

    await sql`
      UPDATE portfolio_constituent_snapshots
      SET
        last_error_stage = ${error?.stage || "unknown"},
        last_error_message = ${error instanceof Error ? error.message : "Portfolio item refresh failed"},
        updated_at = NOW()
      WHERE workspace_user_id = ${workspaceUserId}
        AND constituent_id = ${String(item.constituent_id)}
    `;
    return {
      status: "failed",
      stage: error?.stage || "unknown",
      normalizedSaved: error?.stage === "summary_generation",
    };
  }
}

export async function GET(request) {
  await ensureAppSchema();
  const context = await getContext(request);
  if (!context) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const job = await getJob(
    new URL(request.url).searchParams.get("jobId"),
    context.workspaceUser.id,
  );
  const canViewDiagnostics = isAdminRole(context.sessionUser?.role);
  const failedItems = canViewDiagnostics ? await getFailedItems(job?.id) : [];
  const inventory = await getInventory(
    context.workspaceUser.id,
    job?.failed_count,
  );
  return Response.json({ job: serializeJob(job, failedItems), inventory });
}

export async function POST(request) {
  await ensureAppSchema();
  const context = await getContext(request);
  if (!context) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "start").trim();
  const workspaceUserId = context.workspaceUser.id;

  if (action === "start") {
    const mode = body?.mode === "full" ? "full" : "stale";
    if (mode === "full" && !isAdminRole(context.sessionUser?.role)) {
      return Response.json({ error: "Only an administrator can run a full rebuild" }, { status: 403 });
    }
    const activeRows = await sql`
      SELECT * FROM portfolio_refresh_jobs
      WHERE workspace_user_id = ${workspaceUserId}
        AND status IN ('queued', 'processing', 'paused')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (activeRows[0]) {
      return Response.json({ job: serializeJob(activeRows[0]) });
    }
    const cacheRows = await sql`
      SELECT blackbaud_portfolio_cache, blackbaud_constituent_id
      FROM users WHERE id = ${workspaceUserId} LIMIT 1
    `;
    const ids = portfolioIds(parsePayload(cacheRows[0]?.blackbaud_portfolio_cache));
    if (!ids.length) {
      return Response.json(
        { error: "Load the Blackbaud portfolio assignment snapshot before starting enrichment" },
        { status: 409 },
      );
    }
    const snapshots = await sql`
      SELECT constituent_id, summary_payload, data_complete, stale_after
      FROM portfolio_constituent_snapshots
      WHERE workspace_user_id = ${workspaceUserId}
        AND constituent_id = ANY(${ids})
    `;
    const snapshotById = new Map(
      snapshots.map((snapshot) => [String(snapshot.constituent_id), snapshot]),
    );
    const selectedIds =
      mode === "full"
        ? ids
        : ids.filter((id) => {
            const snapshot = snapshotById.get(id);
            const staleAt = snapshot?.stale_after
              ? new Date(snapshot.stale_after).getTime()
              : 0;
            return (
              !snapshot ||
              snapshot.data_complete !== true ||
              !snapshot.summary_payload ||
              !Number.isFinite(staleAt) ||
              staleAt <= Date.now()
            );
          });
    const jobs = await sql`
      INSERT INTO portfolio_refresh_jobs (
        workspace_user_id,
        auth_user_id,
        fundraiser_id,
        ordered_constituent_ids,
        total_count,
        batch_size,
        concurrency,
        mode,
        status
      ) VALUES (
        ${workspaceUserId},
        ${context.authUserId},
        ${cacheRows[0]?.blackbaud_constituent_id || null},
        ${JSON.stringify(selectedIds)}::jsonb,
        ${selectedIds.length},
        ${DEFAULT_BATCH_SIZE},
        ${DEFAULT_CONCURRENCY},
        ${mode},
        ${selectedIds.length ? "queued" : "completed"}
      )
      RETURNING *
    `;
    const job = jobs[0];
    if (selectedIds.length) {
      await sql`
        INSERT INTO portfolio_refresh_items (job_id, constituent_id, position)
        SELECT
          ${job.id},
          item.constituent_id,
          (item.ordinality - 1)::int
        FROM jsonb_array_elements_text(${JSON.stringify(selectedIds)}::jsonb)
          WITH ORDINALITY AS item(constituent_id, ordinality)
      `;
    }
    return Response.json({ job: serializeJob(job) }, { status: 201 });
  }

  const job = await getJob(body?.jobId, workspaceUserId);
  if (!job) return Response.json({ error: "Refresh job not found" }, { status: 404 });

  if (action === "cancel") {
    const rows = await sql`
      UPDATE portfolio_refresh_jobs
      SET cancel_requested = TRUE, status = 'cancelled', completed_at = NOW(), updated_at = NOW()
      WHERE id = ${job.id}
      RETURNING *
    `;
    return Response.json({ job: serializeJob(rows[0]) });
  }

  if (action === "retry_failed") {
    await sql`
      UPDATE portfolio_refresh_items
      SET status = 'pending', completed_at = NULL, updated_at = NOW()
      WHERE job_id = ${job.id} AND status = 'failed'
    `;
    await sql`
      UPDATE portfolio_refresh_jobs
      SET status = 'queued', paused_until = NULL, completed_at = NULL, cancel_requested = FALSE, updated_at = NOW()
      WHERE id = ${job.id}
    `;
    const refreshed = await refreshJobProgress(job.id);
    return Response.json({ job: serializeJob(refreshed) });
  }

  if (action === "resume") {
    if (job.status === "paused" && job.paused_until && new Date(job.paused_until) > new Date()) {
      return Response.json({ job: serializeJob(job), paused: true });
    }
    await sql`
      UPDATE portfolio_refresh_jobs
      SET status = 'queued', paused_until = NULL, cancel_requested = FALSE, completed_at = NULL, updated_at = NOW()
      WHERE id = ${job.id}
    `;
  } else if (action !== "process") {
    return Response.json({ error: "Unsupported portfolio refresh action" }, { status: 400 });
  }

  if (job.cancel_requested || job.status === "cancelled") {
    return Response.json({ job: serializeJob(job) });
  }
  if (["completed", "completed_with_failures"].includes(job.status) && action === "process") {
    const failedItems = isAdminRole(context.sessionUser?.role)
      ? await getFailedItems(job.id)
      : [];
    return Response.json({ job: serializeJob(job, failedItems) });
  }

  await sql`
    UPDATE portfolio_refresh_items
    SET status = 'pending', updated_at = NOW()
    WHERE job_id = ${job.id}
      AND status = 'processing'
      AND updated_at < NOW() - (${PROCESSING_LEASE_MINUTES} * INTERVAL '1 minute')
  `;
  const claimed = await sql`
    WITH next_items AS (
      SELECT id
      FROM portfolio_refresh_items
      WHERE job_id = ${job.id} AND status = 'pending'
      ORDER BY position ASC
      LIMIT ${numeric(job.batch_size, DEFAULT_BATCH_SIZE)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE portfolio_refresh_items AS item
    SET status = 'processing', started_at = NOW(), updated_at = NOW()
    FROM next_items
    WHERE item.id = next_items.id
    RETURNING item.*
  `;
  await sql`
    UPDATE portfolio_refresh_jobs
    SET status = 'processing', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
    WHERE id = ${job.id} AND cancel_requested = FALSE
  `;

  const batchResult = await runPortfolioRefreshBatch({
    items: claimed,
    concurrency: numeric(job.concurrency, DEFAULT_CONCURRENCY),
    processItem: (item) =>
      processItem({
        request,
        item,
        job,
        workspaceUserId,
        authUserId: context.authUserId,
      }),
    releaseItem: async (item) => {
        await sql`
          UPDATE portfolio_refresh_items
          SET status = 'pending', updated_at = NOW()
          WHERE id = ${item.id} AND status = 'processing'
        `;
    },
  });
  if (batchResult.paused) {
    await sql`
      UPDATE portfolio_refresh_items
      SET status = 'pending', updated_at = NOW()
      WHERE job_id = ${job.id} AND status = 'processing'
    `;
  }
  const refreshed = await refreshJobProgress(job.id);
  const failedItems = isAdminRole(context.sessionUser?.role)
    ? await getFailedItems(job.id)
    : [];
  return Response.json({ job: serializeJob(refreshed, failedItems) });
}
