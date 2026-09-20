export const DASHBOARDS_KEY = "dashboards";
export const DASHBOARDS_HREF = "/reports/dashboards";
export const isReportDashboard = (report) =>
  report?.key === "alumni-family-engagement" ||
  report?.configurationSchema === "query-count-dashboard-v1";

export function visibleDashboards(reports = []) {
  return reports
    .filter((report) =>
      isReportDashboard(report) && report.canView === true && report.active !== false,
    )
    .sort((a, b) => {
      if (a.key === "alumni-family-engagement") return -1;
      if (b.key === "alumni-family-engagement") return 1;
      return a.title.localeCompare(b.title);
    });
}
