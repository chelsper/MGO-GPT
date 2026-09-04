import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/dashboardQueryCount", () => ({
  DASHBOARD_COUNT_SOURCE: "strict-csv-row-count-v1",
  runDashboardQueryCount: vi.fn(),
}));
vi.mock("@/app/api/utils/dashboardQueryResults", () => ({
  runDashboardQueryResults: vi.fn(),
}));
import {
  getDashboardTableFingerprint,
  isValidDashboardTableData,
  normalizeDashboardConfiguration,
  validateDashboardConfiguration,
} from "./dashboardConfiguration";
import {
  presentDashboardSnapshot,
  publicDashboardSnapshot,
  refreshDashboardSnapshot,
} from "./dashboardSnapshots";

const panel = (key = "ppc", queryId = "30971", patch = {}) => ({
  key,
  title: "PPC 2026-27",
  layout: "query_results",
  width: "half",
  queryId,
  refreshPolicy: "refreshable",
  columnSettings: [],
  rows: [],
  columns: [],
  values: [],
  ...patch,
});
const config = (...panels) => ({ version: 1, panels });
const data = {
  headers: ["PPC Member Name", "Total Giving FY27"],
  rows: [
    ["Sample Member", "$0.00"],
    ["Another Member", "$1,050.00"],
  ],
  dataSource: "query-results-csv-v1",
};
const refresh = (
  configuration,
  cached = null,
  executeTableQuery = vi.fn().mockResolvedValue(data),
  executeQuery = vi.fn().mockResolvedValue({ value: 139 }),
) =>
  refreshDashboardSnapshot({
    configuration,
    cached,
    executeTableQuery,
    executeQuery,
    user: { id: 1 },
    origin: "https://example.test",
  });

describe("query results table schema", () => {
  it("normalizes a query ID without manually configuring output rows or columns", () => {
    const value = config(
      panel("p", 30971, {
        columnSettings: [
          { header: "Total Giving FY27", label: "Giving", format: "currency" },
        ],
      }),
    );
    expect(validateDashboardConfiguration(value)).toBe("");
    expect(normalizeDashboardConfiguration(value).panels[0]).toMatchObject({
      queryId: "30971",
      rows: [],
      columns: [],
      values: [],
      columnSettings: [
        { header: "Total Giving FY27", label: "Giving", format: "currency" },
      ],
    });
  });
  it("rejects manual cells, duplicate header settings, invalid formats, and invalid query IDs", () => {
    for (const patch of [
      { queryId: "bad" },
      { rows: [{ key: "r", label: "r" }] },
      { values: [{ key: "c", source: "static", staticValue: 3 }] },
      { columnSettings: [{ header: "Name" }, { header: "Name" }] },
      { columnSettings: [{ header: "Giving", format: "html" }] },
    ]) {
      expect(
        validateDashboardConfiguration(config(panel("p", "30971", patch))),
      ).not.toBe("");
    }
  });
  it("enforces table limits and the shared 12-query budget", () => {
    expect(
      validateDashboardConfiguration(
        config(...Array.from({ length: 5 }, (_, i) => panel(`p${i}`))),
      ),
    ).toContain("4 query results tables");
    const counts = {
      key: "counts",
      title: "Counts",
      layout: "rows",
      width: "half",
      rows: [{ key: "r", label: "Count" }],
      columns: [{ key: "c", label: "Value" }],
      values: Array.from({ length: 12 }, (_, i) => ({
        key: `v${i}`,
        rowKey: `r${i}`,
        columnKey: "c",
        source: "query_count",
        queryId: "30976",
      })),
    };
    counts.rows = counts.values.map((v, i) => ({
      key: v.rowKey,
      label: `Year ${i}`,
    }));
    expect(validateDashboardConfiguration(config(counts, panel()))).toContain(
      "12 saved-query",
    );
  });
  it("validates stored rows and keeps presentation out of source identity", () => {
    expect(isValidDashboardTableData(data)).toBe(true);
    expect(isValidDashboardTableData({ ...data, rows: [] })).toBe(true);
    for (const invalid of [
      { ...data, rows: null },
      { ...data, rows: [["Name"]] },
      { headers: ["", "Giving"], rows: [] },
      { headers: ["Name", "Name"], rows: [] },
      { ...data, rows: [[{}, "0"]] },
      { ...data, rows: Array(1001).fill(["Sample", "0"]) },
    ])
      expect(isValidDashboardTableData(invalid)).toBe(false);
    expect(getDashboardTableFingerprint(panel())).toBe(
      getDashboardTableFingerprint(
        panel("p", "30971", {
          title: "New title",
          width: "full",
          refreshPolicy: "frozen",
          columnSettings: [{ header: "Total Giving FY27", format: "currency" }],
        }),
      ),
    );
    expect(getDashboardTableFingerprint(panel())).not.toBe(
      getDashboardTableFingerprint(panel("p", "30976")),
    );
  });
});

