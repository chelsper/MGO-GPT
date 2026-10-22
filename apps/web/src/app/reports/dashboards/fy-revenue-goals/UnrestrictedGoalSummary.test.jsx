import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import UnrestrictedGoalSummary from "./UnrestrictedGoalSummary";
import { UNRESTRICTED_GOAL_CONFIG as config } from "@/app/api/utils/fyUnrestrictedGoal";
const now = new Date("2026-10-19T15:00:00Z");
afterEach(cleanup);
const snapshots = { reinvestmentSnapshot: { receivedCents: 425000000, projectedCents: 382500000, refreshedAt: "2026-10-19T12:00:00Z" }, cashSnapshot: { receivedCents: 32500000, refreshedAt: "2026-10-18T12:00:00Z" } };
it("shows the full cash roll-up, remaining amount, five components and their saved dates", () => {
  render(<UnrestrictedGoalSummary config={config} {...snapshots} now={now} />);
  expect(screen.getByText("$3,780,000.00")).toBeVisible();
  expect(screen.getByText("$2,720,000.00")).toBeVisible();
  expect(screen.getByText("$6,500,000.00")).toBeVisible();
  expect(screen.getByText("$425,000.00")).toBeVisible();
  expect(screen.queryByText("$3,825,000.00")).not.toBeInTheDocument();
  expect(screen.getByText("$2,300,000.00")).toBeVisible();
  expect(screen.getByText("$230,000.00")).toBeVisible();
  expect(screen.getByText("$500,000.00")).toBeVisible();
  expect(screen.getAllByText(/Saved 10\/1[89]\/2026/)).toHaveLength(2);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "58.2% of goal; $3,780,000.00 received toward $6,500,000.00");
  expect(screen.getByRole("link", { name: "Budget-relieving cash received" })).toHaveAttribute("href", "#budget-cash-heading");
});
it("does not show a misleading full total or progress when a query is missing", () => {
  render(<UnrestrictedGoalSummary config={config} reinvestmentSnapshot={snapshots.reinvestmentSnapshot} now={now} />);
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for saved budget-relieving cash totals");
  expect(screen.getAllByText("Awaiting source totals")).toHaveLength(2);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByText("$2,300,000.00")).toBeVisible();
});
it("clamps the visual progress bar but reports the actual surplus and percentage", () => {
  render(<UnrestrictedGoalSummary config={config} reinvestmentSnapshot={{ receivedCents: 0 }} cashSnapshot={{ receivedCents: 400000000 }} now={now} />);
  expect(screen.getByText("$530,000.00 above goal")).toBeVisible();
  expect(screen.getAllByText("$0.00", { selector: "dd" })).toHaveLength(2);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", expect.stringContaining("108.2%"));
});
it("keeps FY27 labeled and requires a new configuration rather than carrying cash forward", () => {
  render(<UnrestrictedGoalSummary config={config} {...snapshots} now={new Date("2027-07-02T12:00:00Z")} />);
  expect(screen.getByRole("status")).toHaveTextContent("apply to FY27 only");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByText("$3,780,000.00")).not.toBeInTheDocument();
});
