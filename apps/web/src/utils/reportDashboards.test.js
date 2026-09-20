import { expect, it } from "vitest";
import { isReportDashboard, visibleDashboards } from "./reportDashboards";
import { reportNavigation } from "./constituentLists";
import { getReportHref } from "@/app/api/utils/reportRegistry";

const dashboard = (key, extra = {}) => ({ key, title: key, configurationSchema: "query-count-dashboard-v1", canView: true, active: true, ...extra });
const alumni = { key: "alumni-family-engagement", title: "Engagement", canView: true };

it("identifies dashboard kinds, not all query reports or arbitrary URLs", () => {
  expect(isReportDashboard(alumni)).toBe(true);
  expect(isReportDashboard(dashboard("custom"))).toBe(true);
  for (const report of [null, { key: "future-made-phase-ii" }, { key: "portfolio-fy-giving" }, { reportType: "query_based" }, { href: "/reports/dashboards/fake" }]) {
    expect(isReportDashboard(report)).toBe(false);
  }
});

it("shows only authorized enabled dashboards, with Alumni first, without mutating configuration order", () => {
  const reports = [dashboard("Zebra"), dashboard("Hidden", { canView: false }), dashboard("Draft", { active: false }), dashboard("Unknown", { canView: undefined }), dashboard("Alpha"), alumni];
  const original = [...reports];
  expect(visibleDashboards(reports).map((report) => report.key)).toEqual([alumni.key, "Alpha", "Zebra"]);
  expect(reports).toEqual(original);
  expect(visibleDashboards()).toEqual([]);
});

it("groups dashboards under one destination while preserving other report destinations", () => {
  expect(reportNavigation([
    { key: "portfolio-fy-giving" }, { key: "future-made-phase-ii" },
    { key: "executive-team-standings" }, alumni, dashboard("custom"),
  ]).map((item) => item.key)).toEqual(["portfolio-fy-giving", "lists", "executive-team-standings", "dashboards"]);
  expect(getReportHref(reportNavigation([alumni])[0])).toBe("/reports/dashboards");
  expect(getReportHref(alumni)).toBe("/reports/alumni-family-engagement");
  expect(getReportHref(dashboard("custom"))).toBe("/reports/dashboards/custom");
  expect(getReportHref(dashboard("dashboards"))).toBe("/reports/dashboards/dashboards");
  expect(getReportHref(dashboard("../../outside"))).toBe("/reports");
  expect(reportNavigation([dashboard("Draft", { active: false }), { ...alumni, canView: false }])).toEqual([]);
  expect(reportNavigation([dashboard("custom")])[0].title).toBe("My Dashboards");
});
