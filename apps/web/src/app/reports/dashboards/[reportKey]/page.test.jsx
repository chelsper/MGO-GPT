import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardValueFingerprint } from "@/app/api/utils/dashboardConfiguration";
import ReportDashboardPage from "./page";

const definition = { key: "count", rowKey: "r", columnKey: "c", source: "query_count", queryId: "123", refreshPolicy: "refreshable" };
const configuration = {
  key: "engagement", title: "Engagement dashboard", description: "Saved engagement counts",
  dataConfiguration: { version: 1, panels: [{ key: "p", title: "Donors", layout: "rows", width: "full", rows: [{ key: "r", label: "Alumni" }], columns: [{ key: "c", label: "Count" }], values: [definition] }] },
};
const report = (value = null, extra = {}) => ({
  configuration,
  snapshot: { status: value === null ? "refresh_required" : "complete", generatedAt: value === null ? null : "2026-09-01T12:00:00Z", values: [{ key: "count", value, status: value === null ? "missing" : "ready", refreshedAt: "2026-09-01T12:00:00Z", definitionFingerprint: getDashboardValueFingerprint(definition) }] },
  ...extra,
});
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/reports/dashboards/other")}>Other dashboard</button>;
}

function mount() {
  return render(<MemoryRouter initialEntries={["/reports/dashboards/engagement"]}><Navigation /><Routes><Route path="/reports/dashboards/:reportKey" element={<ReportDashboardPage />} /></Routes></MemoryRouter>);
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(report()))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReportDashboardPage", () => {
  it("uses only the cached GET on mount and the shared report header without extra loaders", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Engagement dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to reports" })).toHaveAttribute("href", "/reports");
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/reports/dashboards/engagement", expect.objectContaining({ cache: "no-store" }));
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });

  it("POSTs without a body only on explicit refresh and renders zero from the returned snapshot", async () => {
    mount();
    await screen.findByRole("heading", { name: "Engagement dashboard" });
    fetch.mockResolvedValue(json(report(0)));
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(await screen.findByText("0")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]).toEqual(["/api/reports/dashboards/engagement", expect.objectContaining({ method: "POST" })]);
    expect(fetch.mock.calls[1][1].body).toBeUndefined();
    expect(screen.getByText(/Snapshot as of/)).toBeInTheDocument();
  });

  it("keeps pending work explicit and continues one batch per button click without polling", async () => {
    const pendingReport = report(5, { refreshStatus: "pending", remainingQueryCount: 3 });
    pendingReport.snapshot.status = "partial";
    fetch.mockResolvedValue(json(pendingReport));
    mount();
    const button = await screen.findByRole("button", { name: "Continue refresh" });
    expect(screen.getByText(/3 queries remaining/)).toBeInTheDocument();
    expect(screen.queryByText(/Some values could not be refreshed/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(json(report(8, { refreshStatus: "pending", remainingQueryCount: 1 })));
    fireEvent.click(button);
    await screen.findByText(/1 queries remaining/);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValue(json(report(9, { refreshStatus: "complete", remainingQueryCount: 0 })));
    fireEvent.click(screen.getByRole("button", { name: "Continue refresh" }));
    await screen.findByText("9");
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("shows genuine refresh failures alongside remaining batches", async () => {
    const payload = report(5, { refreshStatus: "pending", remainingQueryCount: 3 });
    payload.snapshot.status = "partial";
    payload.snapshot.values[0].status = "stale";
    payload.snapshot.values[0].error = "Refresh failed";
    fetch.mockResolvedValue(json(payload));
    mount();
    await screen.findByRole("button", { name: "Continue refresh" });
    expect(screen.getByText(/Some values could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByText(/3 queries remaining/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains the last snapshot on failed refresh and prevents overlapping refreshes", async () => {
    fetch.mockResolvedValueOnce(json(report(12)));
    mount();
    await screen.findByText("12");
    let resolve;
    fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    fireEvent.click(screen.getByRole("button", { name: "Refreshing data..." }));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByText("12")).toBeInTheDocument();
    await act(async () => resolve(json({ error: "unsafe upstream details" }, 500)));
    expect(screen.getByRole("alert")).toHaveTextContent("The previous snapshot is still shown");
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText(/unsafe upstream/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled();
  });

  it.each([401, 403, 404, 500])("handles failed cached GET %s without attempting refresh", async (status) => {
    fetch.mockResolvedValue(json({ error: "private diagnostic" }, status));
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: "Engagement dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeDisabled();
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renders partial snapshot status without treating missing values as zero", async () => {
    const payload = report();
    payload.snapshot.status = "partial";
    fetch.mockResolvedValue(json(payload));
    mount();
    await screen.findByRole("heading", { name: "Engagement dashboard" });
    expect(screen.getByText(/Some values could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("aborts old refreshes on route change and never displays their results on the next dashboard", async () => {
    fetch.mockResolvedValueOnce(json(report(1)));
    mount();
    await screen.findByText("1");
    let resolve;
    fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    const oldSignal = fetch.mock.calls[1][1].signal;
    fetch.mockResolvedValueOnce(json(report(2, { configuration: { ...configuration, key: "other", title: "Other report" } })));
    fireEvent.click(screen.getByRole("button", { name: "Other dashboard" }));
    await screen.findByRole("heading", { name: "Other report" });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolve(json(report(99))));
    expect(screen.getByRole("heading", { name: "Other report" })).toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("aborts the cached GET when unmounted", async () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    const { unmount } = mount();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const signal = fetch.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
