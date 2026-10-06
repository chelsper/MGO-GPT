import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImportReviewOverview from "./ImportReviewOverview";
import ImportRowChangeSummary from "./ImportRowChangeSummary";
import { importReviewOverview } from "@/utils/importReviewOverview";
afterEach(cleanup);
const rows = [
  {
    id: "1",
    status: "Needs Review",
    intentDisposition: { key: "potential_new" },
    input: { firstName: "Avery", lastName: "Dolphin" },
  },
  { id: "2", status: "Conflict" },
];
const props = () => ({
  overview: importReviewOverview(rows),
  filter: "attention",
  saved: true,
  onFilter: vi.fn(),
  onReviewExceptions: vi.fn(),
  onReviewUpdates: vi.fn(),
  onReviewNew: vi.fn(),
  onShowAll: vi.fn(),
});
describe("import overview controls", () => {
  it("shows one set of counts and navigates without sending", () => {
    const p = props();
    render(<ImportReviewOverview {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "New records 1" }));
    expect(p.onFilter).toHaveBeenCalledWith("new");
    fireEvent.click(
      screen.getByRole("button", { name: "Review exceptions (1)" }),
    );
    expect(p.onReviewExceptions).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Needs attention 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: /send|import.*now/i }),
    ).not.toBeInTheDocument();
  });
  it.each(["busy", "dirty", "preparing"])(
    "locks navigation and approval shortcuts while %s",
    (state) => {
      render(<ImportReviewOverview {...props()} {...{ [state]: true }} />);
      expect(
        screen.getAllByRole("button").every((button) => button.disabled),
      ).toBe(true);
    },
  );
  it("does not ask to prepare more changes for an already imported empty plan", () => {
    render(
      <ImportRowChangeSummary
        row={{ status: "Applied", writePlan: [] }}
        formatWrite={() => ""}
      />,
    );
    expect(
      screen.getByText(
        "No additional field changes are queued here. See the saved outcome below.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/Resolve the record or load/),
    ).not.toBeInTheDocument();
  });
  it("separates requested new values from prepared updates and prior attempts", () => {
    const { rerender } = render(
      <ImportRowChangeSummary
        row={rows[0]}
        formatWrite={() => "Prepared phone"}
      />,
    );
    expect(screen.getByText("Requested for this new record")).toBeVisible();
    expect(screen.getByText(/First name: Avery/)).toBeVisible();
    rerender(
      <ImportRowChangeSummary
        row={{
          status: "Needs Review",
          appliedAt: "2026-10-06",
          writePlan: [{}],
        }}
        formatWrite={() => "Prepared phone"}
      />,
    );
    expect(screen.getByText("Original import plan (history)")).toBeVisible();
    expect(screen.getByText(/not queued to send again/)).toBeVisible();
  });
});
