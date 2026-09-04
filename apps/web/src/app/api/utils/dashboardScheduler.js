import sql from "@/app/api/utils/sql";

// The existing hourly cron drains pending batches and refreshes dashboards daily.
// Oldest checkpoints first prevent a slow report from permanently starving others.
export async function getDueDashboardRefreshTargets() {
  const rows = await sql`
    SELECT rc.report_key
    FROM report_configurations AS rc
    LEFT JOIN report_snapshots_cache AS snapshot ON snapshot.report_key = 'report:dashboard:' || rc.report_key
    WHERE rc.configuration_kind = 'dashboard' AND rc.active = TRUE
      AND EXISTS (SELECT 1 FROM users WHERE users.active = TRUE AND rc.specific_user_ids @> jsonb_build_array(users.id))
      AND (snapshot.report_key IS NULL OR snapshot.payload->>'refreshStatus' = 'pending' OR snapshot.updated_at < NOW() - INTERVAL '24 hours')
    ORDER BY snapshot.updated_at ASC NULLS FIRST, rc.report_key
  `;
  return rows.map((row) => ({
    key: row.report_key,
    path: `/api/reports/dashboards/${encodeURIComponent(row.report_key)}`,
    method: "POST",
  }));
}
