import sql from "@/app/api/utils/sql";

// Shared reports are snapshots, not short-lived response caches. A normal
// report visit must remain read-only so it never unexpectedly consumes NXT API
// quota. Snapshots are replaced only by a scheduled or explicit refresh.
export const REPORT_SNAPSHOT_POLICY = "last-successful-refresh";

export function shouldBypassReportCache(request) {
  const url = new URL(request.url);
  const refreshFlag = String(
    url.searchParams.get("refresh") ||
      request.headers.get("x-mgogpt-refresh") ||
      "",
  ).trim();

  return refreshFlag === "1" || refreshFlag.toLowerCase() === "true";
}

export function getReportCacheHeaders(cacheStatus = "miss") {
  return {
    "Cache-Control": "private, no-store",
    "X-MGOGPT-Report-Cache": cacheStatus,
  };
}

export async function getCachedReportSnapshot(reportKey) {
  const normalizedKey = String(reportKey || "").trim();
  if (!normalizedKey) return null;

  const rows = await sql`
    SELECT payload, updated_at
    FROM report_snapshots_cache
    WHERE report_key = ${normalizedKey}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row?.payload) {
    return null;
  }

  return row.payload;
}

export async function saveReportSnapshot(reportKey, payload) {
  const normalizedKey = String(reportKey || "").trim();
  if (!normalizedKey || !payload) return;

  await sql`
    INSERT INTO report_snapshots_cache (
      report_key,
      payload,
      updated_at
    )
    VALUES (
      ${normalizedKey},
      ${JSON.stringify(payload)}::jsonb,
      NOW()
    )
    ON CONFLICT (report_key)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
}

export async function invalidateReportSnapshot(reportKey) {
  const normalizedKey = String(reportKey || "").trim();
  if (!normalizedKey) return;

  await sql`
    DELETE FROM report_snapshots_cache
    WHERE report_key = ${normalizedKey}
  `;
}

export async function invalidateReportSnapshots(reportKeys) {
  const normalizedKeys = Array.from(
    new Set(
      (Array.isArray(reportKeys) ? reportKeys : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (!normalizedKeys.length) return [];

  await sql`
    DELETE FROM report_snapshots_cache
    WHERE report_key = ANY(${normalizedKeys})
  `;

  return normalizedKeys;
}
