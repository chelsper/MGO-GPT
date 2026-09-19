import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PledgePaymentsPage from "./page";
import { WorkspaceTerminologyProvider } from "@/components/WorkspaceTerminology";

const payload = () => ({ today: "2026-09-09", job: { id: "job", status: "completed", total: 1, success: 1, failed: 0 }, issues: [], records: [{
  id: "1", name: "Example Donor", constituentId: "10", lookupId: "P100", totalCents: 10000, balanceCents: 7500,
  fundDescriptions: ["Scholarships", "Student Success"], fundDescriptionsUnavailable: false,
  payments: [{ date: "2026-09-01", amountCents: 2500 }], refreshedAt: "2026-09-09T12:00:00Z",
  installments: [{ id: "1", date: "2026-09-01", amountCents: 5000, balanceCents: 2500 }, { id: "2", date: "2026-10-01", amountCents: 5000, balanceCents: 5000 }],
}] });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(payload()))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("pledge payments worklist", () => {
  it("shows both tabs and requested columns without a refresh, and switches without another call", async () => {
    render(<PledgePaymentsPage />);
    expect(await screen.findByRole("link", { name: /Example Donor/ })).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/10");
    expect(screen.getByRole("tab", { name: /Past Due/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Total pledged").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paid to date").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fund description").length).toBeGreaterThan(0);
    expect(screen.getByText("Scholarships")).toBeInTheDocument();
    expect(screen.getByText("Student Success")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Example Donor/ })).toHaveLength(1);
    expect(screen.getByText(/1 pledge in this tab/)).toHaveTextContent("$25.00");
    fireEvent.click(screen.getByRole("tab", { name: /Upcoming/ }));
    expect(screen.getByRole("tab", { name: /Upcoming/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Oct 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("Scholarships")).toBeInTheDocument();
    expect(screen.getByText("Student Success")).toBeInTheDocument();
    expect(screen.getByText(/1 pledge in this tab/)).toHaveTextContent("$50.00");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("searches saved fund descriptions without requesting NXT", async () => {
    render(<PledgePaymentsPage />);
    await screen.findByText("Example Donor");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a constituent, pledge, or fund" }), { target: { value: "sChOlArShIp" } });
    expect(screen.getByText("Example Donor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Upcoming/ }));
    expect(screen.getByText("Example Donor")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [undefined, false, "Refresh to load fund description"],
    [[], false, "Not provided by NXT"],
    [[], true, "Fund description unavailable"],
    [["Known fund"], true, "Some fund descriptions unavailable"],
  ])("distinguishes legacy, absent, and unavailable descriptions without hiding amounts", async (fundDescriptions, fundDescriptionsUnavailable, message) => {
    const data = payload();
    Object.assign(data.records[0], { fundDescriptions, fundDescriptionsUnavailable });
    fetch.mockResolvedValueOnce(Response.json(data));
    render(<PledgePaymentsPage />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("Example Donor")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("expands schedules without requesting NXT and supports search", async () => {
    render(<PledgePaymentsPage />);
    await screen.findByText("Example Donor");
    fireEvent.click(screen.getByRole("button", { name: "View payment schedule" }));
    expect(screen.getByRole("table", { name: /Payment schedule/ })).toBeInTheDocument();
    expect(screen.getByText("Past due", { exact: true })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not found" } });
    expect(screen.getByText(/No saved pledges match this search in this tab/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Example Donor")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps a direct Home path during loading and errors and reuses the configured label", async () => {
    fetch.mockRejectedValueOnce(new Error("Saved worklist unavailable"));
    render(<WorkspaceTerminologyProvider terminology={{ advancementServices: "Operations" }}><PledgePaymentsPage /></WorkspaceTerminologyProvider>);
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Saved worklist unavailable");
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("explains page ranges and recovers search on the selected tab without NXT calls", async () => {
    const data = payload();
    data.records = Array.from({ length: 51 }, (_, index) => ({ ...data.records[0], id: String(index + 1), lookupId: `P${index + 100}`, name: `Donor ${String(index).padStart(2, "0")}` }));
    fetch.mockResolvedValueOnce(Response.json(data));
    render(<PledgePaymentsPage />);
    expect(await screen.findByText(/51 pledges in this tab \/ Showing 1-50/)).toHaveTextContent("$1,275.00");
    fireEvent.click(screen.getByRole("tab", { name: /Upcoming/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
    expect(screen.getByText(/Showing 51-51/)).toHaveTextContent("$2,550.00");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  p100  " } });
    expect(screen.getByText("Donor 00")).toBeInTheDocument();
    expect(screen.getByText(/1 pledge matching this search/)).toHaveTextContent("$50.00");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("tab", { name: /Upcoming/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Showing 1-50/)).toHaveTextContent("$2,550.00");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps incomplete-data warnings while recovering a search with no matches", async () => {
    const data = payload();
    data.job.status = "paused";
    fetch.mockResolvedValueOnce(Response.json(data));
    render(<PledgePaymentsPage />);
    await screen.findByText("Example Donor");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not found" } });
    expect(screen.getByText(/No saved pledges match this search/)).toBeInTheDocument();
    expect(screen.getByText(/This worklist is incomplete or still refreshing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Example Donor")).toBeInTheDocument();
    expect(screen.getByText(/This worklist is incomplete or still refreshing/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("never labels an uninitialized or incomplete list as no pledges due", async () => {
    fetch.mockResolvedValueOnce(Response.json({ today: "2026-09-09", job: null, records: [], issues: [] }));
    render(<PledgePaymentsPage />);
    await screen.findByRole("button", { name: "Load pledge payments" });
    expect(screen.queryByText("No unpaid payments match this view.")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requires explicit Resume and shows failures instead of inventing zero amounts", async () => {
    const data = payload();
    data.job = { ...data.job, status: "paused", failed: 1, total: 2, discoveryComplete: true, resumeAfter: "2026-09-10T12:00:00Z" };
    data.issues = [{ pledgeId: "2", stage: "payments", code: "invalid_response", httpStatus: 403, hasCachedData: false }];
    fetch.mockImplementation(async () => Response.json(data));
    render(<PledgePaymentsPage />);
    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText(/Blackbaud throttling/)).toBeInTheDocument();
    expect(screen.getByText(/Not included in totals/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "resume", jobId: "job" });
  });
  it("offers an explicit query-source switch for old cached jobs, never a legacy Resume", async () => {
    const data = { ...payload(), requiresQueryRefresh: true };
    data.job.status = "running";
    fetch.mockImplementation(async () => Response.json(data));
    render(<PledgePaymentsPage />);
    const button = await screen.findByRole("button", { name: "Use query 12033" });
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    expect(screen.getByText(/previous all-pledges source/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(Response.json({ ...data, requiresQueryRefresh: false, job: { ...data.job, status: "paused" } }));
    fireEvent.click(button);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetch.mock.calls[1][1].body).action).toBe("start");
  });
  it("explains query boundaries and distinguishes output rows from unique pledges", async () => {
    const data = payload();
    data.job = { ...data.job, total: 69, success: 69, queryRowCount: 394 };
    fetch.mockResolvedValueOnce(Response.json(data));
    render(<PledgePaymentsPage />);
    expect(await screen.findByText("Query 12033: 394 output rows / 69 unique pledges.")).toBeInTheDocument();
    expect(screen.getByText(/existing amount, date, status, and missed-payment criteria/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("identifies a paused query download instead of showing zero discovered pledges or a connection reset instruction", async () => {
    const data = { ...payload(), records: [], job: { id: "saved-job", status: "paused", discoveryComplete: false,
      queryStage: "download", total: 0, success: 0, failed: 0,
      error: { code: "invalid_query_result_url", stage: "query_download", httpStatus: null } } };
    fetch.mockImplementation(async () => Response.json(data));
    render(<PledgePaymentsPage />);
    expect(await screen.findByText("Finding pledges with query 12033: Validating result file")).toBeInTheDocument();
    expect(screen.getByText(/This is not a Gift API permission error/)).toBeInTheDocument();
    expect(screen.queryByText("0 / 0 pledges checked")).not.toBeInTheDocument();
    expect(screen.queryByText(/Check your Blackbaud connection/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "resume", jobId: "saved-job" });
  });
});
