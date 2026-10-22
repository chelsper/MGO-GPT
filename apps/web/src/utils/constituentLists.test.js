import { expect, it } from "vitest";
import {
  listMetadata,
  normalizeListSource,
  reportNavigation,
  validateListSource,
} from "./constituentLists";
import { getReportHref } from "@/app/api/utils/reportRegistry";

it("groups existing and configured lists under one Lists destination", () => {
  expect(
    reportNavigation([
      { key: "portfolio-fy-giving" },
      { key: "future-made-phase-ii" },
      listMetadata("list-demo"),
      { key: "alumni-family-engagement" },
    ]).map((item) => item.key),
  ).toEqual(["portfolio-fy-giving", "dashboards", "lists"]);
  expect(getReportHref(listMetadata("list-demo"))).toBe(
    "/reports/lists/list-demo",
  );
  expect(getReportHref(listMetadata("../../outside"))).toBe("/reports");
});
it("orders Reports consistently without exposing inaccessible reports or changing the source array", () => {
  const reports = [
    listMetadata("list-demo"),
    { key: "alumni-family-engagement" },
    { key: "opportunity-pipeline" },
    { key: "executive-team-standings" },
    { key: "portfolio-fy-giving" },
  ];
  const original = structuredClone(reports);
  expect(reportNavigation(reports).map((item) => item.key)).toEqual([
    "portfolio-fy-giving",
    "executive-team-standings",
    "opportunity-pipeline",
    "dashboards",
    "lists",
  ]);
  expect(reports).toEqual(original);
  expect(
    reportNavigation(reports.map((report) => ({ ...report, canView: false }))),
  ).toEqual([]);
  expect(
    reportNavigation(reports.map((report) => ({ ...report, active: false }))),
  ).toEqual([]);
});
it("supports category-only and exact-value sources without accepting arbitrary query filters", () => {
  const source = {
    version: 1,
    source: "custom_field",
    fieldCategory: " Interests ",
    fieldDescription: "",
  };
  expect(validateListSource(source)).toBe("");
  expect(normalizeListSource(source).fieldCategory).toBe("Interests");
  expect(validateListSource({ ...source, fieldCategory: "" })).not.toBe("");
  expect(validateListSource({ ...source, queryId: "123" })).not.toBe("");
  expect(validateListSource({ ...source, fieldDescription: {} })).not.toBe("");
});
