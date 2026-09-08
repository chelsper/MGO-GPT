import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ProspectRaisedCard from "./ProspectRaisedCard";

afterEach(cleanup);
const summary = {
  currentFY: "FY27", priorFY: "FY26", closedThisFY: 4030000, closedPriorFY: 179900,
  raisedSnapshot: { status: "available", periodMode: "ytd", asOf: "2026-09-07" },
};

it("labels the shared totals as raised YTD with the matching snapshot date", () => {
  render(<ProspectRaisedCard summary={summary} />);
  expect(screen.getByText("FY27 Raised YTD")).toBeInTheDocument();
  expect(screen.getByText("$4,030,000")).toBeInTheDocument();
  expect(screen.getByText("FY26 YTD: $179,900")).toBeInTheDocument();
  expect(screen.getByText("Team Standings snapshot through Sep 7, 2026.")).toBeInTheDocument();
  expect(screen.queryByText(/Closed FY/)).not.toBeInTheDocument();
});

it("does not show zero while waiting for the saved total", () => {
  render(<ProspectRaisedCard summary={{ currentFY: "FY27" }} isLoading />);
  expect(screen.getByText("Loading...")).toBeInTheDocument();
  expect(screen.queryByText("$0")).not.toBeInTheDocument();
});

it("shows unavailable rather than zero for missing metrics", () => {
  render(<ProspectRaisedCard summary={{ ...summary, closedThisFY: null, closedPriorFY: null, raisedSnapshot: { reason: "missing_metric" } }} />);
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  expect(screen.getByText("FY26 YTD: Unavailable")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("unavailable in the saved Team Standings snapshot");
});

it("keeps a legitimate zero and cents intact", () => {
  render(<ProspectRaisedCard summary={{ ...summary, closedThisFY: 0, closedPriorFY: 1234.56 }} />);
  expect(screen.getByText("$0")).toBeInTheDocument();
  expect(screen.getByText("FY26 YTD: $1,234.56")).toBeInTheDocument();
});

it("preserves a cached value if a later snapshot read fails", () => {
  render(<ProspectRaisedCard summary={summary} isError />);
  expect(screen.getByText("$4,030,000")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Could not reload the saved total");
});

it("does not mislabel legacy full-year scores or compare them to prior YTD", () => {
  render(<ProspectRaisedCard summary={{ ...summary, raisedSnapshot: { periodMode: "full_fiscal_year" } }} />);
  expect(screen.getByText("FY27 Raised")).toBeInTheDocument();
  expect(screen.queryByText(/YTD/)).not.toBeInTheDocument();
});
