import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
const personal = vi.hoisted(() => vi.fn());
vi.mock("@/app/reports/usePersonalDashboards", () => ({ usePersonalDashboards: personal }));
import MyDashboardsPage from "./page";

const alumni = { key: "alumni-family-engagement", title: "Alumni & Family Engagement", description: "Giving and engagement", canView: true };
const custom = { key: "campaign", title: "Campaign Progress", description: "Campaign milestones", configurationSchema: "query-count-dashboard-v1", active: true, canView: true };
const json = (body, status = 200) => ({ ok: status === 200, json: async () => body });
let client;
function mount(path = "/reports/dashboards") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/reports/dashboards" element={<MyDashboardsPage />} /><Route path="/reports/personal-dashboards/:id" element={<p>Personal default opened</p>} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  personal.mockReturnValue({ data: { revision: "0", dashboards: [], defaultDashboardId: null }, isPending: false, error: null, refetch: vi.fn() });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ configurations: [alumni, custom], canManage: false })));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

it("loads only report metadata, shows authorized dashboards and preserves their URLs", async () => {
  mount();
  expect(await screen.findByRole("link", { name: "Open Alumni & Family Engagement" })).toHaveAttribute("href", "/reports/alumni-family-engagement");
  expect(screen.getByRole("link", { name: "Open Campaign Progress" })).toHaveAttribute("href", "/reports/dashboards/campaign");
  expect(screen.getByRole("link", { name: "My Dashboards" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Back to reports" })).toHaveAttribute("href", "/reports");
  expect(screen.queryByRole("link", { name: "Manage dashboards" })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/reports/configurations", expect.objectContaining({ cache: "no-store" }));
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
});

it("searches and resets locally without retrieving snapshots or running queries", async () => {
  mount();
  const search = await screen.findByRole("searchbox", { name: "Find a dashboard" });
  fireEvent.change(search, { target: { value: "MILESTONES" } });
  expect(screen.getByRole("link", { name: "Open Campaign Progress" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open Alumni & Family Engagement" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
  fireEvent.change(search, { target: { value: "no match" } });
  expect(screen.getByRole("heading", { name: "No matching dashboards" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("link", { name: "Open Alumni & Family Engagement" })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not expose restricted dashboards or disabled drafts even to managers", async () => {
  fetch.mockResolvedValue(json({ canManage: true, configurations: [
    { ...custom, canView: false, title: "Restricted" },
    { ...custom, key: "draft", active: false, title: "Private Draft" },
    { key: "future-made-phase-ii", title: "List only", canView: true },
  ] }));
  mount();
  expect(await screen.findByRole("heading", { name: "No dashboards available" })).toBeInTheDocument();
  expect(screen.getByText(/Include yourself/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Manage dashboards" })).toHaveAttribute("href", "/report-configurations");
  expect(screen.queryByText("Restricted")).not.toBeInTheDocument();
  expect(screen.queryByText("Private Draft")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open List only" })).not.toBeInTheDocument();
});

it("explains an empty audience without offering ordinary viewers configuration access", async () => {
  fetch.mockResolvedValue(json({ configurations: [], canManage: false }));
  mount();
  expect(await screen.findByRole("heading", { name: "No dashboards available" })).toBeInTheDocument();
  expect(screen.getByText(/Ask your administrator/)).toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Manage dashboards" })).not.toBeInTheDocument();
});

it("distinguishes loading from empty without launching dashboard requests", () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("Loading your dashboards");
  expect(screen.queryByRole("heading", { name: "No dashboards available" })).not.toBeInTheDocument();
});

it("offers a metadata-only retry and does not show private diagnostics", async () => {
  fetch.mockResolvedValueOnce(json({ error: "private provider information" }, 500));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Dashboards could not be loaded");
  expect(screen.queryByText(/private provider/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Open Campaign Progress" });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/reports/configurations", "/api/reports/configurations"]);
});

it("hides cached dashboard links if an access reload fails", async () => {
  mount();
  await screen.findByRole("link", { name: "Open Campaign Progress" });
  fetch.mockResolvedValue(json({ error: "Access unavailable" }, 403));
  await client.invalidateQueries({ queryKey: ["report-configurations"] });
  await waitFor(() => expect(screen.queryByRole("link", { name: "Open Campaign Progress" })).not.toBeInTheDocument());
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("opens a verified personal default but keeps Browse all dashboards available", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  personal.mockReturnValue({ data: { revision: "1", dashboards: [{ id, title: "My overview", metricIds: [] }], defaultDashboardId: id }, isPending: false });
  const view = mount();
  expect(await screen.findByText("Personal default opened")).toBeVisible();
  view.unmount();
  mount("/reports/dashboards?browse=1");
  expect(await screen.findByRole("link", { name: "Open personal dashboard My overview" })).toHaveAttribute("href", `/reports/personal-dashboards/${id}`);
  expect(screen.getByText(/Your default/)).toBeVisible();
  expect(screen.queryByText("Personal default opened")).not.toBeInTheDocument();
});

it("never redirects from a failed or loading personal workspace", async () => {
  personal.mockReturnValue({ data: { dashboards: [], defaultDashboardId: "old" }, isPending: false, error: new Error("Unavailable"), refetch: vi.fn() });
  mount();
  expect(await screen.findByRole("button", { name: "Retry personal dashboards" })).toBeVisible();
  expect(screen.queryByText("Personal default opened")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Create dashboard" })).not.toBeInTheDocument();
});
