import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { sql, cached } = vi.hoisted(() => ({ sql: vi.fn(), cached: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./reportCache", () => ({ getCachedReportSnapshot: cached }));
import { buildMetricSources, presentMetricResult, metricSourceMetadata } from "./reportMetricSources";
import { getDashboardTableFingerprint, getDashboardValueFingerprint } from "./dashboardConfiguration";
import { getAlumniDonorCountRowFingerprint } from "./alumniDonorConfiguration";
import { listMetricLibrary, readMetricLibraryResult, saveMetricLibraryEntry, validateMetricDraft } from "./reportMetricLibrary";

const manager = { id: 1, active: true, role: "admin" };
const viewer = { id: 2, active: true, role: "mgo" };
const id = "12345678-1234-1234-1234-123456789abc";
const panel = (source = "query_count") => ({ key: "counts", title: "Alumni donors", layout: "metric", width: "half",
  rows: [{ key: "row", label: "FY27" }], columns: [{ key: "col", label: "Donors" }],
  values: [{ key: "value", rowKey: "row", columnKey: "col", source, queryId: "123", staticValue: source === "static" ? 125.25 : null }] });
const table = () => ({ key: "members", title: "Members", layout: "query_results", width: "full", queryId: "456", columnSettings: [{ header: "Amount", format: "currency" }] });
const report = (panels = [panel()]) => ({ id: "10", report_key: "dashboard-demo", configuration_kind: "dashboard", title: "Engagement", active: true, specific_user_ids: [2], data_configuration: { version: 1, panels } });
const sourceOf = (record = report(), user = manager) => buildMetricSources([record], user).find((source) => source.reportKey === record.report_key);
const rowOf = (source = sourceOf(), changes = {}) => ({ id, source_id: source.id, source_fingerprint: source.fingerprint,
  title: "FY27 donors", description: "Distinct donors", display_format: "number", published: true, revision: "2026-09-20 10:00:00+00", ...changes });
const bodyOf = (source = sourceOf(), changes = {}) => ({ title: " FY27 donors ", description: "Distinct donors", sourceId: source.id, sourceFingerprint: source.fingerprint, format: "number", published: false, ...changes });
let reports, rows;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network permitted"); }));
  reports = [report()]; rows = [rowOf()]; cached.mockResolvedValue(null);
  sql.mockImplementation(async (parts) => {
    const query = parts.join("?");
    if (query.includes("FROM report_configurations")) return reports;
    if (query.includes("SELECT") && query.includes("FROM report_metric_library")) return rows;
    throw new Error("Unexpected SQL write");
  });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("source adapters", () => {
  it("discovers built-in, generic count, manual and table sources without exposing results in metadata", () => {
    const sources = buildMetricSources([report([panel(), { ...panel("static"), key: "manual", values: [{ ...panel("static").values[0], key: "manualvalue" }] }, table()])], manager);
    expect(sources.map((source) => source.sourceType)).toEqual(["query_count", "query_count", "query_count", "static", "query_table"]);
    for (const source of sources) {
      const metadata = metricSourceMetadata(source);
      expect(metadata).not.toHaveProperty("definition");
      expect(metadata).not.toHaveProperty("provenance");
      expect(metadata).not.toHaveProperty("configuration");
      expect(metadata.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it("preserves source identity through labels, order, policy and normal manual-value edits", () => {
    const original = sourceOf();
    const changed = report([{ ...panel(), title: "New title", values: [{ ...panel().values[0], refreshPolicy: "frozen" }] }]);
    expect(sourceOf(changed).fingerprint).toBe(original.fingerprint);
    const manual = panel("static");
    const updated = structuredClone(manual); updated.values[0].staticValue = 200;
    expect(sourceOf(report([manual])).fingerprint).toBe(sourceOf(report([updated])).fingerprint);
    updated.values[0] = { ...updated.values[0], source: "query_count", queryId: "123" };
    expect(sourceOf(report([manual])).fingerprint).not.toBe(sourceOf(report([updated])).fingerprint);
  });
  it("invalidates changed queries and deleted/recreated source reports", () => {
    const original = sourceOf();
    const changed = report(); changed.data_configuration.panels[0].values[0].queryId = "999";
    expect(sourceOf(changed).fingerprint).not.toBe(original.fingerprint);
    expect(sourceOf({ ...report(), id: "11" }).fingerprint).not.toBe(original.fingerprint);
  });
  it("honors the original access policy and disabled sources, with no general-dashboard admin bypass", () => {
    expect(sourceOf(report(), manager).canView).toBe(false);
    expect(sourceOf(report(), viewer).canView).toBe(true);
    expect(sourceOf({ ...report(), active: false }, viewer).canView).toBe(false);
    expect(sourceOf(report(), { ...viewer, active: false }).canView).toBe(false);
    const alumni = { report_key: "alumni-family-engagement", visibility: "specific_users", specific_user_ids: [9] };
    expect(sourceOf(alumni, viewer).canView).toBe(false);
    expect(sourceOf(alumni, manager).canView).toBe(true);
  });
  it("does not guess sources from malformed dashboard definitions", () => {
    expect(buildMetricSources([{ ...report(), data_configuration: { version: 2 } }], manager).some((source) => source.reportKey === "dashboard-demo")).toBe(false);
  });
  it("uses only matching completed alumni CSV totals, including zero and frozen dates", () => {
    const source = buildMetricSources([], manager)[0];
    const total = { key: source.valueKey, panelKey: source.panelKey, total: 0,
      countSource: "query-result-csv-row-count-v3", definitionFingerprint: getAlumniDonorCountRowFingerprint(source.dashboard, source.definition), frozenAt: "2026-09-01T00:00:00Z" };
    expect(presentMetricResult(source, { totals: [total] })).toMatchObject({ value: 0, status: "ready", asOf: "2026-09-01T00:00:00.000Z" });
    for (const changes of [{ countSource: "job-row-count" }, { definitionFingerprint: "old" }, { total: null }, { total: -1 }, { total: "10" }, { panelKey: "wrong" }])
      expect(presentMetricResult(source, { totals: [{ ...total, ...changes }] })).toMatchObject({ value: null, status: "missing" });
  });
  it("preserves query value provenance and stale compatible results, not snapshot generation time", () => {
    const source = sourceOf();
    const snapshot = { generatedAt: "2026-09-20T00:00:00Z", values: [{ key: "value", value: 14, countSource: "strict-csv-row-count-v1",
      definitionFingerprint: getDashboardValueFingerprint(source.definition), refreshedAt: "2026-09-18T00:00:00Z", error: "provider details must not leak" }] };
    const value = presentMetricResult(source, snapshot);
    expect(value).toMatchObject({ value: 14, status: "stale", asOf: "2026-09-18T00:00:00.000Z" });
    expect(JSON.stringify(value)).not.toContain("provider");
    snapshot.values[0].definitionFingerprint = "old";
    expect(presentMetricResult(source, snapshot)).toMatchObject({ value: null, status: "missing" });
  });
  it("reads current manual values and bound generic Alumni tables without mixing interpretations", () => {
    expect(presentMetricResult(sourceOf(report([panel("static")])), null)).toMatchObject({ value: 125.25, provenance: "manual" });
    const alumni = { report_key: "alumni-family-engagement", data_configuration: { dashboardVersion: 2, panels: [table()] } };
    const source = sourceOf(alumni);
    const saved = { key: "members", headers: ["Name", "Amount"], rows: [["Example", "100"]], dataSource: "query-results-csv-v1", definitionFingerprint: getDashboardTableFingerprint(table()), refreshedAt: "2026-09-01T00:00:00Z" };
    expect(presentMetricResult(source, { genericSnapshot: { tables: [saved] } })).toMatchObject({ type: "table", rows: [["Example", "100"]], columnSettings: [{ header: "Amount", label: "", format: "currency" }] });
    expect(presentMetricResult(source, { tables: [saved] })).toMatchObject({ status: "missing", rows: null });
  });
});

describe("library access and persistence", () => {
  it("lists manager source metadata without any snapshot reads", async () => {
    const result = await listMetricLibrary(manager, true);
    expect(result.entries[0]).toMatchObject({ id, status: "available", revision: rows[0].revision });
    expect(result.sources.length).toBeGreaterThan(0);
    expect(cached).not.toHaveBeenCalled();
    expect(sql.mock.calls.every(([parts]) => parts.join("").includes("SELECT"))).toBe(true);
  });
  it("reader discovery includes only published authorized compatible metrics and hides configuration", async () => {
    expect((await listMetricLibrary(manager)).entries).toEqual([]);
    expect((await listMetricLibrary(viewer)).entries).toEqual([{ id, title: "FY27 donors", description: "Distinct donors", format: "number", published: true, status: "available" }]);
    rows[0].published = false; expect((await listMetricLibrary(viewer)).entries).toEqual([]);
    rows[0].published = true; rows[0].source_fingerprint = "old";
    expect((await listMetricLibrary(viewer)).entries).toEqual([]);
    expect(cached).not.toHaveBeenCalled();
  });
  it("rechecks access on every value read; disabling or revoking blocks cache retrieval", async () => {
    expect(await readMetricLibraryResult(viewer, id)).toMatchObject({ result: { value: null, status: "missing" } });
    expect(cached).toHaveBeenCalledWith("report:dashboard:dashboard-demo"); cached.mockClear();
    reports[0].specific_user_ids = [];
    await expect(readMetricLibraryResult(viewer, id)).rejects.toMatchObject({ status: 404 });
    reports[0].specific_user_ids = [2]; reports[0].active = false;
    await expect(readMetricLibraryResult(viewer, id)).rejects.toMatchObject({ status: 404 });
    expect(cached).not.toHaveBeenCalled();
  });
  it("allows explicit manager preview, not a public admin bypass or reader preview", async () => {
    rows[0].published = false; reports[0].active = false;
    await expect(readMetricLibraryResult(manager, id)).rejects.toMatchObject({ status: 404 });
    await expect(readMetricLibraryResult(viewer, id, true)).rejects.toMatchObject({ status: 403 });
    expect(await readMetricLibraryResult(manager, id, true)).toMatchObject({ result: { status: "missing" } });
    expect(cached).toHaveBeenCalledTimes(1);
  });
  it("stops before reading snapshots when a source was changed or removed", async () => {
    rows[0].source_fingerprint = "old";
    expect(await readMetricLibraryResult(manager, id, true)).toMatchObject({ metric: { status: "source_changed" }, result: null });
    reports = [];
    expect(await readMetricLibraryResult(manager, id, true)).toMatchObject({ metric: { status: "source_missing" }, result: null });
    expect(cached).not.toHaveBeenCalled();
  });
  it("blocks inactive accounts and unauthorized management even at the service boundary", async () => {
    await expect(listMetricLibrary({ ...manager, active: false }, true)).rejects.toMatchObject({ status: 403 });
    await expect(listMetricLibrary(viewer, true)).rejects.toMatchObject({ status: 403 });
    await expect(saveMetricLibraryEntry(viewer, bodyOf(), true)).rejects.toMatchObject({ status: 403 });
    expect(sql).not.toHaveBeenCalled();
  });
  it("creates only a reference, not a report, query, schedule or snapshot", async () => {
    sql.mockResolvedValueOnce(reports).mockResolvedValueOnce([rowOf(sourceOf(), { published: false })]);
    const entry = await saveMetricLibraryEntry(manager, bodyOf(), true);
    expect(entry.published).toBe(false);
    const call = sql.mock.calls[1];
    expect(call[0].join("")).toContain("INSERT INTO report_metric_library");
    expect(call).toContain("FY27 donors");
    expect(call).not.toContain("123");
    expect(sql).toHaveBeenCalledTimes(2); expect(cached).not.toHaveBeenCalled();
  });
  it("uses compare-and-swap for edits/unpublishing and reports concurrent saves", async () => {
    sql.mockResolvedValueOnce(reports).mockResolvedValueOnce([]);
    await expect(saveMetricLibraryEntry(manager, { ...bodyOf(), id, revision: rows[0].revision }, false)).rejects.toMatchObject({ status: 409 });
    expect(sql.mock.calls[1][0].join("")).toContain("updated_at::text =");
    expect(sql.mock.calls[1]).toContain(false);
  });
  it("handles repeated create attempts as a source conflict instead of duplicating work", async () => {
    sql.mockResolvedValueOnce(reports).mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }));
    await expect(saveMetricLibraryEntry(manager, bodyOf(), true)).rejects.toMatchObject({ status: 409 });
  });
  it("allows retiring a missing source without approving a replacement or touching snapshots", async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...rows[0], published: false }]);
    const entry = await saveMetricLibraryEntry(manager, { ...bodyOf(), id, revision: rows[0].revision }, false);
    expect(entry).toMatchObject({ published: false, status: "source_missing" });
    expect(sql.mock.calls[1][0].join("")).toContain("source_id =");
    expect(sql.mock.calls[1][0].join("")).toContain("source_fingerprint =");
    expect(cached).not.toHaveBeenCalled();
  });
  it("rejects stale source selections, disabled publishing, and currency counts", async () => {
    await expect(saveMetricLibraryEntry(manager, bodyOf(sourceOf(), { sourceFingerprint: "a".repeat(64) }), true)).rejects.toMatchObject({ status: 409 });
    await expect(saveMetricLibraryEntry(manager, bodyOf(sourceOf(), { format: "currency" }), true)).rejects.toMatchObject({ status: 400 });
    reports[0].active = false;
    await expect(saveMetricLibraryEntry(manager, bodyOf(sourceOf(), { published: true }), true)).rejects.toMatchObject({ status: 409 });
    expect(sql.mock.calls.every(([parts]) => parts.join("").includes("SELECT"))).toBe(true);
  });
  it.each([{ queryId: "9" }, { snapshot: {} }, { refreshPolicy: "daily" }, { specificUserIds: [1] }, { title: " " }, { title: "a".repeat(121) }, { description: "a".repeat(1001) }, { published: "true" }, { format: "sum" }, { sourceFingerprint: "bad" }])("rejects unsupported or malformed settings: %j", (patch) => {
    expect(() => validateMetricDraft({ ...bodyOf(), ...patch }, true)).toThrow();
  });
});
