import { isTechnicalDashboardQueryHeader } from "@/app/api/utils/dashboardConfiguration";

export function isQueryResultColumnVisible(header, setting) {
  if (isTechnicalDashboardQueryHeader(header)) return false;
  if (typeof setting?.visible === "boolean") return setting.visible;
  return true;
}
