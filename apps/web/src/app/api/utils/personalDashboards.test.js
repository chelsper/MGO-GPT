import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), list: vi.fn(), sources: vi.fn(), cache: vi.fn() }));
vi.mock("./sql", () => ({ default: mocks.sql }));
vi.mock("./reportMetricLibrary", () => ({ listMetricLibrary: mocks.list, loadMetricSources: mocks.sources,
  serializeMetric: (row) => ({ id: row.id, title: row.title, format: row.display_format }) }));
vi.mock("./reportCache", () => ({ getCachedReportSnapshot: mocks.cache }));
vi.mock("./reportMetricSources", () => ({ presentMetricResult: (_, saved) => saved }));
import { readPersonalWorkspace, savePersonalWorkspace, readPersonalDashboard } from "./personalDashboards";
import { validatePersonalWorkspace, movePersonalMetric } from "@/utils/personalDashboards";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = { id: 7, active: true, role: "mgo" };
const dashboard = { id: uuid(1), title: "My overview", metricIds: [uuid(10), uuid(11)] };
const source = { id: "source", enabled: true, canView: true, fingerprint: "current", cacheKey: "saved" };
const metric = (id) => ({ id, title: "Private label", source_id: source.id, source_fingerprint: "current", published: true, display_format: "number" });
let row, records, writes;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No NXT requests permitted"); }));
  row = { dashboards: [structuredClone(dashboard)], revision: "2", default_dashboard_id: null };
  records = [metric(uuid(10)), metric(uuid(11))]; writes = null;
  mocks.sources.mockResolvedValue([source]); mocks.list.mockResolvedValue({ entries: records.map((r) => ({ id: r.id, format: "number" })) });
  mocks.cache.mockResolvedValue({ type: "number", value: 0, status: "ready", asOf: "2026-09-01T12:00:00Z" });
  mocks.sql.mockImplementation(async (parts, ...values) => {
    const query = parts.join("?");
    if (query.includes("FROM personal_report_workspaces")) return row ? [row] : [];
    if (query.includes("FROM report_metric_library")) return records;
    if (query.includes("UPDATE personal_report_workspaces") || query.includes("INSERT INTO personal_report_workspaces")) {
      writes = { query, values };
      return [{ ...row, revision: "3" }];
    }
    throw new Error("Unexpected SQL");
  });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const draft = (changes = {}) => ({ revision: "2", dashboards: [structuredClone(dashboard)], defaultDashboardId: dashboard.id, ...changes });

