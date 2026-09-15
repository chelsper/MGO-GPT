import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ActivePledgeNotice from "./ActivePledgeNotice";
afterEach(cleanup);
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
