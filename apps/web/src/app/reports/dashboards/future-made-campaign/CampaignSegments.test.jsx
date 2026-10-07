import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import CampaignOverview from "./CampaignOverview";
import CampaignFiscalYears from "./CampaignFiscalYears";

const data = {
  runId: "fixture", originalCents: 15000, effectiveCents: 14000, uniqueRows: 3, rawRows: 4,
  segments: { fiscalYearStartMonth: 7,
    committed: { status: "definition_needed", cents: null }, received: { status: "source_needed", cents: null },
    fiscalYears: [
      { fiscal_year: 2027, allocations: 1, original_cents: 10000, effective_cents: 9000 },
      { fiscal_year: 2026, allocations: 1, original_cents: 4000, effective_cents: 4000 },
      { fiscal_year: null, allocations: 1, original_cents: 1000, effective_cents: 1000 },
    ],
  },
};
afterEach(cleanup);

it("does not relabel recognition or show unconfigured revenue metrics as zero", () => {
  render(<CampaignOverview data={data} />);
  expect(within(screen.getByRole("group", { name: "Campaign recognition total" })).getByRole("heading", { name: "$140.00" })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Committed campaign total" })).toHaveTextContent("Not set up yet");
  expect(screen.getByRole("article", { name: "Received campaign total" })).toHaveTextContent("Payment data needed");
  expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
});
it("only displays a configured exact-cent revenue metric, including a valid zero", () => {
  render(<CampaignOverview data={{ ...data, segments: { ...data.segments,
    committed: { status: "ready", cents: 14000, description: "Confirmed campaign basis" },
    received: { status: "ready", cents: 0, description: "Verified payment source" },
  } }} />);
  expect(screen.getByRole("article", { name: "Committed campaign total" })).toHaveTextContent("$140.00");
  expect(screen.getByRole("article", { name: "Received campaign total" })).toHaveTextContent("$0.00");
});
it("does not expose hypothetical metrics or fiscal totals before the first saved snapshot", () => {
  render(<><CampaignOverview data={{ ...data, runId: null }} /><CampaignFiscalYears data={{ ...data, runId: null }} /></>);
  expect(screen.getByText("Fiscal years will appear after the first campaign refresh.")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText("$140.00")).not.toBeInTheDocument();
});
it("shows JU fiscal periods, adjustments, unknown dates, and a reconciling total", () => {
  render(<CampaignFiscalYears data={data} />);
  const table = screen.getByRole("table", { name: "Fiscal-year campaign recognition" });
  const rows = within(table).getAllByRole("row");
  expect(rows[1]).toHaveTextContent("FY2027Jul 1, 2026 through Jun 30, 2027");
  expect(rows[1]).toHaveTextContent("$100.00-$10.00$90.00");
  expect(rows[2]).toHaveTextContent("FY2026Jul 1, 2025 through Jun 30, 2026");
  expect(rows[3]).toHaveTextContent("Date needed");
  expect(rows[4]).toHaveTextContent("Campaign total$150.00-$10.00$140.00");
  expect(screen.getByText(/No fiscal year has been guessed/)).toBeInTheDocument();
});
it("handles an empty snapshot and old API responses without inventing zero year rows", () => {
  const { rerender } = render(<CampaignFiscalYears data={{ ...data, segments: { ...data.segments, fiscalYears: [] } }} />);
  expect(screen.getByText("No gifts in the saved campaign results.")).toBeInTheDocument();
  rerender(<CampaignFiscalYears data={{ ...data, segments: undefined }} />);
  expect(screen.getByText("Reload saved data to load the fiscal-year breakdown.")).toBeInTheDocument();
});
