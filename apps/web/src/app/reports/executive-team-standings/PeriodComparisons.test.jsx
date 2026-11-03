import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScorecardComparison } from "./PeriodComparisons";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

afterEach(cleanup);
const comparison = getStandingsPeriods(new Date("2026-11-03T15:00:00Z"));
const entry = { fundedThisFiscalYear: 25000, highValueActionsThisFiscalYear: 15,
  priorYearToDate: { raised: 20000, highValueActions: 10 }, priorFullYear: { raised: 150000, highValueActions: 80 } };

it("separates full-year totals from matched YTD changes in each metric", () => {
  render(<ScorecardComparison entry={entry} comparison={comparison} />);
  expect(screen.getByRole("region", { name: "Fiscal-year comparison" })).toBeInTheDocument();
  expect(screen.getAllByText("FY27 YTD")).toHaveLength(2);
  expect(screen.getAllByText("FY26 YTD")).toHaveLength(2);
  expect(screen.getAllByText("FY26 full year")).toHaveLength(2);
  expect(screen.getByText("$150,000")).toBeInTheDocument();
  expect(screen.getByText("80")).toBeInTheDocument();
  expect(screen.getByText("YTD change: +$5,000 (+25%)")).toBeInTheDocument();
  expect(screen.getByText("YTD change: +5 (+50%)")).toBeInTheDocument();
  expect(screen.getByText(/Jul 1, 2025 to Jun 30, 2026/)).toBeInTheDocument();
});
it("shows an upgrade hint for old snapshots instead of treating YTD as a full year", () => {
  const { priorFullYear: _period, ...oldComparison } = comparison;
  const { priorFullYear: _totals, ...oldEntry } = entry;
  render(<ScorecardComparison entry={oldEntry} comparison={oldComparison} />);
  expect(screen.getAllByText("Refresh required")).toHaveLength(2);
  expect(screen.getByText(/after the next standings refresh/)).toBeInTheDocument();
  expect(screen.getAllByText("$20,000")).toHaveLength(1);
});
it("keeps unavailable totals distinct from a verified zero", () => {
  render(<ScorecardComparison entry={{ ...entry, priorFullYear: { raised: null, highValueActions: 0 } }} comparison={comparison} />);
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  expect(screen.getByText("0")).toBeInTheDocument();
  expect(screen.queryByText("Refresh required")).not.toBeInTheDocument();
});
