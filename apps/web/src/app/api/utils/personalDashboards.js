import sql from "./sql";
import { dashboardError } from "./dashboardConfigurations";
import { listMetricLibrary, loadMetricSources, serializeMetric } from "./reportMetricLibrary";
import { presentMetricResult } from "./reportMetricSources";
import { getCachedReportSnapshot } from "./reportCache";
import { isPersonalDashboardId, validatePersonalWorkspace } from "@/utils/personalDashboards";

function requireOwner(user) {
  if (user?.active !== true || !/^[1-9]\d*$/.test(String(user.id))) throw dashboardError("Sign in to use personal dashboards.", 403);
}

function presentWorkspace(row) {
  return validatePersonalWorkspace({ revision: row?.revision || "0", dashboards: row?.dashboards || [], defaultDashboardId: row?.default_dashboard_id || null });
}

export async function readPersonalWorkspace(user) {
  requireOwner(user);
  const rows = await sql`SELECT dashboards, default_dashboard_id, revision::text AS revision
    FROM personal_report_workspaces WHERE user_id = ${user.id} LIMIT 1`;
  return presentWorkspace(rows[0]);
}

export async function savePersonalWorkspace(user, input) {
  requireOwner(user);
  const desired = validatePersonalWorkspace(input);
  const current = await readPersonalWorkspace(user);
  if (current.revision !== desired.revision) throw dashboardError("Your dashboards changed in another window. Reload before saving; your draft has been retained.", 409);
  const { entries } = await listMetricLibrary(user);
  const available = new Map(entries.map((entry) => [entry.id, entry]));
  for (const dashboard of desired.dashboards) {
    const existing = current.dashboards.find((item) => item.id === dashboard.id);
    if (dashboard.metricIds.some((id) => !available.has(id) && !existing?.metricIds.includes(id)))
      throw dashboardError("A selected metric is no longer available. Reload available metrics before saving.", 409);
    if (dashboard.metricIds.filter((id) => available.get(id)?.format === "table").length > 4)
      throw dashboardError("Choose up to four query tables per dashboard.");
  }
  // One owner-scoped compare-and-swap keeps layouts and default selection atomic.
  const rows = desired.revision === "0" ? await sql`
    INSERT INTO personal_report_workspaces (user_id, dashboards, default_dashboard_id)
    VALUES (${user.id}, ${JSON.stringify(desired.dashboards)}::jsonb, ${desired.defaultDashboardId})
    ON CONFLICT (user_id) DO NOTHING
    RETURNING dashboards, default_dashboard_id, revision::text AS revision
  ` : await sql`
    UPDATE personal_report_workspaces SET dashboards = ${JSON.stringify(desired.dashboards)}::jsonb,
      default_dashboard_id = ${desired.defaultDashboardId}, revision = revision + 1, updated_at = NOW()
    WHERE user_id = ${user.id} AND revision::text = ${desired.revision}
    RETURNING dashboards, default_dashboard_id, revision::text AS revision
  `;
  if (!rows.length) throw dashboardError("Your dashboards changed in another window. Reload before saving; your draft has been retained.", 409);
  return presentWorkspace(rows[0]);
}

export async function readPersonalDashboard(user, id) {
  requireOwner(user);
  if (!isPersonalDashboardId(id)) throw dashboardError("Dashboard not found.", 404);
  const workspace = await readPersonalWorkspace(user);
  const dashboard = workspace.dashboards.find((item) => item.id === id);
  if (!dashboard) throw dashboardError("Dashboard not found.", 404);
  if (!dashboard.metricIds.length) return { dashboard, cards: [] };
  const sources = new Map((await loadMetricSources(user)).map((source) => [source.id, source]));
  const rows = await sql`SELECT * FROM report_metric_library WHERE id = ANY(${dashboard.metricIds}::uuid[])`;
  const metrics = new Map(rows.map((row) => [row.id, row]));
  const cache = new Map();
  const cards = [];
  for (const metricId of dashboard.metricIds) {
    const row = metrics.get(metricId);
    const source = sources.get(row?.source_id);
    if (!row?.published || !source?.enabled || !source.canView || source.fingerprint !== row.source_fingerprint) {
      cards.push({ id: metricId, unavailable: true });
      continue;
    }
    if (!cache.has(source.cacheKey)) cache.set(source.cacheKey, await getCachedReportSnapshot(source.cacheKey));
    cards.push({ id: metricId, metric: serializeMetric(row, source), result: presentMetricResult(source, cache.get(source.cacheKey)) });
  }
  return { dashboard, cards };
}
