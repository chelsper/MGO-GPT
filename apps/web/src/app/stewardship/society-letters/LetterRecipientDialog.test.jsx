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
