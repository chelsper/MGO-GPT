import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildPipelineReport } from "@/utils/pipelineReport";

vi.mock("@/utils/useUser", () => ({ default: () => ({ data: { id: 1, email: "user@example.test" }, loading: false }) }));
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, description, action }) => <header><a href="/reports">Back to reports</a><h1>{title}</h1><p>{description}</p>{action}</header> }));
import OpportunityPipelinePage, { PipelineReport } from "./page";

const raw = (id, overrides = {}) => ({ id, user_id: 1, prospect_name: `Person ${id}`, title: `Opportunity ${id}`, blackbaud_constituent_id: String(id + 100), opportunity_status: "Active", current_stage: "Cultivation", estimated_amount: 1000, expected_date: "2027-03-01", ...overrides });
const report = (rows) => buildPipelineReport(rows, [{ id: 1, name: "Fundraiser One" }, { id: 2, name: "Fundraiser Two" }], new Date("2026-09-27T12:00:00Z"));
const results = () => within(screen.getByRole("region", { name: "Opportunity results" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("opportunity pipeline interaction", () => {
  it("defaults to current FY active, supports prior/future years, archive outcomes and undated records", () => {
    render(<PipelineReport report={report([
      raw(1), raw(2, { expected_date: "2026-03-01" }), raw(3, { expected_date: "2028-03-01" }),
      raw(4, { opportunity_status: "Funded", closed_amount: 900 }), raw(5, { opportunity_status: "Declined" }),
      raw(6, { expected_date: null }),
    ])} reload={vi.fn()} />);
    expect(screen.getByLabelText("Fiscal year")).toHaveValue("2027");
    expect(results().getByText("Person 1")).toBeInTheDocument();
    expect(results().queryByText("Person 4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous fiscal year" }));
    expect(results().getByText("Person 2")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Fiscal year"), { target: { value: "2028" } });
    expect(results().getByText("Person 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Current FY" }));
    fireEvent.click(screen.getByRole("button", { name: /Closed & archived/ }));
    expect(results().getByText("Person 4")).toBeInTheDocument();
    expect(results().getByText("Person 5")).toBeInTheDocument();
    expect(screen.getByText("$900.00")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "Declined" } });
    expect(results().queryByText("Person 4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Needs FY \/ review/ }));
    expect(results().getByText("Person 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Fiscal year")).toBeDisabled();
  });
  it("filters locally, exposes details on request, and reloads only when requested", () => {
    const reload = vi.fn();
    render(<PipelineReport report={report([raw(1), raw(2, { user_id: 2, current_stage: "Solicitation", estimated_amount: null })])} reload={reload} />);
    fireEvent.change(screen.getByLabelText("Fundraiser"), { target: { value: "2" } });
    expect(results().queryByText("Person 1")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "Solicitation" } });
    fireEvent.change(screen.getByLabelText("Search opportunities"), { target: { value: "Person 2" } });
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "amount" } });
    expect(screen.getByText("Known ask amount")).toBeInTheDocument();
    expect(screen.getByText(/1 without a verified amount/)).toBeInTheDocument();
    const details = screen.getByRole("button", { name: "Show details for Opportunity 2" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(details);
    expect(screen.getByText("NXT last checked")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved data" }));
    expect(reload).toHaveBeenCalledOnce();
  });
  it("paginates the visible rows and resets the page after filtering", () => {
    render(<PipelineReport report={report(Array.from({ length: 30 }, (_, index) => raw(index + 1)))} reload={vi.fn()} />);
    expect(results().getAllByRole("button", { name: /Show details/ })).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(results().getAllByRole("button", { name: /Show details/ })).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("Search opportunities"), { target: { value: "Person 30" } });
    expect(results().getByText("Person 30")).toBeInTheDocument();
    expect(screen.queryByText("Page 2 of 2")).not.toBeInTheDocument();
  });
  it("does not turn an access error into an empty or cached report", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "You do not have access to the overall opportunity pipeline." }, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OpportunityPipelinePage /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access");
    expect(screen.queryByRole("region", { name: "Filtered opportunity totals" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
    client.clear();
  });
});
