import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnnualGivingSocietyBadge, CurrentFiscalYearGiving, formatBlackbaudCurrency } from "./ProspectGiving";

afterEach(cleanup);

it("does not invent giving or society badges when no qualifying values are saved", () => {
  const { container, rerender } = render(<><CurrentFiscalYearGiving /><AnnualGivingSocietyBadge /></>);
  expect(container).toBeEmptyDOMElement();
  rerender(<CurrentFiscalYearGiving giving={{ recognizedReceived: "invalid" }} />);
  expect(container).toBeEmptyDOMElement();
  expect(formatBlackbaudCurrency(null)).toBe("Unavailable");
  expect(formatBlackbaudCurrency(0)).toBe("$0.00");
});

it("keeps planned gifts labeled as included in committed giving", () => {
  render(<CurrentFiscalYearGiving yearLabel="FY27"
    giving={{ recognizedReceived: 100, recognizedCommitted: 500, plannedGifts: 400 }} />);
  expect(screen.getByText("FY27 recognized giving")).toBeInTheDocument();
  for (const value of [100, 500, 400]) expect(screen.getByText(formatBlackbaudCurrency(value))).toBeInTheDocument();
  expect(screen.getByText("Included in committed")).toBeInTheDocument();
});

it("keeps presence-based society badges distinct from dollar qualification", () => {
  render(<AnnualGivingSocietyBadge annualGivingSocieties={{ primarySociety: {
    key: "planned", label: "Planned Giving Society", basis: "lifetime", qualificationMode: "planned_gift",
    qualifyingAmount: 999, supportedCountSources: ["planned_gift"],
  } }} />);
  expect(screen.getByText("Planned Giving Society")).toHaveAttribute("title",
    "Lifetime giving society: planned gift on record");
});
