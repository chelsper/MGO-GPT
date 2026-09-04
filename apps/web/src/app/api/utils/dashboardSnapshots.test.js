import { beforeEach, describe, expect, it, vi } from "vitest";
const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/dashboardQueryCount", () => ({
  DASHBOARD_COUNT_SOURCE: "strict-csv-row-count-v1",
  runDashboardQueryCount: vi.fn(),
}));
import {
  presentDashboardSnapshot,
  refreshDashboardSnapshot,
  saveDashboardSnapshot,
} from "./dashboardSnapshots";

const config = (...values) => ({
  version: 1,
  panels: [
    {
      key: "p",
      title: "Panel",
      values: values.map((cell, i) => ({
        key: `v${i}`,
        source: "query_count",
        queryId: String(i + 1),
        refreshPolicy: "refreshable",
        ...cell,
      })),
    },
  ],
});
const run = (
  configuration,
  cached,
  executeQuery = vi.fn().mockResolvedValue({ value: 7 }),
) =>
  refreshDashboardSnapshot({
    configuration,
    cached,
    executeQuery,
    user: { id: 1 },
    origin: "https://example.test",
  });

describe("dashboard snapshots", () => {
  beforeEach(() => vi.clearAllMocks());
  it("distinguishes static zero from unknown without executing queries", async () => {
    const data = config(
      { source: "static", staticValue: 0 },
      { source: "static", staticValue: null },
    );
    const execute = vi.fn();
    const snapshot = await run(data, null, execute);
    expect(snapshot.values.map((v) => v.value)).toEqual([0, null]);
    expect(snapshot.values.map((v) => v.status)).toEqual(["ready", "missing"]);
    expect(execute).not.toHaveBeenCalled();
  });
  it("GET-style presentation never populates a missing query count with zero", () => {
    expect(presentDashboardSnapshot(config({}), null).values[0]).toMatchObject({
      value: null,
      status: "missing",
    });
  });
  it("reuses frozen zero and retains timestamps without new query execution", async () => {
    const data = config({});
    const cached = await run(
      data,
      null,
      vi.fn().mockResolvedValue({ value: 0 }),
    );
    data.panels[0].values[0].refreshPolicy = "frozen";
    data.panels[0].title = "Retitled";
    const execute = vi.fn();
    const next = await run(data, cached, execute);
    expect(next.values[0]).toMatchObject({
      value: 0,
      frozenAt: cached.values[0].refreshedAt,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(next.refreshMetrics.frozenSnapshotsReused).toBe(1);
  });
  it("retains last successes/frozen values on failures, but not incompatible sources", async () => {
    const data = config({}, { refreshPolicy: "frozen" });
    const cached = await run(data, null);
    const failed = vi
      .fn()
      .mockRejectedValue(new Error("secret signed URL and donor data"));
    const next = await run(data, cached, failed);
    expect(next.values.map((v) => v.value)).toEqual([7, 7]);
    expect(next.values.map((v) => v.status)).toEqual(["stale", "ready"]);
    expect(JSON.stringify(next)).not.toContain("secret");
    data.panels[0].values[0].queryId = "999";
    const changed = await run(data, next, failed);
    expect(changed.values[0]).toMatchObject({ value: null, status: "missing" });
    expect(
      presentDashboardSnapshot(data, changed).values[0].error,
    ).toBeTruthy();
  });
  it("checkpoints two unique queries per request and continues without rerunning successes", async () => {
    const data = config({}, {}, {}, {});
    const execute = vi
      .fn()
      .mockImplementation(async ({ queryId }) => ({ value: Number(queryId) }));
    const first = await run(data, null, execute);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({
      refreshStatus: "pending",
      remainingQueryCount: 2,
    });
    expect(presentDashboardSnapshot(data, first).refreshStatus).toBe("pending");
    const second = await run(data, first, execute);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(second).toMatchObject({
      refreshStatus: "complete",
      remainingQueryCount: 0,
    });
    expect(second.values.map((v) => v.value)).toEqual([1, 2, 3, 4]);
  });
  it("reuses duplicate query results in one cycle and does not retry duplicates after failure", async () => {
    const data = config(
      { queryId: "1" },
      { queryId: "2" },
      { queryId: "3" },
      { queryId: "1" },
    );
    const execute = vi.fn().mockResolvedValue({ value: 42 });
    const first = await run(data, null, execute);
    expect(first.values[3].value).toBe(42);
    expect(first.remainingQueryCount).toBe(1);
    await run(data, first, execute);
    expect(execute).toHaveBeenCalledTimes(3);
    const fail = vi.fn().mockRejectedValue(new Error("failed"));
    await run(config({ queryId: "1" }, { queryId: "1" }), null, fail);
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it("reconciles changed sources without restarting unchanged successful members", async () => {
    const data = config({}, {}, {});
    const first = await run(data, null);
    data.panels[0].title = "New title";
    expect(presentDashboardSnapshot(data, first).refreshStatus).toBe("pending");
    data.panels[0].values[0].queryId = "999";
    expect(presentDashboardSnapshot(data, first).remainingQueryCount).toBe(2);
    expect(presentDashboardSnapshot(data, first).values[0].value).toBeNull();
    const execute = vi.fn().mockResolvedValue({ value: 9 });
    const next = await run(data, first, execute);
    expect(execute.mock.calls.map(([args]) => args.queryId)).toEqual([
      "999",
      "3",
    ]);
    expect(next.values[1].refreshedAt).toBe(first.values[1].refreshedAt);
  });
  it("conditionally saves checkpoints and reports concurrent writer conflicts", async () => {
    sqlMock
      .mockResolvedValueOnce([{ report_key: "key" }])
      .mockResolvedValueOnce([]);
    expect(await saveDashboardSnapshot("key", { values: [] }, null)).toBe(true);
    expect(
      await saveDashboardSnapshot("key", { values: [] }, { values: [] }),
    ).toBe(false);
    expect(sqlMock.mock.calls[1][0].join(" ")).toMatch(/AND payload =/);
  });
  it("shows manual provenance without a frozen label, including zero", async () => {
    const data = config({
      source: "static",
      staticValue: 0,
      refreshPolicy: "frozen",
    });
    const provenance = {
      v0: {
        updatedAt: "2026-09-01T12:00:00.000Z",
        updatedBy: { id: 1, name: "Manager" },
      },
    };
    const snapshot = await refreshDashboardSnapshot({
      configuration: data,
      staticValueProvenance: provenance,
      executeQuery: vi.fn(),
    });
    expect(snapshot.values[0]).toMatchObject({
      value: 0,
      frozenAt: null,
      asOf: provenance.v0.updatedAt,
      updatedBy: provenance.v0.updatedBy,
      provenance: "manual",
    });
  });
  it("does not erase a failure warning when freezing a stale value mid-cycle", async () => {
    const data = config({}, {}, {});
    const first = await run(data, null);
    const complete = await run(data, first);
    const failed = await run(
      data,
      complete,
      vi.fn().mockRejectedValue(new Error("fail")),
    );
    expect(failed.refreshStatus).toBe("pending");
    data.panels[0].values[0].refreshPolicy = "frozen";
    const next = await run(data, failed);
    expect(next.values[0]).toMatchObject({ value: 7, status: "stale" });
    expect(next.values[0].error).toBeTruthy();
    expect(next.status).toBe("partial");
  });
});
