import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReportDashboardPage from "./[reportKey]/page";
import AlumniFamilyEngagementPage from "../alumni-family-engagement/page";

vi.mock("@/utils/useUser", () => {
  const user = { id: 1, role: "admin" };
  return { default: () => ({ data: user, loading: false }) };
});
const configuration = { key: "campaign", title: "Campaign dashboard", canView: true, canArrange: true, active: true, configurationSchema: "query-count-dashboard-v1", dataConfiguration: { version: 1, panels: [] } };
const alumni = { key: "alumni-family-engagement", title: "Alumni & Family Engagement", canView: true };
const json = (body) => ({ ok: true, json: async () => body });
let client;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (options?.method) throw new Error("Navigation must not write or refresh");
    if (url === "/api/reports/configurations") return json({ configurations: [configuration, alumni] });
    if (url === "/api/reports/dashboards/campaign") return json({ configuration, snapshot: { status: "complete", generatedAt: "2026-09-19T12:00:00Z", values: [] } });
    if (url === "/api/reports/alumni-family-engagement") return json({ status: "complete", report: alumni, totals: [], generatedAt: "2026-09-19T12:00:00Z" });
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/reports/dashboards/campaign"]}>
    <Routes>
      <Route path="/reports/dashboards/:reportKey" element={<ReportDashboardPage />} />
      <Route path="/reports/alumni-family-engagement" element={<AlumniFamilyEngagementPage />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
}

it("reuses metadata while switching and reads only the selected saved dashboard", async () => {
  mount();
  const select = await screen.findByRole("combobox", { name: "Dashboard" });
  await screen.findByRole("heading", { name: "Campaign dashboard" });
  expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual(["/api/reports/configurations", "/api/reports/dashboards/campaign"]);
  fireEvent.change(select, { target: { value: alumni.key } });
  await screen.findByRole("heading", { name: alumni.title });
  expect(screen.getByRole("combobox", { name: "Dashboard" })).toHaveValue(alumni.key);
  expect(screen.getByRole("link", { name: "Back to My Dashboards" })).toHaveAttribute("href", "/reports/dashboards");
  expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual(["/api/reports/alumni-family-engagement", "/api/reports/configurations", "/api/reports/dashboards/campaign"]);
});

it("locks the selector while arranging and unlocks on cancel without fetching", async () => {
  mount();
  await screen.findByRole("heading", { name: "Campaign dashboard" });
  await screen.findByRole("combobox", { name: "Dashboard" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Arrange dashboard" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Arrange dashboard" }));
  expect(screen.getByRole("combobox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByRole("combobox")).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});
