import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PortfolioActivityDetails from "./PortfolioActivityDetails";
import { PortfolioDetailsVisibleContext } from "./PortfolioWorklist";

const date = { date: "2026-08-31", checkedAt: "2026-09-14T12:00:00Z" };
const show = (activity, visible = true) => render(
  <PortfolioDetailsVisibleContext.Provider value={visible}>
    <PortfolioActivityDetails activity={activity} />
  </PortfolioDetailsVisibleContext.Provider>,
);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders saved dates, cents and plain text in expanded details without fetching", () => {
  vi.stubGlobal("fetch", vi.fn());
  const { container } = show({ gift: { ...date, amount: 1234.56 }, action: { ...date, summary: "<b>Call donor</b>" } });
  expect(screen.getByText("$1,234.56")).toBeVisible();
  expect(screen.getByText("<b>Call donor</b>")).toBeVisible();
  expect(container.querySelector("b")).toBeNull();
  expect(screen.getAllByText(/Checked September 14, 2026/)).toHaveLength(2);
  expect(fetch).not.toHaveBeenCalled();
});
it("hides the section while collapsed or when dates have not been verified", () => {
  const { container } = show({ gift: { ...date, amount: 100 } }, false);
  expect(container).toBeEmptyDOMElement();
  cleanup();
  expect(show({ gift: { amount: 100 }, action: { ...date, date: "2099-01-01", summary: "future" } }).container).toBeEmptyDOMElement();
});
it("retains date-only snapshots without inventing details or a zero amount", () => {
  show({ gift: date, action: date });
  expect(screen.getAllByText("Aug 31, 2026")).toHaveLength(2);
  expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/No gifts|No actions|No description/)).not.toBeInTheDocument();
});
it("shows a verified zero amount and wraps a bounded description", () => {
  show({ gift: { ...date, amount: 0 }, action: { ...date, summary: "x".repeat(3000) } });
  expect(screen.getByText("$0.00")).toBeVisible();
  expect(screen.getByText("x".repeat(2000))).toBeVisible();
});
