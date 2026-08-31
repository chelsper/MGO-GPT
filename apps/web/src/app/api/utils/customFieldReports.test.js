import { describe, expect, it } from "vitest";
import {
  createCustomFieldReportSlug,
  customFieldReportCacheKey,
  normalizeCustomFieldReportInput,
  serializeCustomFieldReport,
  validateCustomFieldReportInput,
} from "./customFieldReports";

describe("Custom Field Report configuration", () => {
  it("normalizes user access and accepts a direct custom-field report", () => {
    const input = normalizeCustomFieldReportInput({
      title: "  Future. Made. Phase II  ",
      fieldCategory: " Prospect Research ",
      fieldDescription: " Future. Made. Phase II ",
      specificUserIds: [7, "12", 7, "invalid"],
      active: true,
    });

    expect(input.specificUserIds).toEqual([7, 12]);
    expect(validateCustomFieldReportInput(input)).toBe("");
  });

  it("only validates a saved-query ID when a legacy report provides one", () => {
    expect(
      validateCustomFieldReportInput({
        title: "Configured report",
        fieldCategory: "Prospect Research",
        fieldDescription: "Future. Made. Phase II",
        sourceQueryId: "saved-query",
        active: false,
      }),
    ).toMatch(/legacy saved NXT query/i);

    expect(
      validateCustomFieldReportInput({
        title: "Configured report",
        fieldCategory: "Prospect Research",
        fieldDescription: "Future. Made. Phase II",
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
    expect(report.dataSource).toBe("direct_custom_field");
    expect(report.resultMode).toBe("count_only");
  });

  it("keeps the saved-query presentation for legacy reports", () => {
    const report = serializeCustomFieldReport({
      id: 8,
      slug: "legacy-custom-field-report",
      title: "Legacy Custom Field Report",
      source_query_id: "30969",
    });

    expect(report.dataSource).toBe("legacy_saved_query");
    expect(report.resultMode).toBe("rows");
    expect(report.sourceQueryId).toBe("30969");
  });
});
