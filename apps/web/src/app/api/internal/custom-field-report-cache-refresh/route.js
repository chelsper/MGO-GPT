import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";
import {
  getReportRefreshUser,
  isAuthorizedReportRefreshRequest,
} from "@/app/api/utils/reportRefresh";

export const maxDuration = 300;

// Custom reports refresh after the core dashboards. Staggering one NXT query
// per hour keeps the refresh queue predictable and prevents a configuration
// change from producing a burst of NXT calls.
const CUSTOM_REPORT_REFRESH_HOURS = new Set([18, 19, 20, 21, 22, 23]);
const QUERY_POLL_INTERVAL_MS = 2_000;
const MAX_QUERY_POLL_ATTEMPTS = 40;

function getNewYorkTimeParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.formatToParts(now).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJson(response) {
  return response.json().catch(() => null);
}

async function getNextEnabledCustomReport() {
  const records = await sql`
    SELECT
      r.slug,
      r.title,
      r.updated_at,
      s.updated_at AS snapshot_updated_at
    FROM custom_field_reports AS r
    LEFT JOIN report_snapshots_cache AS s
      ON s.report_key = 'report:custom-field:' || r.slug
    WHERE r.active = TRUE
      AND jsonb_typeof(COALESCE(r.specific_user_ids, '[]'::jsonb)) = 'array'
      AND jsonb_array_length(COALESCE(r.specific_user_ids, '[]'::jsonb)) > 0
      AND (
        s.updated_at IS NULL
        OR s.updated_at < (
          (
            date_trunc('day', NOW() AT TIME ZONE 'America/New_York')
            + INTERVAL '18 hours'
          ) AT TIME ZONE 'America/New_York'
        )
      )
    ORDER BY s.updated_at ASC NULLS FIRST, r.updated_at ASC, r.id ASC
    LIMIT 1
  `;

  return records[0] || null;
}

async function refreshCustomReport({ origin, slug, authorization }) {
  let pollParameters = null;

  for (let attempt = 0; attempt < MAX_QUERY_POLL_ATTEMPTS; attempt += 1) {
    const url = new URL(`/api/reports/custom-field/${encodeURIComponent(slug)}`, origin);
    if (pollParameters?.jobId) {
      url.searchParams.set("jobId", pollParameters.jobId);
    } else {
      url.searchParams.set("refresh", "1");
    }

    const response = await fetch(url, {
      headers: {
        Authorization: authorization,
        "x-mgogpt-report-refresh": "scheduled",
      },
      cache: "no-store",
    });
    const payload = await readJson(response);

    if (response.status === 202) {
      const jobId = String(payload?.poll?.jobId || payload?.jobId || "").trim();
      if (!jobId) {
        throw new Error("The custom report refresh did not return query polling information.");
      }
      pollParameters = { jobId };
      await wait(QUERY_POLL_INTERVAL_MS);
      continue;
    }

    if (!response.ok) {
      throw new Error(payload?.error || `Custom report refresh returned ${response.status}.`);
    }
    if (payload?.status !== "complete") {
      throw new Error(payload?.message || "The custom report did not return a completed snapshot.");
    }

    return {
      slug,
      title: payload?.report?.title || null,
      status: "refreshed",
      generatedAt: payload?.generatedAt || null,
      totalRows: Number(payload?.totalRows || 0),
    };
  }

  throw new Error("The NXT custom-field query did not finish before the custom report refresh window closed.");
}

export async function GET(request) {
  try {
    if (!isAuthorizedReportRefreshRequest(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureAppSchema();

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const ny = getNewYorkTimeParts();
    const currentHour = Number(ny.hour);
    const localTime = `${ny.year}-${ny.month}-${ny.day} ${ny.hour}:${ny.minute}:${ny.second}`;

    if (!force && !CUSTOM_REPORT_REFRESH_HOURS.has(currentHour)) {
      return Response.json({
        status: "skipped",
        reason: "Outside the staggered custom-report refresh window.",
        localTime,
      });
    }

    const refreshUser = await getReportRefreshUser();
    if (!refreshUser) {
      return Response.json(
        {
          status: "skipped",
          reason:
            "No active Admin or Advancement Services Blackbaud connection is available for the custom report refresh.",
          localTime,
        },
        { status: 503 },
      );
    }

    const target = await getNextEnabledCustomReport();
    if (!target) {
      return Response.json({
        status: "skipped",
        reason: "No enabled Custom Field Reports are waiting for a refresh.",
        localTime,
      });
    }

    const authorization = request.headers.get("authorization");
    try {
      const refreshed = await refreshCustomReport({
        origin: url.origin,
        slug: target.slug,
        authorization,
      });
      return Response.json({
        status: "refreshed",
        localTime,
        refreshUser: {
          id: refreshUser.id,
          name: refreshUser.name || refreshUser.email || "Scheduled refresh user",
        },
        refreshed,
        forced: force,
        nextScheduledRefresh: "Hourly from 6:30 PM to 11:30 PM America/New_York",
      });
    } catch (error) {
      return Response.json(
        {
          status: "failed",
          localTime,
          target: { slug: target.slug, title: target.title },
          error:
            error instanceof Error ? error.message : "Could not refresh this Custom Field Report.",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Failed to refresh Custom Field Report snapshot:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not refresh Custom Field Report snapshots.",
      },
      { status: 500 },
    );
  }
}
