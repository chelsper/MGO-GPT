import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CampaignFiscalYears from "./CampaignFiscalYears";
import CampaignOverview from "./CampaignOverview";

function fixture() {
  return { runId: "saved", originalCents: 30400, effectiveCents: 30000, netCents: 30000,
    writeOffCents: 400, pledgeBalanceCents: 7000, rawRows: 2, uniqueRows: 2,
    segments: { fiscalYearStartMonth: 7,
      committed: { status: "ready", cents: 30000 }, received: { status: "ready", cents: 23000 },
      classification: { status: "ready", philanthropicCents: 19000, investmentCents: 11000,
        philanthropicReceivedCents: 14000, investmentReceivedCents: 9000 },
      fiscalYears: [
        { fiscal_year: 2027, effective_cents: 10000, original_cents: 10200, net_cents: 10000, write_off_cents: 200,
          philanthropic_cents: 7000, investment_cents: 3000, received_cents: 8000, pledge_balance_cents: 2000,
          philanthropic_received_cents: 5000, investment_received_cents: 3000 },
        { fiscal_year: 2026, effective_cents: 20000, original_cents: 20200, net_cents: 20000, write_off_cents: 200,
          philanthropic_cents: 12000, investment_cents: 8000, received_cents: 15000, pledge_balance_cents: 5000,
          philanthropic_received_cents: 9000, investment_received_cents: 6000 },
      ],
    },
  };
}
const chartToggle = name => within(screen.getByRole("group", { name: "Fiscal-year chart view" })).getByRole("button", { name, exact: true });
const chartRow = year => screen.getByRole("img", { name: new RegExp(`^${year}:`) });
const bars = row => row.querySelectorAll('div[aria-hidden="true"] > span');
const details = () => screen.getByText("View fiscal-year details").closest("details");
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows newest-first fiscal-year amounts with category segments on a shared dollar scale", () => {
  const data = fixture();
  data.segments.fiscalYears.reverse();
  render(<CampaignFiscalYears data={data} />);
  expect(screen.getAllByRole("img")[0]).toHaveAccessibleName(/^FY2027:/);
  expect(chartRow("FY2027")).toHaveAccessibleName("FY2027: Jul 1, 2026 through Jun 30, 2027. Committed $100.00. Philanthropic $70.00; Comprehensive Investment $30.00.");
  expect(bars(chartRow("FY2027"))[0]).toHaveStyle({ width: "35%" });
  expect(bars(chartRow("FY2027"))[1]).toHaveStyle({ width: "15%" });
  expect(bars(chartRow("FY2026"))[0]).toHaveStyle({ width: "60%" });
  expect(bars(chartRow("FY2026"))[1]).toHaveStyle({ width: "40%" });
  expect(screen.getByText("Same dollar scale in both views.")).toBeInTheDocument();
  expect(details()).not.toHaveAttribute("open");
  expect(screen.getByRole("table")).not.toBeVisible();
});

it("keeps the same scale, exact amounts, and dates when switching to Received", () => {
  render(<CampaignFiscalYears data={fixture()} />);
  fireEvent.click(chartToggle("Received to date"));
  expect(chartToggle("Received to date")).toHaveAttribute("aria-pressed", "true");
  expect(chartToggle("Committed")).toHaveAttribute("aria-pressed", "false");
  expect(chartRow("FY2027")).toHaveAccessibleName(/Received to date \$80.00. Philanthropic \$50.00; Comprehensive Investment \$30.00/);
  expect(bars(chartRow("FY2027"))[0]).toHaveStyle({ width: "25%" });
  expect(bars(chartRow("FY2027"))[1]).toHaveStyle({ width: "15%" });
  expect(bars(chartRow("FY2026"))[0]).toHaveStyle({ width: "45%" });
  expect(screen.getByRole("list", { name: "Received to date by fiscal year" })).toBeInTheDocument();
  expect(screen.getByText(/not cash received during that fiscal year/)).toBeVisible();
  expect(screen.getByText(/may contain partial-year activity/)).toBeVisible();
});

