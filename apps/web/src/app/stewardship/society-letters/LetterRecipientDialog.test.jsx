import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import LetterRecipientDialog from "./LetterRecipientDialog";

const recipient = {
  name: "Alex & Pat Sample",
  members: ["10", "11"],
  memberNames: [
    {
      constituentId: "10",
      name: "Alex Sample",
      firstName: "Alex",
      lastName: "Sample",
    },
    {
      constituentId: "11",
      name: "Pat Sample",
      firstName: "Pat",
      lastName: "Sample",
    },
  ],
  recipientCandidates: [
    {
      constituentId: "10",
      addressee: "Alex Sample",
      salutation: "Alex",
      address: "10 Test Street",
      emailCandidates: ["alex@example.org", "alex2@example.org"],
    },
    {
      constituentId: "11",
      addressee: "Pat Sample",
      salutation: "Pat",
      address: "11 Test Street",
      email: "pat@example.org",
    },
  ],
  recipientReview: { status: "unreviewed", values: null },
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
describe("letter recipient review dialog", () => {
  it("edits address components together and clears them after a free-form correction", () => {
    const save = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={recipient}
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByText("Separate address merge fields"));
    fireEvent.change(screen.getByLabelText("Street line 1"), {
      target: { value: "25 Test St" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Boston" },
    });
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "25 Test St\nBoston",
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(save.mock.calls[0][0].addressParts).toMatchObject({
      address_line_1: "25 Test St",
      city: "Boston",
    });
    fireEvent.change(screen.getByLabelText("Mailing address"), {
      target: { value: "Different address" },
    });
    expect(screen.getByLabelText("City")).toHaveValue("");
    expect(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    ).not.toBeChecked();
  });
  it("protects unsaved choices on skip, jump, close, and Escape", () => {
    const navigate = vi.fn(),
      skip = vi.fn(),
      close = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={recipient}
        onSave={vi.fn()}
        onClose={close}
        navigation={{
          index: 0,
          items: [
            { householdId: "10", name: "Alex" },
            { householdId: "20", name: "Taylor" },
          ],
          savedCount: 0,
          onNavigate: navigate,
          onSkip: skip,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(skip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Salutation")).toHaveValue("Alex");
    fireEvent.change(screen.getByLabelText("Go to recipient"), {
      target: { value: "1" },
    });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Discard edits and continue" }),
    );
    expect(close).toHaveBeenCalledOnce();
  });
  it("opens a draft with current unsaved wording and returns to the edits without saving", () => {
    const save = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={recipient}
        onSave={save}
        onClose={vi.fn()}
        template={{
          societyName: "President's Society",
          version: "a".repeat(64),
          filename: "saved.docx",
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Alex and Pat" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Preview personalized letter" }),
    );
    expect(
      screen.getByText(/Draft only, using your current recipient edits/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.getByLabelText("Salutation")).toHaveValue("Alex and Pat");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps the original review token if saved workspace details change during editing", () => {
    const save = vi.fn();
    const props = {
      recipient: {
        ...recipient,
        recipientReview: { ...recipient.recipientReview, token: "original" },
      },
      onSave: save,
      onClose: vi.fn(),
    };
    const view = render(<LetterRecipientDialog {...props} />);
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    view.rerender(
      <LetterRecipientDialog
        {...props}
        recipient={{
          ...props.recipient,
          recipientReview: {
            ...props.recipient.recipientReview,
            token: "changed",
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ reviewToken: "original" }),
    );
  });
  it("requires an explicit recipient, allows joint wording and separate spouse address, and never auto-selects email", () => {
    const save = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={recipient}
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Recipient record")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    expect(screen.getByLabelText("Addressee")).toHaveValue("Alex Sample");
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("");
    expect(
      within(screen.getByLabelText("Email (optional)")).getAllByRole("option"),
    ).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Addressee"), {
      target: { value: "Alex & Pat Sample" },
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Alex and Pat" },
    });
    fireEvent.change(screen.getByLabelText("Use mailing address from"), {
      target: { value: "11" },
    });
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "11 Test Street",
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientConstituentId: "10",
        addressConstituentId: "11",
        addressee: "Alex & Pat Sample",
        salutation: "Alex and Pat",
        email: "",
        confirm: true,
      }),
    );
  });
  it("resets confirmation and email when changing recipient and updates name fields", () => {
    render(
      <LetterRecipientDialog
        recipient={recipient}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Email (optional)"), {
      target: { value: "alex2@example.org" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "11" },
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Addressee")).toHaveValue("Pat Sample");
    fireEvent.click(screen.getByText("Name merge fields for this recipient"));
    expect(
      screen.getByText("Recipient first name").nextSibling,
    ).toHaveTextContent("Pat");
    expect(screen.getByText("Spouse first name").nextSibling).toHaveTextContent(
      "Alex",
    );
  });
  it("does not prefill stale choices; shows inline failure and permits cancel", () => {
    const close = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={{
          ...recipient,
          recipientReview: { status: "needs_review", values: null },
        }}
        error="Reload the holding list"
        onSave={vi.fn()}
        onClose={close}
      />,
    );
    expect(screen.getByText(/changed since the last review/)).toBeVisible();
    expect(screen.getByLabelText("Recipient record")).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reload the holding list",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("loads saved wording but requires reconfirmation after editing", () => {
    render(
      <LetterRecipientDialog
        recipient={{
          ...recipient,
          recipientReview: {
            status: "saved",
            values: {
              recipientConstituentId: "10",
              addressConstituentId: "11",
              addressee: "Alex & Pat",
              salutation: "Friends",
              address: "Joint address",
              email: "",
            },
          },
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "Joint address",
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Alex and Pat" },
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
  });
});
