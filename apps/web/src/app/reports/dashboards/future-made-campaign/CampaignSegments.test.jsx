import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  expect(screen.getByRole("group", { name: "Campaign recognition total" })).toHaveTextContent("$140.00");
  expect(screen.getByRole("article", { name: "Committed campaign total" })).toHaveTextContent("Not set up yet");
  expect(screen.getByRole("article", { name: "Received campaign total" })).toHaveTextContent("Balance data needed");
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
  fireEvent.click(screen.getByText("View fiscal-year details"));
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
it("separates write-offs from local adjustments and labels annual received amounts as paid to date", () => {
  const financial = { ...data, originalCents: 1000000, netCents: 900000, writeOffCents: 100000,
    effectiveCents: 850000, pledgeBalanceCents: 250000,
    segments: { ...data.segments, committed: { status: "ready", cents: 850000 }, received: { status: "ready", cents: 600000 },
      fiscalYears: [{ fiscal_year: 2027, original_cents: 1000000, net_cents: 900000, write_off_cents: 100000,
        effective_cents: 850000, pledge_balance_cents: 250000, received_cents: 600000 }] } };
  render(<><CampaignOverview data={financial} /><CampaignFiscalYears data={financial} /></>);
  expect(screen.getByRole("article", { name: "Committed campaign total" })).toHaveTextContent("$8,500.00");
  expect(screen.getByRole("article", { name: "Received campaign total" })).toHaveTextContent("$6,000.00");
  fireEvent.click(screen.getByText("View fiscal-year details"));
  const table = screen.getByRole("table");
  expect(within(table).getByRole("columnheader", { name: "Received to date" })).toBeInTheDocument();
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("$10,000.00$1,000.00-$500.00$8,500.00$2,500.00$6,000.00");
  expect(screen.getByText(/not cash received during that fiscal year/)).toBeInTheDocument();
});

it("shows the category breakdown overall and by fiscal year, without replacing the deduction view", () => {
  const classified = { ...data, netCents: 14000, writeOffCents: 1000, pledgeBalanceCents: 3000, segments: { ...data.segments,
    committed: { status: "ready", cents: 14000 }, received: { status: "ready", cents: 11000 },
    classification: { status: "ready", queryId: "31071", investmentCents: 9000, philanthropicCents: 5000,
      investmentReceivedCents: 6000, philanthropicReceivedCents: 5000 },
    fiscalYears: [
      { fiscal_year: 2027, effective_cents: 5000, investment_cents: 0, philanthropic_cents: 5000,
        received_cents: 5000, investment_received_cents: 0, philanthropic_received_cents: 5000 },
      { fiscal_year: 2026, effective_cents: 9000, investment_cents: 9000, philanthropic_cents: 0,
        received_cents: 6000, investment_received_cents: 6000, philanthropic_received_cents: 0 },
    ],
  } };
  render(<><CampaignOverview data={classified} /><CampaignFiscalYears data={classified} /></>);
  const summary = within(screen.getByRole("table", { name: "Campaign investment and philanthropic totals" })).getAllByRole("row");
  expect(summary[1]).toHaveTextContent("Comprehensive Investment$90.00$60.00");
  expect(summary[2]).toHaveTextContent("Philanthropic$50.00$50.00");
  expect(summary).toHaveLength(3);
  expect(screen.queryByRole("group", { name: "Campaign recognition total" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("View fiscal-year details"));
  const years = within(screen.getByRole("table", { name: "Fiscal-year investment and philanthropic totals" })).getAllByRole("row");
  expect(years[1]).toHaveTextContent("FY2027"); expect(years[1]).toHaveTextContent("$50.00$0.00$50.00$50.00$0.00$50.00");
  expect(years[2]).toHaveTextContent("FY2026"); expect(years[2]).toHaveTextContent("$90.00$90.00$0.00$60.00$60.00$0.00");
  expect(years[3]).toHaveTextContent("Campaign total$140.00$90.00$50.00$110.00$60.00$50.00");
  fireEvent.change(screen.getByLabelText("Fiscal-year view"), { target: { value: "amounts" } });
  expect(screen.getByRole("table", { name: "Fiscal-year campaign recognition" })).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "Fiscal-year investment and philanthropic totals" })).not.toBeInTheDocument();
});

it("shows the saved outstanding balance without inventing a zero or calculating another metric", () => {
  const { rerender } = render(<CampaignOverview data={{ ...data, pledgeBalanceCents: 3000, segments: {
    ...data.segments, committed: { status: "ready", cents: 14000 }, received: { status: "ready", cents: 11000 },
  } }} />);
  expect(screen.getByRole("article", { name: "Outstanding pledge balance" })).toHaveTextContent("$30.00");
  expect(screen.getByRole("article", { name: "Outstanding pledge balance" })).toHaveTextContent("already included in Committed");
  rerender(<CampaignOverview data={{ ...data, pledgeBalanceCents: 0 }} />);
  expect(screen.getByRole("article", { name: "Outstanding pledge balance" })).toHaveTextContent("Balance data needed");
  expect(screen.getByRole("article", { name: "Outstanding pledge balance" })).not.toHaveTextContent("$0.00");
  rerender(<CampaignOverview data={{ ...data, pledgeBalanceCents: 0, segments: { ...data.segments, received: { status: "ready", cents: 0 } } }} />);
  expect(screen.getByRole("article", { name: "Outstanding pledge balance" })).toHaveTextContent("$0.00");
});

it("retains calculation and write-off source details in a collapsed disclosure", () => {
  render(<CampaignOverview data={{ ...data, writeOffSource: { completeAsOf: "2026-10-14", latestAsOf: "2026-10-15" }, orphaned: 2 }} />);
  const details = screen.getByText("How these totals are calculated").closest("details");
  expect(details).not.toHaveAttribute("open");
  expect(details).toHaveTextContent("Original allocation total");
  expect(details).toHaveTextContent("its amounts are not added again");
  expect(details).toHaveTextContent("complete list through 2026-10-14");
  expect(details).toHaveTextContent("additions/corrections through 2026-10-15");
  expect(details).toHaveTextContent("2 saved exceptions");
  expect(screen.getByText(/not cash receipts within a particular fiscal year/)).toBeVisible();
});
it("distinguishes an unconfigured category from a verified zero without inventing received totals", () => {
  const { rerender } = render(<CampaignOverview data={data} />);
  expect(screen.getByText(/They are not assumed to be zero/)).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "Campaign investment and philanthropic totals" })).not.toBeInTheDocument();
  rerender(<CampaignOverview data={{ ...data, segments: { ...data.segments,
    classification: { status: "ready", queryId: "31071", investmentCents: 0, philanthropicCents: 14000 },
  } }} />);
  const table = screen.getByRole("table", { name: "Campaign investment and philanthropic totals" });
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Comprehensive Investment$0.00");
  expect(within(table).queryByRole("columnheader", { name: "Received to date" })).not.toBeInTheDocument();
});
