import { describe, expect, it } from "vitest";
import {
  createCustomFieldReportSlug,
  customFieldReportCacheKey,
  normalizeCustomFieldReportInput,
  serializeCustomFieldReport,
  validateCustomFieldReportInput,
} from "./customFieldReports";

describe("Custom Field Report configuration", () => {
  it("normalizes user access and accepts a complete enabled report", () => {
    const input = normalizeCustomFieldReportInput({
      title: "  Future. Made. Phase II  ",
      fieldCategory: " Prospect Research ",
      fieldDescription: " Future. Made. Phase II ",
      sourceQueryId: "30969",
      specificUserIds: [7, "12", 7, "invalid"],
      active: true,
    });

    expect(input.specificUserIds).toEqual([7, 12]);
    expect(validateCustomFieldReportInput(input)).toBe("");
  });

  it("requires both a numeric saved query ID and users before enabling", () => {
    expect(
      validateCustomFieldReportInput({
        title: "Configured report",
        fieldCategory: "Prospect Research",
        fieldDescription: "Future. Made. Phase II",
        sourceQueryId: "saved-query",
        active: false,
      }),
    ).toMatch(/numeric saved NXT query/i);

    expect(
      validateCustomFieldReportInput({
        title: "Configured report",
        fieldCategory: "Prospect Research",
        fieldDescription: "Future. Made. Phase II",
        sourceQueryId: "30969",
        active: true,
        specificUserIds: [],
      }),
    ).toMatch(/at least one active user/i);
  });

  it("uses stable report cache keys and URL-safe slugs", () => {
    expect(createCustomFieldReportSlug("Alumni & Family / FY27", "abc")).toBe(
      "alumni-family-fy27-abc",
    );
    expect(customFieldReportCacheKey("alumni-family-fy27-abc")).toBe(
      "report:custom-field:alumni-family-fy27-abc",
    );
  });

  it("classifies generated reports as Custom Field Reports with a constrained route", () => {
    const report = serializeCustomFieldReport({
      id: 7,
      slug: "future-made-phase-ii-abc",
      title: "Future. Made. Phase II",
    });

    expect(report.reportType).toBe("custom_field");
    expect(report.configurationSchema).toBe("custom-field-report-v1");
    expect(report.href).toBe("/reports/custom-field/future-made-phase-ii-abc");
  });
});
