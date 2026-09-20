import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ListRefreshStatus, { ListRefreshDetails } from "./ListRefreshStatus";

const saved = { generatedAt: "2026-09-20T00:55:21Z", leadAsOf: "2026-09-19" };
it("shows saved freshness, not technical diagnostics or an implied live check", () => {
  render(<ListRefreshStatus snapshot={saved} job={{ status: "complete" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Saved results");
  expect(screen.getByText(/Sep 19, 8:55 PM EDT/)).toBeInTheDocument();
  expect(
    screen.queryByText(/NXT|QRECID|configuration/i),
  ).not.toBeInTheDocument();
});
it("keeps incomplete enrichment honest without showing raw warnings", () => {
  render(
    <ListRefreshStatus
      queryOutput={saved}
      job={{
        status: "needs_configuration",
        message: "Technical ID mapping failure",
      }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Fundraiser details pending",
  );
  expect(screen.getByText(/Query retrieved/)).toBeInTheDocument();
  expect(
    screen.queryByText("Technical ID mapping failure"),
  ).not.toBeInTheDocument();
});
it("does not imply a failed or throttled refresh is complete", () => {
  render(
    <ListRefreshStatus
      snapshot={saved}
      job={{ status: "paused", message: "Provider details" }}
      error="Technical failure"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Showing saved results. Refresh paused.",
  );
  expect(
    screen.queryByText(/Provider details|Technical failure/),
  ).not.toBeInTheDocument();
});
it("shows bounded progress only while a request is actually running", () => {
  const { rerender } = render(
    <ListRefreshStatus
      job={{ status: "running", stage: "fundraisers", checked: 5, total: 34 }}
      refreshing
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Updating fundraiser details... 5 of 34",
  );
  rerender(
    <ListRefreshStatus
      snapshot={saved}
      job={{ status: "running", stage: "fundraisers", checked: 5, total: 34 }}
    />,
  );
  expect(screen.getByRole("status")).not.toHaveTextContent("Updating");
});
it("keeps diagnostics out of the viewer DOM and collapsed for administrators without fetching", () => {
  const refresh = vi.fn();
  const reload = vi.fn();
  const props = {
    report: { canConfigure: false, dataConfiguration: {} },
    job: { status: "paused", message: "Provider technical details" },
    refresh,
    reload,
  };
  const { rerender } = render(<ListRefreshDetails {...props} />);
  expect(screen.queryByText("List settings & status")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Provider technical details"),
  ).not.toBeInTheDocument();
  rerender(
    <ListRefreshDetails
      {...props}
      report={{ ...props.report, canConfigure: true }}
    />,
  );
  expect(screen.getByText("Provider technical details")).not.toBeVisible();
  fireEvent.click(screen.getByText("List settings & status"));
  expect(screen.getByText("Provider technical details")).toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});
