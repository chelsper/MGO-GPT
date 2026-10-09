import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { completedLetter } from "../../../../test/societyLetterDispatchFixture";
import CompletedLetterActions from "./CompletedLetterActions";

function fixture() {
  const first = completedLetter({ name: "Alex Example" });
  const second = completedLetter({ id: "second", name: "Pat Example" });
  const blocked = completedLetter({
    id: "blocked",
    name: "Blocked Household",
    letterAppeals: { status: "pending" },
  });
  return {
    batch: {
      id: first.batchId,
      channel: "post",
      items: [first, second, blocked],
    },
    downloadBatch: vi.fn(),
    setConfirmation: vi.fn(),
    busy: false,
  };
}
describe("completed letter subset controls", () => {
  it("lists completed recipients and omissions, without doing anything on page load", async () => {
    const f = fixture();
    render(<CompletedLetterActions {...f} />);
    expect(screen.getByText("2 selected; 1 not included.")).toBeVisible();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.queryByRole("checkbox", { name: /Blocked Household/ }),
    ).not.toBeInTheDocument();
    expect(f.downloadBatch).not.toHaveBeenCalled();
    expect(f.setConfirmation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Not included in this selection"));
    expect(
      screen.getByText("Blocked Household / Still in progress"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: /Pat Example/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Download selected print-ready PDF" }),
    );
    await waitFor(() =>
      expect(f.downloadBatch).toHaveBeenCalledExactlyOnceWith(
        f.batch.id,
        undefined,
        "combined-pdf",
        [f.batch.items[0].id],
      ),
    );
    expect(f.setConfirmation).not.toHaveBeenCalled();
  });
  it("freezes the selected IDs and names for an explicit mailing confirmation", () => {
    const f = fixture();
    render(<CompletedLetterActions {...f} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Pat Example/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark selected letters mailed" }),
    );
    expect(f.setConfirmation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: "mail_selected_letters",
        batchId: f.batch.id,
        deliveryIds: [f.batch.items[0].id],
        recipientNames: ["Alex Example / President's Society"],
        description: expect.stringContaining("actually been dispatched"),
      }),
    );
    expect(f.downloadBatch).not.toHaveBeenCalled();
  });
  it("requires reselecting newly completed letters, retains mailed downloads, and drops invalid selections", () => {
    const f = fixture();
    const { rerender } = render(<CompletedLetterActions {...f} />);
    f.batch = {
      ...f.batch,
      items: [
        { ...f.batch.items[0], status: "mailed" },
        { ...f.batch.items[1], letterAppeals: { status: "pending" } },
        completedLetter({ id: "new", name: "New Example" }),
      ],
    };
    rerender(<CompletedLetterActions {...f} />);
    expect(
      screen.getByRole("checkbox", { name: /New Example/ }),
    ).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.getByRole("checkbox", { name: /Alex Example/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Mark selected letters mailed" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Select all completed" }),
    );
    expect(screen.getByRole("checkbox", { name: /New Example/ })).toBeChecked();
  });
  it("keeps the download selector when all completed letters are marked mailed but the batch has a blocked letter", async () => {
    const f = fixture();
    f.batch.items[0].status = "mailed";
    f.batch.items[1].status = "mailed";
    render(<CompletedLetterActions {...f} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.getByText(/2 available to download; 0 ready to mail/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mark selected letters mailed" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Download selected letters (.zip)" }),
    );
    await waitFor(() =>
      expect(f.downloadBatch).toHaveBeenCalledExactlyOnceWith(
        f.batch.id,
        undefined,
        "docx",
        [f.batch.items[0].id, "second"],
      ),
    );
    expect(f.setConfirmation).not.toHaveBeenCalled();
  });
  it("downloads a mixed mailed/prepared selection but confirms mailing only for prepared letters", async () => {
    const f = fixture();
    f.batch.items[0].status = "mailed";
    render(<CompletedLetterActions {...f} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Download selected print-ready PDF" }),
    );
    await waitFor(() =>
      expect(f.downloadBatch).toHaveBeenCalledExactlyOnceWith(
        f.batch.id,
        undefined,
        "combined-pdf",
        [f.batch.items[0].id, "second"],
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark selected letters mailed" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mark selected letters mailed" }),
    );
    expect(f.setConfirmation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        deliveryIds: ["second"],
        recipientNames: ["Pat Example / President's Society"],
        title: "Mark 1 selected letter mailed?",
      }),
    );
  });
  it("supports Word archives but not a misleading combined PDF for mixed formats", async () => {
    const f = fixture();
    f.batch.items[1].postalDocument.format = "docx";
    render(<CompletedLetterActions {...f} />);
    expect(
      screen.queryByRole("button", {
        name: "Download selected print-ready PDF",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Download selected letters (.zip)" }),
    );
    await waitFor(() =>
      expect(f.downloadBatch).toHaveBeenCalledWith(
        f.batch.id,
        undefined,
        "docx",
        [f.batch.items[0].id, "second"],
      ),
    );
  });
  it("disables actions and selection during a download or workspace update", async () => {
    const f = fixture();
    let finish;
    f.downloadBatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = render(<CompletedLetterActions {...f} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Download selected print-ready PDF" }),
    );
    for (const control of [
      ...screen.getAllByRole("button"),
      ...screen.getAllByRole("checkbox"),
    ])
      expect(control).toBeDisabled();
    finish();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark selected letters mailed" }),
      ).toBeEnabled(),
    );
    rerender(<CompletedLetterActions {...f} busy />);
    for (const control of within(screen.getByRole("region")).getAllByRole(
      "button",
    ))
      expect(control).toBeDisabled();
  });
});
