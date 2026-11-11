import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortfolioMaintenanceIndicator from "./PortfolioMaintenanceIndicator";
const inventory = { total: 215, freshness: { missing: 0, delayed: 0, givingUpdatedAt: "2026-10-01T12:00:00Z" } };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["queued", "processing", "paused", "completed_with_failures"])("keeps routine %s jobs out of the portfolio", status => {
  render(<PortfolioMaintenanceIndicator state={{ inventory, serverManaged: true, job: { status, failedCount: 1 } }} />);
  expect(screen.getByText("Giving last checked Oct 1, 2026")).toBeVisible();
  expect(screen.getByText("Updates automatically")).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText(/maintenance|failed|retry|processed/i)).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("links admins to saved diagnostics without rendering them", () => {
  render(<PortfolioMaintenanceIndicator isAdmin state={{ inventory }} />);
  expect(screen.getByRole("link", { name: "Integration Health" })).toHaveAttribute("href", "/integration-health#health-portfolios");
});
it("only surfaces a plain-language notice for materially delayed data", () => {
  render(<PortfolioMaintenanceIndicator state={{ serverManaged: true,
    inventory: { ...inventory, freshness: { ...inventory.freshness, delayed: 1 } } }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Some information is delayed. Your saved details are still available.");
  expect(screen.getByRole("status").parentElement).toHaveClass("text-amber-800");
  expect(screen.getByText("Giving last checked Oct 1, 2026")).toBeVisible();
  expect(screen.getByText(/contact your administrator if this persists/)).toBeVisible();
  expect(screen.queryByText("Updates automatically")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
it("does not label missing or unavailable data as current", () => {
  render(<PortfolioMaintenanceIndicator state={{ inventory: { total: 1, freshness: { missing: 1 } } }} />);
  expect(screen.getByText("Some saved details are not available yet.")).toBeVisible();
  expect(screen.queryByText(/last checked|automatically|current/i)).not.toBeInTheDocument();
});

it("describes missing details as scheduled only when automatic maintenance is enabled", () => {
  render(<PortfolioMaintenanceIndicator state={{ serverManaged: true,
    inventory: { total: 1, freshness: { ...inventory.freshness, missing: 1 } } }} />);
  expect(screen.getByText("Saved details are pending automatic updates. No action needed.")).toBeVisible();
  expect(screen.queryByText(/last checked|current/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each([undefined, false, "true"])("does not promise an unconfirmed automatic schedule (%s)", serverManaged => {
  render(<PortfolioMaintenanceIndicator state={{ inventory, serverManaged }} />);
  expect(screen.getByText("Giving last checked Oct 1, 2026")).toHaveAttribute("title", expect.stringContaining("oldest successful giving check"));
  expect(screen.queryByText(/automatically/)).not.toBeInTheDocument();
});

it.each([null, "invalid", "2026-10-03T12:00:00Z"])("does not display an invalid or future date (%s)", givingUpdatedAt => {
  render(<PortfolioMaintenanceIndicator state={{ inventory: { ...inventory,
    freshness: { ...inventory.freshness, givingUpdatedAt } } }} />);
  expect(screen.getByText("Update status is not available yet.")).toBeVisible();
  expect(screen.queryByText(/last checked|current|loading/i)).not.toBeInTheDocument();
});

it("does not leave an indefinite loading message or start a polling loop", () => {
  render(<PortfolioMaintenanceIndicator />);
  expect(screen.getByText("Update status is not available yet.")).toBeVisible();
  vi.advanceTimersByTime(60_000);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(/loading|checking|current/i)).not.toBeInTheDocument();
});

it("preserves read failures rather than replacing them with routine schedule text", () => {
  render(<PortfolioMaintenanceIndicator error="Read failed" state={{ inventory, serverManaged: true }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Update status is unavailable. Saved portfolio details are still shown.");
  expect(screen.queryByText("Updates automatically")).not.toBeInTheDocument();
  expect(screen.getByText("Giving last checked Oct 1, 2026")).toBeVisible();
});

it("keeps a known empty portfolio quiet but still surfaces a read failure", () => {
  const { container, rerender } = render(<PortfolioMaintenanceIndicator state={{ inventory: { total: 0 } }} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<PortfolioMaintenanceIndicator error="Read failed" state={{ inventory: { total: 0 } }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Update status is unavailable");
});