it("returns an empty unsaved workspace without any writes", async () => {
  row = null;
  expect(await readPersonalWorkspace(owner)).toEqual({ revision: "0", dashboards: [], defaultDashboardId: null });
  expect(mocks.sql.mock.calls[0][1]).toBe(owner.id); expect(writes).toBeNull();
  expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.sources).not.toHaveBeenCalled();
});
it("saves only the signed-in owner's references and default in one CAS update", async () => {
  await savePersonalWorkspace(owner, draft());
  expect(writes.query).toContain("WHERE user_id = ? AND revision::text = ?");
  expect(writes.values).toEqual([JSON.stringify([dashboard]), dashboard.id, owner.id, "2"]);
  expect(writes.query).not.toMatch(/report_configurations|report_snapshots/);
  expect(mocks.cache).not.toHaveBeenCalled();
});
it("protects first save against concurrent workspace creation", async () => {
  row = null;
  await savePersonalWorkspace(owner, draft({ revision: "0" }));
  expect(writes.query).toContain("ON CONFLICT (user_id) DO NOTHING");
  expect(writes.values[0]).toBe(owner.id);
});
it("rejects stale saves before writing and races at the final compare-and-swap", async () => {
  await expect(savePersonalWorkspace(owner, draft({ revision: "1" }))).rejects.toMatchObject({ status: 409 });
  expect(writes).toBeNull();
  mocks.sql.mockImplementation(async (parts) => parts.join("").includes("SELECT") ? [row] : []);
  await expect(savePersonalWorkspace(owner, draft())).rejects.toMatchObject({ status: 409 });
});
it.each([null, { ...owner, active: false }, { ...owner, id: "other" }])("denies inactive or invalid owners", async (user) => {
  await expect(readPersonalWorkspace(user)).rejects.toMatchObject({ status: 403 });
  await expect(savePersonalWorkspace(user, draft())).rejects.toMatchObject({ status: 403 });
  await expect(readPersonalDashboard(user, dashboard.id)).rejects.toMatchObject({ status: 403 });
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("has no administrator cross-owner bypass and does not load any metrics for unknown dashboards", async () => {
  row = { ...row, dashboards: [] };
  await expect(readPersonalDashboard({ id: 99, role: "admin", active: true }, dashboard.id)).rejects.toMatchObject({ status: 404 });
  expect(mocks.sql.mock.calls[0][1]).toBe(99);
  expect(mocks.sources).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
});
it("rejects invalid dashboard IDs before loading records", async () => {
  await expect(readPersonalDashboard(owner, "../7")).rejects.toMatchObject({ status: 404 });
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("projects cards in saved order and reads a shared snapshot only once", async () => {
  records.reverse();
  const result = await readPersonalDashboard(owner, dashboard.id);
  expect(result.cards.map((c) => c.id)).toEqual(dashboard.metricIds);
  expect(result.cards[0].result.value).toBe(0);
  expect(mocks.cache).toHaveBeenCalledExactlyOnceWith("saved");
  expect(result).not.toHaveProperty("workspace");
});
it.each(["access", "disabled", "unpublished", "changed", "deleted"])("hides revoked %s metrics without cached titles or values", async (kind) => {
  if (kind === "access") mocks.sources.mockResolvedValue([{ ...source, canView: false }]);
  if (kind === "disabled") mocks.sources.mockResolvedValue([{ ...source, enabled: false }]);
  if (kind === "changed") mocks.sources.mockResolvedValue([{ ...source, fingerprint: "new" }]);
  if (kind === "deleted") records = [];
  if (kind === "unpublished") records = records.map((r) => ({ ...r, published: false }));
  const result = await readPersonalDashboard(owner, dashboard.id);
  expect(result.cards).toEqual(dashboard.metricIds.map((id) => ({ id, unavailable: true })));
  expect(JSON.stringify(result)).not.toContain("Private label"); expect(mocks.cache).not.toHaveBeenCalled();
});
it("retains or removes formerly authorized cards but cannot add unavailable cards", async () => {
  mocks.list.mockResolvedValue({ entries: [] });
  await savePersonalWorkspace(owner, draft());
  await savePersonalWorkspace(owner, draft({ dashboards: [{ ...dashboard, metricIds: [] }] }));
  await expect(savePersonalWorkspace(owner, draft({ dashboards: [{ ...dashboard, metricIds: [uuid(99)] }] }))).rejects.toMatchObject({ status: 409 });
  await expect(savePersonalWorkspace(owner, draft({ dashboards: [{ ...dashboard, id: uuid(9) }], defaultDashboardId: null }))).rejects.toMatchObject({ status: 409 });
});
it("limits tables independently from metric cards", async () => {
  const ids = [10, 11, 12, 13, 14].map(uuid);
  mocks.list.mockResolvedValue({ entries: ids.map((id) => ({ id, format: "table" })) });
  await expect(savePersonalWorkspace(owner, draft({ dashboards: [{ ...dashboard, metricIds: ids }] }))).rejects.toMatchObject({ status: 400 });
  expect(writes).toBeNull();
});
it.each([
  null, { ownerId: 99 }, { share: true }, { sourceQuery: "123" }, { revision: 1 },
  { revision: "-1" }, { defaultDashboardId: uuid(99) },
  { dashboards: [{ ...dashboard, ownerId: 99 }] }, { dashboards: [{ ...dashboard, title: " " }] },
  { dashboards: [{ ...dashboard, title: "x".repeat(121) }] }, { dashboards: [dashboard, dashboard] },
  { dashboards: [{ ...dashboard, metricIds: [uuid(10), uuid(10)] }] },
  { dashboards: [{ ...dashboard, metricIds: ["wrong"] }] },
  { dashboards: [{ ...dashboard, metricIds: Array.from({ length: 13 }, (_, i) => uuid(i)) }] },
  { dashboards: Array.from({ length: 13 }, (_, i) => ({ ...dashboard, id: uuid(i) })) },
])("strictly rejects invalid, excessive or privilege-bearing settings %j", (patch) => {
  expect(() => validatePersonalWorkspace(patch === null ? null : draft(patch))).toThrow();
});
it("reorders and normalizes metadata without mutating input", () => {
  expect(movePersonalMetric(["a", "b"], "b", -1)).toEqual(["b", "a"]);
  const ids = ["a", "b"];
  expect(movePersonalMetric(ids, "a", -1)).toBe(ids);
  expect(movePersonalMetric(ids, "unknown", 1)).toBe(ids);
  expect(validatePersonalWorkspace(draft({ dashboards: [{ ...dashboard, title: "  Name  " }] })).dashboards[0].title).toBe("Name");
});
