import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useParams } from "react-router";
import PersonalDashboard from "./PersonalDashboard";
const id = "00000000-0000-4000-8000-000000000001";
const mid = "00000000-0000-4000-8000-000000000010";
const other = "00000000-0000-4000-8000-000000000011";
const metrics = [{ id: mid, title: "Donors", description: "Current fiscal year donors", format: "number" }, { id: other, title: "Goal", description: "Manual goal", format: "currency" }];
const dashboard = { id, title: "My overview", metricIds: [mid, other] };
const result = (value = 0) => ({ type: "number", value, status: "ready", asOf: "2026-09-01T12:00:00Z", provenance: "saved_query" });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
let workspace, detail, catalog;
const context = () => ({ dashboardId: useParams().dashboardId });
function Detail() { return <PersonalDashboard {...context()} />; }
function mount(path = "/new") {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/new" element={<PersonalDashboard create />} />
    <Route path="/reports/personal-dashboards/:dashboardId" element={<Detail />} />
    <Route path="/reports/dashboards" element={<p>Browse dashboards</p>} />
  </Routes></MemoryRouter>);
}
async function fixtureFetch(path, options = {}) {
  if (path === "/api/reports/personal-dashboards") {
    if (options.method === "PUT") workspace = { ...JSON.parse(options.body), revision: String(Number(workspace.revision) + 1) };
    return response(workspace);
  }
  if (path === "/api/reports/metrics") return response({ entries: catalog });
  if (path.startsWith("/api/reports/metrics/")) return response({ metric: metrics.find((m) => path.endsWith(m.id)), result: result() });
  if (path.startsWith("/api/reports/personal-dashboards/")) return response(detail || { dashboard: workspace.dashboards.find((d) => path.endsWith(d.id)), cards: [] });
  throw new Error(`Unexpected request: ${path}`);
}
beforeEach(() => {
  workspace = { revision: "0", dashboards: [], defaultDashboardId: null }; detail = null; catalog = metrics;
  vi.stubGlobal("fetch", vi.fn(fixtureFetch));
  vi.spyOn(window, "confirm").mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const editor = async () => { await screen.findByLabelText("Dashboard name"); };
const editExisting = async () => {
  workspace = { revision: "2", dashboards: [dashboard], defaultDashboardId: id };
  detail = { dashboard, cards: metrics.map((metric) => ({ id: metric.id, metric, result: result() })) };
  mount(`/reports/personal-dashboards/${id}`);
  fireEvent.click(await screen.findByRole("button", { name: "Edit dashboard" })); await editor();
};

it("loads only owner and library metadata; preview is explicit and read-only", async () => {
  mount(); await editor();
  expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual(["/api/reports/metrics", "/api/reports/personal-dashboards"]);
  fireEvent.click(screen.getByRole("button", { name: "Preview Donors" }));
  const preview = await screen.findByRole("region", { name: "Metric preview" });
  expect(await within(preview).findByText("0")).toBeVisible();
  expect(fetch.mock.calls.at(-1)[0]).toBe(`/api/reports/metrics/${mid}`);
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("adds, searches, reorders and removes locally then saves private references with a default", async () => {
  mount(); await editor();
  fireEvent.change(screen.getByLabelText("Dashboard name"), { target: { value: "My giving" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Donors" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "Move card 2 up" }));
  const cards = screen.getByRole("region", { name: "Your dashboard cards" });
  expect(within(cards).getAllByRole("listitem")[0]).toHaveTextContent("Goal");
  fireEvent.click(screen.getByRole("button", { name: "Remove card 2" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Goal" } });
  expect(screen.queryByRole("button", { name: "Add Donors" })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("checkbox", { name: /Open this dashboard/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save dashboard" }));
  await screen.findByRole("button", { name: "Edit dashboard" });
  const writes = fetch.mock.calls.filter(([, options]) => options.method);
  expect(writes).toHaveLength(1);
  const body = JSON.parse(writes[0][1].body);
  expect(body.dashboards[0]).toEqual({ id: expect.any(String), title: "My giving", metricIds: [other] });
  expect(body.defaultDashboardId).toBe(body.dashboards[0].id); expect(body.revision).toBe("0");
  expect(body).not.toHaveProperty("ownerId"); expect(JSON.stringify(body)).not.toContain("queryId");
});
it("retains a dirty draft on conflicts and warns before cancelling", async () => {
  await editExisting();
  fireEvent.change(screen.getByLabelText("Dashboard name"), { target: { value: "Unsaved" } });
  const before = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(before); expect(before.defaultPrevented).toBe(true);
  fetch.mockImplementation((path, options) => options?.method ? response({ error: "Changed in another window" }, 409) : fixtureFetch(path, options));
  fireEvent.click(screen.getByRole("button", { name: "Save dashboard" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Changed in another window");
  expect(screen.getByLabelText("Dashboard name")).toHaveValue("Unsaved");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(window.confirm).toHaveBeenCalled(); expect(screen.getByLabelText("Dashboard name")).toHaveValue("Unsaved");
});
it("prevents duplicate saves while a submission is pending", async () => {
  mount(); await editor();
  fireEvent.change(screen.getByLabelText("Dashboard name"), { target: { value: "New" } });
  fetch.mockImplementation((path, options) => options?.method ? new Promise(() => {}) : fixtureFetch(path, options));
  const save = screen.getByRole("button", { name: "Save dashboard" }); fireEvent.click(save); fireEvent.click(save);
  expect(fetch.mock.calls.filter(([, options]) => options.method)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
});
it("does not grant metric-management controls when no metrics are shared", async () => {
  catalog = []; mount(); await editor();
  expect(screen.getByText(/No metrics have been made available/)).toBeVisible();
  expect(screen.queryByRole("link", { name: /Metric Library/ })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("renders saved currency and quietly distinguishes missing, stale and unavailable cards", async () => {
  workspace = { revision: "2", dashboards: [dashboard], defaultDashboardId: null };
  detail = { dashboard, cards: [
    { id: mid, metric: metrics[0], result: { ...result(), value: null, status: "missing" } },
    { id: other, metric: metrics[1], result: { ...result(123.75), status: "stale", refreshPolicy: "frozen" } },
    { id: "removed", unavailable: true },
  ] };
  mount(`/reports/personal-dashboards/${id}`);
  expect(await screen.findByText("$123.75")).toBeVisible();
  expect(screen.getByText("No saved value available yet.")).toBeVisible();
  expect(screen.getByText("Metric unavailable")).toBeVisible();
  expect(screen.getByText(/Frozen snapshot.*Last saved result/)).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("clears displayed values on a denied reload instead of retaining sensitive old data", async () => {
  await editExisting();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await screen.findByRole("button", { name: "Reload saved values" });
  fetch.mockResolvedValue(response({ error: "private permission diagnostic" }, 403));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved values" }));
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private permission diagnostic");
  expect(screen.queryByText("Donors")).not.toBeInTheDocument();
});
it("retains missing metric IDs for removal without showing their original titles", async () => {
  catalog = []; await editExisting();
  expect(screen.getAllByText("Metric unavailable")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Remove card 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Save dashboard" }));
  await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options.method === "PUT")).toBe(true));
  const body = JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "PUT")[1].body);
  expect(body.dashboards[0].metricIds).toEqual([other]);
});