it("preserves both detailed tables and their selected view when closing and reopening details", () => {
  render(<CampaignFiscalYears data={fixture()} />);
  fireEvent.click(screen.getByText("View fiscal-year details"));
  expect(screen.getByRole("table", { name: "Fiscal-year investment and philanthropic totals" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Fiscal-year view"), { target: { value: "amounts" } });
  const table = screen.getByRole("table", { name: "Fiscal-year campaign recognition" });
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("$102.00$2.00$0.00$100.00$20.00$80.00");
  expect(screen.getByRole("region", { name: "Fiscal-year amount details" })).toHaveAttribute("tabindex", "0");
  fireEvent.click(screen.getByText("View fiscal-year details"));
  fireEvent.click(chartToggle("Received to date"));
  expect(details()).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("View fiscal-year details"));
  expect(screen.getByLabelText("Fiscal-year view")).toHaveValue("amounts");
  expect(screen.getByRole("table", { name: "Fiscal-year campaign recognition" })).toBeVisible();
});

it("keeps chart controls independent from the overview and never requests or edits data", () => {
  const data = fixture(), before = JSON.stringify(data), fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<><CampaignOverview data={data} /><CampaignFiscalYears data={data} /></>);
  fireEvent.click(chartToggle("Received to date"));
  expect(screen.getByRole("article", { name: "Committed campaign total" })).toHaveTextContent("$300.00");
  expect(screen.getByRole("img", { name: /^Committed campaign composition:/ })).toBeInTheDocument();
  expect(JSON.stringify(data)).toBe(before);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps unrecognized dates separate, included in the total, and never invents an FY", () => {
  const data = fixture();
  data.segments.fiscalYears[0].fiscal_year = null;
  render(<CampaignFiscalYears data={data} />);
  expect(screen.getAllByRole("img").map(el => el.getAttribute("aria-label").split(":")[0])).toEqual(["FY2026", "Date needed"]);
  expect(chartRow("Date needed")).toHaveAccessibleName(/Gift date missing or unrecognized. Committed \$100.00/);
  expect(screen.getByText(/No fiscal year has been guessed/)).toBeVisible();
  expect(screen.getByText("Committed campaign total")).toHaveTextContent("$300.00");
});

it.each([null, undefined, NaN, Infinity, 1.2, "10000", Number.MAX_SAFE_INTEGER + 1])("does not draw missing or invalid fiscal-year amounts (%s)", amount => {
  const data = fixture();
  data.segments.fiscalYears[0].effective_cents = amount;
  render(<CampaignFiscalYears data={data} />);
  expect(screen.getByText(/Some fiscal-year amounts are unavailable/)).toBeVisible();
  expect(chartRow("FY2027")).toHaveAccessibleName(/Committed Not loaded/);
  expect(bars(chartRow("FY2027"))).toHaveLength(0);
  expect(bars(chartRow("FY2026"))).toHaveLength(0);
});

it("does not silently replace the saved total with a sum of incomplete years", () => {
  const data = fixture();
  data.segments.fiscalYears.pop();
  render(<CampaignFiscalYears data={data} />);
  expect(screen.getByText(/do not match the saved campaign total/)).toBeVisible();
  expect(screen.getByText("Committed campaign total")).toHaveTextContent("$300.00");
  expect(bars(chartRow("FY2027"))).toHaveLength(0);
});

it("does not clamp negative values or mix them into positive-only bars", () => {
  const data = fixture();
  data.segments.received.cents = -1000;
  data.segments.fiscalYears[0].received_cents = -16000;
  render(<CampaignFiscalYears data={data} />);
  fireEvent.click(chartToggle("Received to date"));
  expect(screen.getByText(/includes negative amounts/)).toBeVisible();
  expect(chartRow("FY2027")).toHaveAccessibleName(/Received to date -\$160.00/);
  expect(bars(chartRow("FY2026"))).toHaveLength(0);
  fireEvent.click(chartToggle("Committed"));
  expect(bars(chartRow("FY2027"))).toHaveLength(2);
});

it("represents verified zero years without filling bars", () => {
  const data = fixture();
  data.segments.received.cents = 0;
  data.segments.classification.philanthropicReceivedCents = 0;
  data.segments.classification.investmentReceivedCents = 0;
  data.segments.fiscalYears.forEach(year => { year.received_cents = 0; year.philanthropic_received_cents = 0; year.investment_received_cents = 0; });
  render(<CampaignFiscalYears data={data} />);
  fireEvent.click(chartToggle("Received to date"));
  expect(screen.getByText(/all \$0.00. No filled bars/)).toBeVisible();
  expect(chartRow("FY2027")).toHaveAccessibleName(/Received to date \$0.00/);
  for (const bar of bars(chartRow("FY2027"))) expect(bar).toHaveStyle({ width: "0%" });
});

it.each(["missing", "negative", "mismatch", "aggregate"])("shows only verified totals when category data has a %s problem", issue => {
  const data = fixture();
  const year = data.segments.fiscalYears[0];
  if (issue === "missing") year.philanthropic_cents = null;
  if (issue === "negative") { year.philanthropic_cents = -1000; year.investment_cents = 11000; }
  if (issue === "mismatch") year.philanthropic_cents = 6000;
  if (issue === "aggregate") data.segments.classification.philanthropicCents = 19001;
  render(<CampaignFiscalYears data={data} />);
  expect(screen.getByText(/Bars show campaign totals only/)).toBeVisible();
  expect(bars(chartRow("FY2027"))).toHaveLength(1);
  expect(bars(chartRow("FY2027"))[0]).toHaveStyle({ width: "50%" });
  expect(chartRow("FY2027")).not.toHaveAccessibleName(/Philanthropic/);
});

it("shows unclassified totals without treating Comprehensive Investment as zero", () => {
  const data = fixture();
  data.segments.classification.status = "source_needed";
  render(<CampaignFiscalYears data={data} />);
  expect(bars(chartRow("FY2027"))).toHaveLength(1);
  expect(screen.queryByText(/Category amounts cannot be reconciled/)).not.toBeInTheDocument();
  expect(chartRow("FY2027")).not.toHaveAccessibleName(/Comprehensive Investment/);
  fireEvent.click(screen.getByText("View fiscal-year details"));
  expect(screen.queryByLabelText("Fiscal-year view")).not.toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Fiscal-year campaign recognition" })).toBeVisible();
});

it("retains legacy recognition labels and disables Received without balance data", () => {
  const data = fixture();
  data.segments.committed = { status: "definition_needed", cents: null };
  data.segments.received = { status: "source_needed", cents: null };
  render(<CampaignFiscalYears data={data} />);
  expect(chartToggle("Campaign recognition")).toHaveAttribute("aria-pressed", "true");
  expect(chartToggle("Received to date")).toBeDisabled();
  expect(chartRow("FY2027")).toHaveAccessibleName(/Campaign recognition \$100.00/);
  expect(screen.getByText(/Received chart needs saved pledge-balance data/)).toBeVisible();
});

it("safely falls back when a refreshed snapshot no longer has Received data", () => {
  const data = fixture();
  const { rerender } = render(<CampaignFiscalYears data={data} />);
  fireEvent.click(chartToggle("Received to date"));
  rerender(<CampaignFiscalYears data={{ ...data, segments: { ...data.segments, received: { status: "source_needed", cents: null } } }} />);
  expect(chartToggle("Committed")).toHaveAttribute("aria-pressed", "true");
  expect(chartToggle("Received to date")).toBeDisabled();
  expect(chartRow("FY2027")).toHaveAccessibleName(/Committed \$100.00/);
});

it.each(["run", "segments", "years"])("does not render a chart before %s data is available", missing => {
  const data = fixture();
  if (missing === "run") data.runId = null;
  if (missing === "segments") data.segments = undefined;
  if (missing === "years") data.segments.fiscalYears = [];
  render(<CampaignFiscalYears data={data} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Fiscal-year chart view" })).not.toBeInTheDocument();
  expect(screen.queryByText("View fiscal-year details")).not.toBeInTheDocument();
});

it("uses configured calendar-year periods and does not crash when period settings are absent", () => {
  const data = fixture();
  data.segments.fiscalYearStartMonth = 1;
  const { rerender } = render(<CampaignFiscalYears data={data} />);
  expect(chartRow("FY2027")).toHaveAccessibleName(/Jan 1, 2027 through Dec 31, 2027/);
  rerender(<CampaignFiscalYears data={{ ...data, segments: { ...data.segments, fiscalYearStartMonth: undefined } }} />);
  expect(chartRow("FY2027")).toHaveAccessibleName(/Fiscal period unavailable/);
});
