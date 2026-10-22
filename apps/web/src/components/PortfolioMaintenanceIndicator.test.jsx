import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PortfolioMaintenanceIndicator from "./PortfolioMaintenanceIndicator";
const inventory = { total: 215, freshness: { missing: 0, delayed: 0, givingUpdatedAt: "2026-10-01T12:00:00Z" } };
it.each(["queued", "processing", "paused", "completed_with_failures"])("keeps routine %s jobs out of the portfolio", status => {
  render(<PortfolioMaintenanceIndicator state={{ inventory, job: { status, failedCount: 1 } }} />);
  expect(screen.getByText("Giving last updated Oct 1, 2026")).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText(/maintenance|failed|retry|processed/i)).not.toBeInTheDocument();
});
it("links admins to saved diagnostics without rendering them", () => {
  render(<PortfolioMaintenanceIndicator isAdmin state={{ inventory }} />);
  expect(screen.getByRole("link", { name: "Integration Health" })).toHaveAttribute("href", "/integration-health#health-portfolios");
});
it("only surfaces a plain-language notice for materially delayed data", () => {
  render(<PortfolioMaintenanceIndicator state={{ inventory: { ...inventory, freshness: { delayed: 1 } } }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Some portfolio details are taking longer to update");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
it("does not label missing or unavailable data as current", () => {
  render(<PortfolioMaintenanceIndicator state={{ inventory: { total: 1, freshness: { missing: 1 } } }} />);
  expect(screen.getByText("Adding saved portfolio details in the background.")).toBeVisible();
  expect(screen.queryByText(/last updated/i)).not.toBeInTheDocument();
});
