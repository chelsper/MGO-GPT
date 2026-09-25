import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LetterRecipientDialog from "./LetterRecipientDialog";
import { reviewVersion } from "./letterReviewRecovery";

const values = {
  recipientConstituentId: "10",
  addressConstituentId: "10",
  addressee: "Alex Example",
  salutation: "Alex",
  address: "10 Example St",
  email: "",
};
const recipient = {
  householdId: "10",
  name: "Alex Example",
  members: ["10"],
  status: "ready",
  recipientCandidates: [{ constituentId: "10", ...values }],
  recipientReview: {
    editable: true,
    token: "same-source",
    status: "saved",
    values,
    savedAt: "2026-09-25T10:00:00Z",
  },
};
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
});
function setup(options = {}) {
  const props = {
    recipient,
    onSave: vi.fn(),
    onClose: vi.fn(),
    onDraftChange: vi.fn(),
    ...options,
  };
  const view = render(<LetterRecipientDialog {...props} />);
  return {
    props,
    ...view,
    update(change) {
      Object.assign(props, change);
      view.rerender(<LetterRecipientDialog {...props} />);
    },
  };
}
describe("recipient conflict recovery", () => {
  it("compares explicitly, preserves draft wording, and requires confirmation before a separate save", async () => {
    let view;
    const latest = {
      ...recipient,
      recipientReview: {
        ...recipient.recipientReview,
        values: { ...values, salutation: "Latest greeting" },
        savedAt: "later",
      },
    };
    const load = vi.fn(async () => {
      view.update({ recipient: latest });
      return latest;
    });
    view = setup({
      onReloadSaved: load,
      onResolveConflict: () => view.update({ conflict: false }),
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "My greeting" },
    });
    expect(
      screen.queryByText(/Unsaved draft restored/),
    ).not.toBeInTheDocument();
    view.update({ conflict: true });
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    );
    expect(await screen.findByText("Latest greeting")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Compare before continuing" }),
    ).toHaveFocus();
    expect(screen.getByText(/unchanged fields/)).toBeVisible();
    expect(screen.getByLabelText("Salutation")).toHaveValue("My greeting");
    fireEvent.click(
      screen.getByRole("button", { name: "Keep my draft for review" }),
    );
    expect(view.props.onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(view.props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        salutation: "My greeting",
        reviewToken: "same-source",
        confirm: true,
      }),
    );
    expect(load).toHaveBeenCalledOnce();
  });
  it("does not rebase an old draft when household source options changed", async () => {
    let view;
    const latest = {
      ...recipient,
      recipientReview: {
        ...recipient.recipientReview,
        token: "new-source",
        values: { ...values, salutation: "New greeting" },
      },
    };
    view = setup({
      conflict: true,
      onReloadSaved: async () => {
        view.update({ recipient: latest });
        return latest;
      },
      onResolveConflict: () => view.update({ conflict: false }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    );
    expect(
      await screen.findByRole("button", { name: "Keep my draft for review" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Use latest saved choices" }),
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue("New greeting");
    expect(view.props.onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("refuses a comparison that became stale again before the user's choice", async () => {
    const view = setup({
      conflict: true,
      onReloadSaved: async () => recipient,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    );
    await screen.findByRole("region", { name: "Compare recipient choices" });
    view.update({
      recipient: {
        ...recipient,
        recipientReview: { ...recipient.recipientReview, savedAt: "newer" },
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use latest saved choices" }),
    );
    expect(screen.getByText(/Saved choices changed again/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
    expect(view.props.onSave).not.toHaveBeenCalled();
  });
  it("retains drafts on failed reads and refuses saving when the household is no longer editable", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(null);
    const view = setup({
      conflict: true,
      onReloadSaved: load,
      draft: {
        values: { ...values, salutation: "Retained" },
        initialValues: values,
        baseVersion: reviewVersion(recipient),
        reviewToken: "same-source",
        requiresComparison: true,
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    );
    expect(
      await screen.findByText(/Saved choices could not be loaded/),
    ).toBeVisible();
    expect(screen.getByLabelText("Salutation")).toHaveValue("Retained");
    fireEvent.click(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    );
    expect(
      await screen.findByText(/This household is no longer editable/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Use latest saved choices" }),
    ).toBeDisabled();
    expect(view.props.onSave).not.toHaveBeenCalled();
  });
  it("restores a paused draft without restoring its approval or bypassing comparison", () => {
    setup({
      onReloadSaved: vi.fn(),
      draft: {
        values: { ...values, salutation: "Retained" },
        initialValues: values,
        baseVersion: reviewVersion(recipient),
        reviewToken: "same-source",
        requiresComparison: true,
        confirmed: true,
      },
    });
    expect(screen.getByLabelText("Salutation")).toHaveValue("Retained");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
  });
  it("can keep a draft while closing without saving or discarding it", async () => {
    const discard = vi.fn();
    const view = setup({ onDiscardDraft: discard });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Keep this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Keep draft and continue" }),
    );
    expect(view.props.onClose).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();
    expect(view.props.onSave).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(view.props.onDraftChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({ salutation: "Keep this" }),
        }),
      ),
    );
  });
});
