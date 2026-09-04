import { describe, expect, it } from "vitest";
import {
  DASHBOARD_LIMITS,
  getDashboardValueFingerprint,
  normalizeDashboardConfiguration,
  validateDashboardConfiguration,
} from "./dashboardConfiguration";

export function dashboardFixture(count = 1) {
  return {
    version: 1,
    panels: [
      {
        key: "counts",
        title: "Counts",
        layout: "rows",
        width: "full",
        rows: Array.from({ length: count }, (_, i) => ({
          key: `r${i}`,
          label: `Row ${i}`,
        })),
        columns: [{ key: "count", label: "Count" }],
        values: Array.from({ length: count }, (_, i) => ({
          key: `v${i}`,
          rowKey: `r${i}`,
          columnKey: "count",
          source: "query_count",
          queryId: String(i + 1),
          refreshPolicy: "refreshable",
          note: "",
        })),
      },
    ],
  };
}

describe("dashboard schema", () => {
  it("accepts version 1 and canonicalizes numeric query IDs", () => {
    const data = dashboardFixture();
    data.panels[0].values[0].queryId = 123;
    expect(validateDashboardConfiguration(data)).toBe("");
    expect(
      normalizeDashboardConfiguration(data).panels[0].values[0].queryId,
    ).toBe("123");
    expect(normalizeDashboardConfiguration()).toEqual({
      version: 1,
      panels: [],
    });
  });
  it.each([0, null, -1, 1.5])(
    "accepts static %s without converting it to another value",
    (staticValue) => {
      const data = dashboardFixture();
      Object.assign(data.panels[0].values[0], {
        source: "static",
        staticValue,
      });
      expect(
        normalizeDashboardConfiguration(data).panels[0].values[0].staticValue,
      ).toBe(staticValue);
    },
  );
  it.each([undefined, "0", NaN, Infinity])(
    "rejects invalid static %s",
    (staticValue) => {
      const data = dashboardFixture();
      Object.assign(data.panels[0].values[0], {
        source: "static",
        staticValue,
      });
      expect(validateDashboardConfiguration(data)).toMatch(/Static/);
    },
  );
  it("caps query-backed values independently of batching", () => {
    expect(validateDashboardConfiguration(dashboardFixture(12))).toBe("");
    expect(validateDashboardConfiguration(dashboardFixture(13))).toMatch(
      /12 saved-query/,
    );
    expect(DASHBOARD_LIMITS.queriesPerRefresh).toBe(2);
  });
  it("rejects duplicate keys, duplicate cells and unknown dimensions", () => {
    const data = dashboardFixture(2);
    data.panels[0].values[1].key = "v0";
    expect(validateDashboardConfiguration(data)).toMatch(/unique/);
    data.panels[0].values[1].key = "v1";
    data.panels[0].values[1].rowKey = "r0";
    expect(validateDashboardConfiguration(data)).toMatch(/same cell/);
    data.panels[0].values[1].rowKey = "unknown";
    expect(validateDashboardConfiguration(data)).toMatch(/configured row/);
  });
  it("rejects unsupported versions, layouts and invisible cells", () => {
    expect(validateDashboardConfiguration({ version: 2, panels: [] })).toMatch(
      /version/,
    );
    const data = dashboardFixture(2);
    data.panels[0].layout = "metric";
    expect(validateDashboardConfiguration(data)).toMatch(/at most one/);
    data.panels[0].layout = "table";
    data.panels[0].columns = [];
    expect(validateDashboardConfiguration(data)).toMatch(/require/);
    data.panels[0].layout = "rows";
    expect(validateDashboardConfiguration(data)).toMatch(/exactly one/);
  });
  it("fingerprints only effective data sources, not freeze toggles or presentation", () => {
    const cell = dashboardFixture().panels[0].values[0];
    expect(getDashboardValueFingerprint(cell)).toBe(
      getDashboardValueFingerprint({
        ...cell,
        key: "moved",
        rowKey: "moved",
        note: "changed",
        refreshPolicy: "frozen",
      }),
    );
    expect(getDashboardValueFingerprint(cell)).not.toBe(
      getDashboardValueFingerprint({ ...cell, queryId: "2" }),
    );
    expect(
      getDashboardValueFingerprint({ source: "static", staticValue: 0 }),
    ).not.toBe(
      getDashboardValueFingerprint({ source: "static", staticValue: null }),
    );
  });
  it("rejects dimensionless metric values", () => {
    const data = dashboardFixture();
    Object.assign(data.panels[0], { layout: "metric", rows: [], columns: [] });
    expect(validateDashboardConfiguration(data)).toMatch(
      /exactly one row and one column/,
    );
  });
});
