import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecipientSuggestionsDialog from "./RecipientSuggestionsDialog";
import { triageRow } from "../../../../test/societyLetterTriageFixture";
import { straightforwardRecipient } from "@/utils/societyLetterReviewTriage";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const suggestions = (count) =>
  Array.from({ length: count }, (_, index) => {
    const row = triageRow(String(index + 10));
    return { row, values: straightforwardRecipient(row) };
  });
describe("recipient suggestion confirmation", () => {
  it("pages a long list without losing selections or requiring individual review", async () => {
    const save = vi.fn(),
      close = vi.fn();
    render(
      <RecipientSuggestionsDialog
        suggestions={suggestions(65)}
        revision={7}
        onSave={save}
        onClose={close}
      />,
    );
    expect(screen.getByText("65 of 65 selected")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Confirm Alex Example 10"));
    fireEvent.click(screen.getByRole("button", { name: "Next suggestions" }));
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Confirm Alex Example 60"));
    fireEvent.click(
      screen.getByRole("button", { name: "Previous suggestions" }),
    );
    expect(screen.getByLabelText("Confirm Alex Example 10")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(/I accept the suggested names/));
    fireEvent.click(
      screen.getByRole("button", { name: "Save 63 recipient reviews" }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const body = save.mock.calls[0][0];
    expect(body.suggestionsRevision).toBe(7);
    expect(body.recipients).toHaveLength(63);
    expect(
      body.recipients.some((item) => ["10", "60"].includes(item.householdId)),
    ).toBe(false);
  });
  it("keeps failed saves visible without automatically retrying or claiming completion", async () => {
    const save = vi
      .fn()
      .mockRejectedValue(
        new Error("The workspace changed. Reload suggestions."),
      );
    render(
      <RecipientSuggestionsDialog
        suggestions={suggestions(1)}
        revision={7}
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/I accept the suggested names/));
    fireEvent.click(
      screen.getByRole("button", { name: "Save 1 recipient review" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The workspace changed",
    );
    expect(
      screen.getByRole("button", { name: "Save 1 recipient review" }),
    ).toBeDisabled();
    expect(save).toHaveBeenCalledOnce();
  });
  it("requires renewed confirmation after selection changes and cancels without a save", () => {
    const save = vi.fn(),
      close = vi.fn();
    render(
      <RecipientSuggestionsDialog
        suggestions={suggestions(2)}
        revision={7}
        onSave={save}
        onClose={close}
      />,
    );
    fireEvent.click(screen.getByLabelText(/I accept the suggested names/));
    fireEvent.click(screen.getByLabelText("Confirm Alex Example 10"));
    expect(
      screen.getByLabelText(/I accept the suggested names/),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
});
