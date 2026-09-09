import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportNewRecordReview from "./ImportNewRecordReview";
afterEach(cleanup);
const row = { id: "9", status: "Needs Review", input: { firstName: "Jane", lastName: "Dolphin" } };
const clear = { ...row, newRecordReview: { status: "clear", token: "token", checkedAt: new Date().toISOString() } };

describe("resolve unmatched constituent", () => {
  it("offers checking, never creates automatically or on initial render", async () => {
    const onAction = vi.fn().mockResolvedValue();
    render(<ImportNewRecordReview row={row} importIntent="mixed" onAction={onAction} />);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirm as new constituent" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check for duplicates" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("review_new_check", expect.any(Object)));
  });
  it("requires explicit confirmation after clear checks", async () => {
    const onAction = vi.fn().mockResolvedValue();
    render(<ImportNewRecordReview row={clear} importIntent="new" onAction={onAction} />);
    const confirm = screen.getByRole("button", { name: "Confirm as new constituent" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("reviewed_new", { confirmed: true, reviewToken: "token", reviewNote: "" }));
  });
  it("requires an explanatory note when rejecting all suggestions", () => {
    const rejected = { ...clear, rejectedMatches: [{ decision: "rejected", constituentId: "55", reviewedAt: "today", reviewedByUserId: "7" }] };
    render(<ImportNewRecordReview row={rejected} importIntent="mixed" onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox"));
    const confirm = screen.getByRole("button", { name: "Confirm as new constituent" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Different individual; compared record details." } });
    expect(confirm).toBeEnabled();
  });
  it.each([["correct_csv", "Choose corrected CSV"], ["review_batch", "Review batch rows"]])("provides a concrete action for %s", (nextAction, label) => {
    const action = vi.fn();
    render(<ImportNewRecordReview row={{ ...row, newRecordReview: { status: "blocked", message: "Resolve this blocker", nextAction } }} importIntent="new" onCorrectCsv={action} onReviewBatch={action} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Confirm as new constituent" })).not.toBeInTheDocument();
  });
  it("keeps failed checks actionable without a create option", async () => {
    render(<ImportNewRecordReview row={row} importIntent="new" onAction={vi.fn().mockRejectedValue(new Error("NXT connection unavailable. Retry checks."))} />);
    fireEvent.click(screen.getByRole("button", { name: "Check for duplicates" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Retry checks");
    expect(screen.getByRole("button", { name: "Check for duplicates" })).toBeEnabled();
  });
  it("does not offer creation for matched or already created rows", () => {
    const { rerender } = render(<ImportNewRecordReview row={{ ...clear, match: { blackbaudConstituentId: "55" } }} importIntent="new" />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    rerender(<ImportNewRecordReview row={{ ...clear, createdBlackbaudConstituentId: "55" }} importIntent="new" />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("explains update-only imports instead of offering an unsafe create button", () => {
    render(<ImportNewRecordReview row={row} importIntent="update" />);
    expect(screen.getByRole("status")).toHaveTextContent("only updates existing records");
    expect(screen.getByRole("button", { name: /Choose CSV/ })).toBeInTheDocument();
  });
  it("provides source correction for conflicts instead of leaving only Skip", () => {
    render(<ImportNewRecordReview row={{ ...row, status: "Conflict" }} importIntent="new" />);
    expect(screen.getByRole("button", { name: "Choose corrected CSV" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm as new constituent" })).not.toBeInTheDocument();
  });
});
