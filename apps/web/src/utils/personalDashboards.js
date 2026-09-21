export const MAX_PERSONAL_DASHBOARDS = 12;
export const MAX_DASHBOARD_METRICS = 12;
export const personalDashboardHref = (id) => `/reports/personal-dashboards/${encodeURIComponent(id)}`;
export const isPersonalDashboardId = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

export function validatePersonalWorkspace(input) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["revision", "dashboards", "defaultDashboardId"].includes(key)))
    fail("Expected personal dashboard settings only.");
  if (typeof input.revision !== "string" || !/^(0|[1-9]\d{0,17})$/.test(input.revision)) fail("Reload your dashboards before saving.");
  if (!Array.isArray(input.dashboards) || input.dashboards.length > MAX_PERSONAL_DASHBOARDS)
    fail(`Save up to ${MAX_PERSONAL_DASHBOARDS} personal dashboards.`);
  const ids = new Set();
  const dashboards = input.dashboards.map((dashboard) => {
    if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard) ||
        Object.keys(dashboard).some((key) => !["id", "title", "metricIds"].includes(key))) fail("Unknown dashboard setting.");
    if (!isPersonalDashboardId(dashboard.id) || ids.has(dashboard.id)) fail("Each dashboard needs a unique identifier.");
    ids.add(dashboard.id);
    if (typeof dashboard.title !== "string" || !dashboard.title.trim() || dashboard.title.length > 120)
      fail("Enter a dashboard name of up to 120 characters.");
    if (!Array.isArray(dashboard.metricIds) || dashboard.metricIds.length > MAX_DASHBOARD_METRICS ||
        dashboard.metricIds.some((id) => !isPersonalDashboardId(id)) || new Set(dashboard.metricIds).size !== dashboard.metricIds.length)
      fail(`Choose up to ${MAX_DASHBOARD_METRICS} different metrics per dashboard.`);
    return { id: dashboard.id, title: dashboard.title.trim(), metricIds: [...dashboard.metricIds] };
  });
  if (input.defaultDashboardId !== null && (!isPersonalDashboardId(input.defaultDashboardId) || !ids.has(input.defaultDashboardId)))
    fail("Choose one of your dashboards as the default.");
  return { revision: input.revision, dashboards, defaultDashboardId: input.defaultDashboardId };
}

export function movePersonalMetric(ids, id, delta) {
  const index = ids.indexOf(id);
  const destination = index + delta;
  if (index < 0 || destination < 0 || destination >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
