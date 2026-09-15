import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ActivePledgeNotice from "./ActivePledgeNotice";
afterEach(cleanup);
const status = {
  count: 2,
  verifiedAt: "2026-09-10T13:00:00Z",
  asOf: "2026-09-15",
  totalCents: 2500000,
  balanceCents: 1200050,
  overdueCents: 250025,
  nextPaymentDueDate: "2026-12-01",
};
const metric = (name) => screen.getByText(name).closest("div");
it("shows summarized USD amounts and an unshifted next date, not a live balance", () => {
  render(<ActivePledgeNotice status={status} />);
  expect(metric("Total pledged")).toHaveTextContent("$25,000.00");
  expect(metric("Balance due")).toHaveTextContent("$12,000.50");
  expect(metric("Overdue amount")).toHaveTextContent("$2,500.25");
  expect(metric("Next payment due")).toHaveTextContent("Dec 1, 2026");
  expect(
    screen.getByText("Combined amounts across these 2 active pledges."),
  ).toBeVisible();
  expect(screen.getByLabelText("Saved pledge status")).toHaveTextContent(
    "Due dates as of Sep 15, 2026 (Eastern)",
  );
  expect(screen.getByLabelText("Saved pledge status")).toHaveTextContent(
    "Verified September 10, 2026 (Eastern)",
  );
});
it("labels a payment due today and hides the overdue metric when none is overdue", () => {
  render(
    <ActivePledgeNotice
      status={{ ...status, overdueCents: 0, nextPaymentDueDate: status.asOf }}
    />,
  );
  expect(metric("Next payment due")).toHaveTextContent("Sep 15, 2026 (today)");
  expect(screen.queryByText("Overdue amount")).not.toBeInTheDocument();
});
it("distinguishes all-overdue from an unavailable schedule", () => {
  render(
    <ActivePledgeNotice status={{ ...status, nextPaymentDueDate: null }} />,
  );
  expect(metric("Next payment due")).toHaveTextContent("No upcoming payment");
  expect(metric("Overdue amount")).toHaveTextContent("$2,500.25");
});
it("does not fabricate zero totals or dates for an older response without metrics", () => {
  render(<ActivePledgeNotice status={{ count: 1 }} />);
  expect(metric("Total pledged")).toHaveTextContent("Unavailable");
  expect(metric("Balance due")).toHaveTextContent("Unavailable");
  expect(metric("Next payment due")).toHaveTextContent("Unavailable");
  expect(screen.queryByText(/\$0/)).not.toBeInTheDocument();
  expect(screen.queryByText("Overdue amount")).not.toBeInTheDocument();
});
it("warns when an overdue aggregate cannot be verified instead of implying nothing is overdue", () => {
  render(
    <ActivePledgeNotice
      status={{ ...status, totalCents: null, overdueCents: null }}
    />,
  );
  expect(metric("Total pledged")).toHaveTextContent("Unavailable");
  expect(
    screen.getByText("Overdue amount could not be verified."),
  ).toBeVisible();
  expect(screen.queryByText("Overdue amount")).not.toBeInTheDocument();
});
it("shows only saved positive presence with its source and calendar date", () => {
  render(
    <ActivePledgeNotice
      status={{ count: 2, verifiedAt: "2026-09-15T00:00:00Z" }}
    />,
  );
  expect(screen.getByText("Active pledge (2 pledges)")).toBeVisible();
  expect(screen.getByLabelText("Saved pledge status")).toHaveTextContent(
    "Verified September 14, 2026 (Eastern)",
  );
  expect(screen.getByLabelText("Saved pledge status")).toHaveTextContent(
    "Not a live NXT check",
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
it.each([undefined, null, { count: 0 }, { count: -1 }])(
  "does not equate absence with no pledge %#",
  (status) => {
    const { container } = render(<ActivePledgeNotice status={status} />);
    expect(container).toBeEmptyDOMElement();
  },
);
it("labels retained old values and incomplete reports", () => {
  render(
    <ActivePledgeNotice
      status={{ count: 1, stale: true, verifiedAt: "2026-09-10T12:00:00Z" }}
      incomplete
    />,
  );
  expect(screen.getByText("Active pledge in older report data")).toBeVisible();
  expect(screen.getByLabelText("Saved pledge status")).toHaveTextContent(
    "confirm current status before outreach",
  );
});
