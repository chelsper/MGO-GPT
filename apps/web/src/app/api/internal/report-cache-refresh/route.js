import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportRefreshUser } from "@/app/api/utils/reportRefresh";
import { getDueDashboardRefreshTargets } from "@/app/api/utils/dashboardScheduler";

export const maxDuration = 300;

// Vercel cron expressions use UTC. This endpoint runs hourly, but performs the
// real refresh only at 6 PM in New York so the schedule stays correct through
// daylight-saving changes.
const DASHBOARD_REFRESH_HOURS = new Set([18]);
const REFRESH_TARGETS = [
  {
    key: "executive-team-standings",
    path: "/api/reports/executive-team-standings",
  },
  {
    key: "future-made-phase-ii",
    path: "/api/reports/future-made-phase-ii",
  },
  {
    key: "alumni-family-engagement",
    path: "/api/reports/alumni-family-engagement",
  },
];
const REPORT_POLL_INTERVAL_MS = 2_000;
// Some reports still use queued Blackbaud Query API jobs, while direct-data
// reports return their refreshed snapshot immediately. Keep each polling window
// below 90 seconds so the complete cron stays inside Vercel's five-minute cap.
const MAX_REPORT_POLL_ATTEMPTS = 40;

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

function getRefreshSecret() {
  return String(
    process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET || "",
  ).trim();
}

function getCronAuthorizationState(request) {
  const configuredSecret = getRefreshSecret();
  const authorization = String(request.headers.get("authorization") || "").trim();

  return {
    authorizationLength: authorization.length,
    authorizationPresent: Boolean(authorization),
    configuredSecretLength: configuredSecret.length,
    configuredSecretPresent: Boolean(configuredSecret),
    isAuthorized: Boolean(
      configuredSecret && authorization === `Bearer ${configuredSecret}`,
    ),
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJson(response) {
  return response.json().catch(() => null);
}

async function refreshReportSnapshot({ origin, target, authorization }) {
  let pollParameters = null;

  for (let attempt = 0; attempt < MAX_REPORT_POLL_ATTEMPTS; attempt += 1) {
    const url = new URL(target.path, origin);
    if (pollParameters) {
      Object.entries(pollParameters).forEach(([key, value]) => {
        if (String(value || "").trim()) {
          url.searchParams.set(key, String(value).trim());
        }
      });
    } else {
      url.searchParams.set("refresh", "1");
    }

    const response = await fetch(url, {
      ...(target.method ? { method: target.method, signal: AbortSignal.timeout(195_000) } : {}),
      headers: {
        Authorization: authorization,
        "x-mgogpt-report-refresh": "scheduled",
      },
      cache: "no-store",
    });
    const payload = await readJson(response);

    if (response.status === 202) {
      const returnedPollParameters = Object.entries(payload?.poll || {}).reduce(
        (result, [key, value]) => {
          const normalizedValue = String(value || "").trim();
          if (normalizedValue) result[key] = normalizedValue;
          return result;
        },
        {},
      );
      const returnedJobId = String(payload?.jobId || "").trim();
      pollParameters = Object.keys(returnedPollParameters).length
        ? returnedPollParameters
        : returnedJobId
          ? { jobId: returnedJobId }
          : null;
      if (!pollParameters) {
        throw new Error("The report refresh did not return polling information.");
      }
      await wait(REPORT_POLL_INTERVAL_MS);
      continue;
    }

    if (!response.ok) {
      throw new Error(payload?.error || `Report refresh returned ${response.status}.`);
    }

    if (target.method === "POST") {
      return {
        key: target.key,
        status: payload.refreshStatus === "pending" ? "pending" : payload.status === "complete" ? "refreshed" : "partial",
        remainingQueryCount: payload.remainingQueryCount || 0,
        generatedAt: payload.snapshot?.generatedAt || null,
        warnings: payload.snapshot?.warnings || [],
      };
    }
    if (payload?.status !== "complete" && !Array.isArray(payload?.standings)) {
      throw new Error(payload?.message || "The report did not return a completed snapshot.");
    }

    return {
      key: target.key,
      status: "refreshed",
      generatedAt: payload?.generatedAt || null,
      totalRows: Number(payload?.totalRows ?? payload?.donors?.length ?? 0),
      queryName: payload?.query?.name || null,
    };
  }

  throw new Error("The report refresh did not finish before the scheduled refresh window closed.");
}

export async function GET(request) {
  try {
    const startedAt = Date.now();
    const cronAuthorization = getCronAuthorizationState(request);
    if (!cronAuthorization.isAuthorized) {
      // Keep auth failures diagnosable without ever logging either secret.
      console.warn("Unauthorized report snapshot refresh request", cronAuthorization);
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureAppSchema();

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const now = new Date();
    const ny = getNewYorkTimeParts(now);
    const currentHour = Number(ny.hour);
    const localTime = `${ny.year}-${ny.month}-${ny.day} ${ny.hour}:${ny.minute}:${ny.second}`;

    const refreshBuiltins = force || DASHBOARD_REFRESH_HOURS.has(currentHour);
    const dashboardTargets = await getDueDashboardRefreshTargets();
    if (!refreshBuiltins && !dashboardTargets.length) {
      return Response.json({
        status: "skipped",
        reason: "Outside the scheduled 6 PM New York refresh window.",
        localTime,
      });
    }

    const refreshUser = await getReportRefreshUser();
    if (!refreshUser) {
      return Response.json(
        {
          status: "skipped",
          reason:
            "No active Admin or Advancement Services Blackbaud connection is available for the scheduled report refresh.",
          localTime,
        },
        { status: 503 },
      );
    }

    const authorization = request.headers.get("authorization");
    const origin = url.origin;
    const refreshed = [];
    const failed = [];
    const deferred = [];

    // Run one report at a time to avoid consuming NXT quota in bursts. Each
    // route retains successful values on failures. Dashboards checkpoint at
    // most two unique queries per request and resume on the next hourly run.
    for (const target of [...(refreshBuiltins ? REFRESH_TARGETS : []), ...dashboardTargets]) {
      if (target.method && Date.now() - startedAt > 75_000) {
        deferred.push({ key: target.key, reason: "Deferred to the next hourly run to respect the execution budget." });
        continue;
      }
      try {
        refreshed.push(
          await refreshReportSnapshot({ origin, target, authorization }),
        );
      } catch (error) {
        failed.push({
          key: target.key,
          error: error instanceof Error ? error.message : "Could not refresh this report.",
        });
      }
    }

    return Response.json({
      status: failed.length || deferred.length || refreshed.some((result) => result.status !== "refreshed") ? "partial" : "refreshed",
      localTime,
      refreshUser: {
        id: refreshUser.id,
        name: refreshUser.name || refreshUser.email || "Scheduled refresh user",
      },
      refreshed,
      failed,
      deferred,
      forced: force,
      nextScheduledRefresh: "6:00 PM America/New_York",
      dashboardSchedule: "Daily; pending and deferred dashboard batches continue on the hourly cron.",
    });
  } catch (error) {
    console.error("Failed to refresh report snapshots:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not refresh report snapshots.",
      },
      { status: 500 },
    );
  }
}
