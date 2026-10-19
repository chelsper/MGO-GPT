import { expect, it } from "vitest";
import { getReportDefinition, getReportHref } from "@/app/api/utils/reportRegistry";
import { visibleDashboards } from "./reportDashboards";
it("registers FY Revenue Goals as a restricted dashboard and preserves its destination", () => {
  const definition = getReportDefinition("fy-revenue-goals");
  expect(definition.defaultVisibility).toBe("specific_users");
  expect(getReportHref(definition)).toBe("/reports/dashboards/fy-revenue-goals");
  expect(visibleDashboards([{ ...definition, canView: true }])).toHaveLength(1);
  expect(visibleDashboards([{ ...definition, canView: false }])).toHaveLength(0);
});
