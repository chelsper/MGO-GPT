import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LetterBatchSummary from "./LetterBatchSummary";

const row = {
  members: ["10", "11"],
  societyName: "President's Society",
  societyKey: "presidents",
  channel: "post",
  status: "prepared",
  period: { start: "2026-01-01", end: "2026-12-31" },
};
const selection = {
  version: 1,
  total: 7,
  selected: 1,
  notSelected: 3,
  excluded: 1,
  covered: 1,
  reserved: 1,
};
const appeal = {
  id: "100",
  lookupId: "CY26-PRES",
  description: "CY 2026 President letter sent",
};

describe("letter batch summary UI", () => {
  it("shows read-only receipt and selection evidence without requests", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    render(
      <LetterBatchSummary
        items={[
          {
            ...row,
            selectionSummary: selection,
            letterAppeals: {
              status: "complete",
              appeal,
              date: "2026-09-27",
              members: [
                { id: "10", status: "verified" },
                { id: "11", status: "verified" },
              ],
            },
          },
        ]}
      />,
    );
    expect(
      screen.getByText("Joint recipients").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Prepared, not mailed").nextElementSibling,
    ).toHaveTextContent("1");
    expect(screen.getByText("Mailed").nextElementSibling).toHaveTextContent(
      "0",
    );
    fireEvent.click(screen.getByText("Selection and appeal details"));
    expect(screen.getByText(/3 not selected/)).toBeVisible();
    expect(screen.getByText(/President's Society: CY26-PRES/)).toBeVisible();
    expect(
      screen.getByText(/2 of 2 member assignments confirmed/),
    ).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });
  it("does not present a preview as prepared or imply it already applied appeals", () => {
    render(
      <LetterBatchSummary items={[row]} selectionSummary={selection} preview />,
    );
    expect(
      screen.getByRole("region", { name: "Selection summary" }),
    ).toBeVisible();
    expect(screen.queryByText("Prepared, not mailed")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Saved NXT appeal receipts"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Recipients outside this selection"));
    expect(
      screen.getByText(/Not selected does not mean excluded or sent/),
    ).toBeVisible();
  });
  it("keeps pending member updates in needs verification, not prepared", () => {
    render(
      <LetterBatchSummary
        items={[
          {
            ...row,
            letterAppeals: {
              status: "needs_review",
              appeal,
              members: [
                { id: "10", status: "verified" },
                { id: "11", status: "pending" },
              ],
            },
          },
        ]}
      />,
    );
    expect(
      screen.getByText("Needs verification").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Prepared, not mailed").nextElementSibling,
    ).toHaveTextContent("0");
  });
  it("labels missing old-batch facts explicitly instead of zero", () => {
    render(<LetterBatchSummary items={[{ ...row, status: "mailed" }]} />);
    fireEvent.click(screen.getByText("Selection and appeal details"));
    expect(
      screen.getByText(/outside this batch were not recorded/),
    ).toBeVisible();
    expect(screen.getByText(/no saved NXT appeal receipt/)).toBeVisible();
    expect(screen.getByText("Mailed").nextElementSibling).toHaveTextContent(
      "1",
    );
  });
});
