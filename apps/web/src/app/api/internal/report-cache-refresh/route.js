import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { invalidateReportSnapshots } from "@/app/api/utils/reportCache";

const DASHBOARD_REFRESH_HOURS = new Set([8, 15]);
const REPORT_KEYS = [
  "report:executive-team-standings",
  "report:future-made-phase-ii",
];

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

function isAuthorizedCronRequest(request) {
  const configuredSecret = String(
    process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET || "",
  ).trim();

  if (!configuredSecret) {
    return false;
  }

  const authorization = String(request.headers.get("authorization") || "").trim();
  return authorization === `Bearer ${configuredSecret}`;
}

export async function GET(request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureAppSchema();

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const now = new Date();
    const ny = getNewYorkTimeParts(now);
    const currentHour = Number(ny.hour);

    if (!force && !DASHBOARD_REFRESH_HOURS.has(currentHour)) {
      return Response.json({
        status: "skipped",
        reason: "Outside scheduled New York refresh window.",
        localTime: `${ny.year}-${ny.month}-${ny.day} ${ny.hour}:${ny.minute}:${ny.second}`,
      });
    }

    const invalidated = await invalidateReportSnapshots(REPORT_KEYS);

    return Response.json({
      status: "invalidated",
      localTime: `${ny.year}-${ny.month}-${ny.day} ${ny.hour}:${ny.minute}:${ny.second}`,
      invalidated,
      forced: force,
    });
  } catch (error) {
    console.error("Failed to refresh report caches:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not refresh report caches.",
      },
      { status: 500 },
    );
  }
}
