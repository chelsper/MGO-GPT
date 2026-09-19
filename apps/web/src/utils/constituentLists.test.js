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
  ).toEqual(["portfolio-fy-giving", "lists", "alumni-family-engagement"]);
  expect(getReportHref(listMetadata("list-demo"))).toBe(
    "/reports/lists/list-demo",
  );
  expect(getReportHref(listMetadata("../../outside"))).toBe("/reports");
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