describe("query results table snapshots", () => {
  it("keeps ordinary visits snapshot-only and retains both columns including zero", async () => {
    const configuration = config(panel());
    expect(presentDashboardSnapshot(configuration, null)).toMatchObject({
      status: "refresh_required",
      tables: [{ rows: null, status: "missing" }],
    });
    const execute = vi.fn().mockResolvedValue(data);
    const saved = await refresh(configuration, null, execute);
    expect(execute).toHaveBeenCalledWith({
      user: { id: 1 },
      origin: "https://example.test",
      queryId: "30971",
    });
    expect(saved.tables[0]).toMatchObject({
      ...data,
      key: "ppc",
      status: "ready",
    });
    expect(
      presentDashboardSnapshot(configuration, saved).tables[0].rows,
    ).toEqual(data.rows);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(publicDashboardSnapshot(saved)).not.toHaveProperty("refreshState");
  });
  it("treats a header-only query as a successful empty table, not missing data", async () => {
    const configuration = config(panel());
    const saved = await refresh(
      configuration,
      null,
      vi.fn().mockResolvedValue({ ...data, rows: [] }),
    );
    expect(saved).toMatchObject({
      status: "complete",
      tables: [{ headers: data.headers, rows: [], status: "ready" }],
    });
  });
  it("retains a good table on failure and never logs donor data or URLs in errors", async () => {
    const configuration = config(panel());
    const saved = await refresh(configuration);
    const failed = await refresh(
      configuration,
      saved,
      vi.fn().mockRejectedValue(new Error("SECRET_URL donor payload")),
    );
    expect(failed.tables[0]).toMatchObject({
      rows: data.rows,
      status: "stale",
      refreshedAt: saved.tables[0].refreshedAt,
    });
    expect(failed.status).toBe("partial");
    expect(JSON.stringify(failed)).not.toContain("SECRET_URL");
    const malformed = await refresh(
      configuration,
      saved,
      vi
        .fn()
        .mockResolvedValue({ headers: ["Name"], rows: [["broken", "extra"]] }),
    );
    expect(malformed.tables[0]).toMatchObject({
      rows: data.rows,
      status: "stale",
    });
  });
  it("reuses frozen tables, including empty ones, but invalidates changed query IDs", async () => {
    const configuration = config(panel());
    const saved = await refresh(configuration);
    const execute = vi.fn().mockRejectedValue(new Error("failure"));
    configuration.panels[0].refreshPolicy = "frozen";
    configuration.panels[0].columnSettings = [
      { header: "Total Giving FY27", format: "currency" },
    ];
    const frozen = await refresh(configuration, saved, execute);
    expect(execute).not.toHaveBeenCalled();
    expect(frozen.tables[0]).toMatchObject({
      rows: data.rows,
      frozenAt: saved.tables[0].refreshedAt,
    });
    configuration.panels[0].queryId = "30972";
    const changed = await refresh(configuration, frozen, execute);
    expect(changed.tables[0]).toMatchObject({
      rows: null,
      headers: [],
      status: "missing",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("shares a two-query budget with counts and resumes tables without recounting", async () => {
    const configuration = config(
      {
        key: "counts",
        values: [{ key: "v", source: "query_count", queryId: "30971" }],
      },
      panel("a"),
      panel("b", "30972"),
    );
    const tables = vi.fn().mockResolvedValue(data);
    const counts = vi.fn().mockResolvedValue({ value: 19 });
    const first = await refresh(configuration, null, tables, counts);
    expect(first).toMatchObject({
      refreshStatus: "pending",
      remainingQueryCount: 1,
      values: [{ value: 19 }],
      tables: [{ rows: data.rows }, { rows: null }],
    });
    const next = await refresh(configuration, first, tables, counts);
    expect(next.refreshStatus).toBe("complete");
    expect(next.tables[1].rows).toEqual(data.rows);
    expect(counts).toHaveBeenCalledTimes(1);
    expect(tables).toHaveBeenCalledTimes(2);
  });
  it("reuses duplicate table queries within a batch and reconciles source edits", async () => {
    const configuration = config(
      panel("a"),
      panel("b", "30972"),
      panel("c", "30973"),
      panel("d"),
    );
    const execute = vi.fn().mockResolvedValue(data);
    const first = await refresh(configuration, null, execute);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(first.tables[3].rows).toEqual(data.rows);
    configuration.panels[0].queryId = "30974";
    const next = await refresh(configuration, first, execute);
    expect(next.refreshStatus).toBe("complete");
    expect(execute.mock.calls.map(([args]) => args.queryId)).toEqual([
      "30971",
      "30972",
      "30974",
      "30973",
    ]);
    expect(next.tables[1].refreshedAt).toBe(first.tables[1].refreshedAt);
  });
  it("does not reuse numeric count snapshots or corrupt table data as a table", () => {
    const configuration = config(panel());
    const bad = {
      tables: [
        {
          key: "ppc",
          definitionFingerprint: getDashboardTableFingerprint(panel()),
          dataSource: "query-results-csv-v1",
          headers: ["Name"],
          rows: [["extra", "column"]],
        },
      ],
    };
    expect(
      presentDashboardSnapshot(configuration, bad).tables[0].rows,
    ).toBeNull();
    const count = { values: [{ key: "ppc", value: 19 }] };
    expect(
      presentDashboardSnapshot(configuration, count).tables[0].rows,
    ).toBeNull();
  });
});
