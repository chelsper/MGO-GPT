import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import LetterRecipientDialog from "./LetterRecipientDialog";
import { contactChoiceKey } from "@/utils/societyLetterContacts";

const recipient = {
  householdId: "10",
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
afterEach(() => vi.restoreAllMocks());
describe("letter recipient review dialog", () => {
  it("opens exclusion confirmation from review without saving edits, and preserves them when canceled", () => {
    const save = vi.fn(),
      exclude = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={recipient}
        onSave={save}
        onClose={vi.fn()}
        onExclude={exclude}
        exclusion={{ period: { start: "2026-01-01", end: "2026-12-31" } }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "My unsaved greeting" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Exclude for this period" }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Exclude Alex & Pat Sample for this period?",
    );
    expect(screen.getByText(/2026-01-01 through 2026-12-31/)).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    expect(exclude).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to recipient review" }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByLabelText("Salutation")).toHaveValue(
      "My unsaved greeting",
    );
    expect(screen.getByLabelText("Recipient record")).toHaveValue("10");
    expect(
      screen.getByRole("button", { name: "Exclude for this period" }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Exclude for this period" }),
    );
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue(
      "My unsaved greeting",
    );
    expect(save).not.toHaveBeenCalled();
    expect(exclude).not.toHaveBeenCalled();
  });
  it.each([
    { busy: true },
    { unavailable: true },
    { conflict: true },
    { exclusion: { disabled: true } },
  ])(
    "blocks review exclusions while an operation or recovery is required: %j",
    (props) => {
      const exclude = vi.fn();
      render(
        <LetterRecipientDialog
          recipient={recipient}
          onSave={vi.fn()}
          onClose={vi.fn()}
          onExclude={exclude}
          {...props}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Exclude for this period" }),
      ).toBeDisabled();
      expect(exclude).not.toHaveBeenCalled();
    },
  );
  it("suggests preferred joint wording and makes the template's actual name fields editable without fetching", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const save = vi.fn();
    const household = structuredClone(recipient);
    household.memberNames[0].preferredName = "Lex";
    household.recipientCandidates = household.recipientCandidates.slice(0, 1);
    render(
      <LetterRecipientDialog
        recipient={household}
        template={{ version: "v1", usedFields: ["first_names", "addressee"] }}
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue("Lex & Pat");
    expect(
      screen.getByText(
        /This template uses name merge fields rather than Salutation/,
      ),
    ).toBeVisible();
    const greeting = screen.getByLabelText(
      "Edit Individual or household first names",
    );
    expect(greeting).toBeVisible();
    expect(greeting).toHaveValue("Lex & Pat");
    fireEvent.change(greeting, { target: { value: "Lex and Patricia" } });
    fireEvent.change(screen.getByLabelText("Addressee"), {
      target: { value: "Our friends Lex and Patricia" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        addressee: "Our friends Lex and Patricia",
        nameOverrides: { first_names: "Lex and Patricia" },
      }),
    );
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reset name fields to query values" }),
    );
    expect(greeting).toHaveValue("Lex & Pat");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("preserves saved custom names and salutation until a different recipient is chosen", () => {
    const household = structuredClone(recipient);
    household.memberNames[0].preferredName = "Lex";
    household.nameOverrides = { first_name: "Custom saved name" };
    household.recipientReview.values = {
      recipientConstituentId: "10",
      addressConstituentId: "10",
      addressee: "Custom addressee",
      salutation: "My custom greeting",
      address: "10 Test Street",
      email: "",
      nameOverrides: household.nameOverrides,
    };
    render(
      <LetterRecipientDialog
        recipient={household}
        template={{ version: "v1", usedFields: ["first_name"] }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue(
      "My custom greeting",
    );
    expect(screen.getByLabelText("Edit Recipient first name")).toHaveValue(
      "Custom saved name",
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "11" },
    });
    expect(screen.getByLabelText("Edit Recipient first name")).toHaveValue(
      "Pat",
    );
  });
  it("offers organization contacts using Key indicator alone and suggests the selected preferred name", () => {
    const household = structuredClone(recipient);
    const contact = {
      role: "Main contact",
      firstName: "Alexandra",
      lastName: "Contact",
      preferredName: "Lex",
    };
    household.recipientCandidates = [
      {
        ...household.recipientCandidates[0],
        organizationContacts: {
          keyIndicator: "organization",
          contacts: [contact],
        },
      },
    ];
    const save = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={household}
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    const chooser = screen.getByRole("combobox", {
      name: "Name this letter to",
    });
    expect(chooser).toHaveValue("");
    fireEvent.change(chooser, { target: { value: contactChoiceKey(contact) } });
    expect(screen.getByLabelText("Salutation")).toHaveValue("Lex");
    expect(screen.getByLabelText("Addressee")).toHaveValue("Alexandra Contact");
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "10 Test Street",
    );
    expect(save).not.toHaveBeenCalled();
  });
  it("preselects the sole returned record and address without saving, fetching, or confirming", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const save = vi.fn();
    const close = vi.fn();
    const trackDraft = vi.fn();
    const single = {
      ...recipient,
      members: ["10"],
      recipientCandidates: [
        {
          ...recipient.recipientCandidates[0],
          addressParts: {
            address_line_1: "10 Test Street",
            city: "Example City",
            state: "FL",
            zip: "00000",
          },
        },
      ],
    };
    render(
      <LetterRecipientDialog
        recipient={single}
        template={{ version: "v1" }}
        onSave={save}
        onClose={close}
        onDraftChange={trackDraft}
      />,
    );
    expect(screen.getByLabelText("Recipient record")).toHaveValue(
      "Alex Sample (ID 10)",
    );
    expect(screen.getByLabelText("Recipient record")).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.queryByRole("combobox", { name: "Recipient record" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Addressee")).toHaveValue("Alex Sample");
    expect(screen.getByLabelText("Salutation")).toHaveValue("Alex");
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "10 Test Street",
    );
    expect(screen.getByLabelText("City")).toHaveValue("Example City");
    expect(screen.getByLabelText("ZIP / postal code")).toHaveValue("00000");
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Preview personalized letter" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", { name: /I reviewed/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(trackDraft).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("Keep draft and continue"),
    ).not.toBeInTheDocument();
  });
  it("focuses the requested field directly for a sole record and still requires review to save", () => {
    const save = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={{
          ...recipient,
          recipientCandidates: recipient.recipientCandidates.slice(0, 1),
        }}
        initialFocus="address"
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Mailing address")).toHaveFocus();
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientConstituentId: "10",
        addressConstituentId: "10",
        email: "",
        confirm: true,
      }),
    );
    expect(recipient.members).toEqual(["10", "11"]);
  });
  it("preselects a sole foundation record but leaves its multiple contacts as a choice", () => {
    const org = {
      ...recipient,
      recipientCandidates: [
        {
          ...recipient.recipientCandidates[0],
          addressee: "Example Foundation",
          salutation: "Foundation team",
          organizationContacts: {
            constituencyCodes: ["Foundation"],
            contacts: [
              { role: "Main contact", firstName: "Alex", lastName: "Contact" },
              {
                role: "Society letter contact",
                firstName: "Pat",
                lastName: "Contact",
              },
            ],
          },
        },
      ],
    };
    render(
      <LetterRecipientDialog
        recipient={org}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Addressee")).toHaveValue(
      "Example Foundation",
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue("Foundation team");
    expect(screen.getByLabelText("Name this letter to")).toHaveValue("");
    expect(
      within(screen.getByLabelText("Name this letter to")).getAllByRole(
        "option",
      ),
    ).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
  });
  it("preserves saved single-recipient wording and email rather than replacing them with defaults", () => {
    render(
      <LetterRecipientDialog
        recipient={{
          ...recipient,
          recipientCandidates: recipient.recipientCandidates.slice(0, 1),
          recipientReview: {
            status: "saved",
            values: {
              recipientConstituentId: "10",
              addressConstituentId: "10",
              addressee: "Custom addressee",
              salutation: "Custom greeting",
              address: "Custom address",
              email: "alex2@example.org",
            },
          },
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Addressee")).toHaveValue("Custom addressee");
    expect(screen.getByLabelText("Salutation")).toHaveValue("Custom greeting");
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "Custom address",
    );
    expect(screen.getByLabelText("Email (optional)")).toHaveValue(
      "alex2@example.org",
    );
    expect(
      screen.getByRole("checkbox", { name: /I reviewed/ }),
    ).not.toBeChecked();
  });
  it("does not overwrite an intentionally blank restored draft with the sole candidate", () => {
    const blank = {
      recipientConstituentId: "",
      addressConstituentId: "",
      addressee: "",
      salutation: "",
      address: "",
      email: "",
    };
    render(
      <LetterRecipientDialog
        recipient={{
          ...recipient,
          recipientCandidates: recipient.recipientCandidates.slice(0, 1),
        }}
        draft={{ values: blank, initialValues: blank }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Recipient record" }),
    ).toHaveValue("");
    expect(screen.queryByLabelText("Addressee")).not.toBeInTheDocument();
  });
  it("does not invent a recipient when no candidates were returned", () => {
    render(
      <LetterRecipientDialog
        recipient={{ ...recipient, recipientCandidates: [] }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Recipient record" }),
    ).toHaveValue("");
    expect(screen.queryByLabelText("Addressee")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
  });
  it("waits for an explicit recipient choice before focusing the requested address field", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const save = vi.fn();
    render(
      <LetterRecipientDialog
        recipient={recipient}
        initialFocus="address"
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Recipient record")).toHaveFocus();
    expect(screen.getByLabelText("Recipient record")).toHaveValue("");
    expect(screen.getByText(/Then we'll take you/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    expect(screen.getByLabelText("Mailing address")).toHaveFocus();
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("uses live edits for postal guidance and focuses the missing greeting part", () => {
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
    expect(
      screen.queryByRole("region", { name: "Recipient details to complete" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mailing address"), {
      target: { value: " " },
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review greeting" }));
    expect(screen.getByLabelText("Salutation")).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Add mailing address" }),
    );
    expect(screen.getByLabelText("Mailing address")).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Choose email" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mailing address"), {
      target: { value: "12 New Street" },
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Alex" },
    });
    expect(
      screen.queryByRole("region", { name: "Recipient details to complete" }),
    ).not.toBeInTheDocument();
  });
  it("only flags email for email review and retains permission and save-error notices", () => {
    render(
      <LetterRecipientDialog
        recipient={recipient}
        channel="email"
        error="Workspace changed; reload saved results."
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Mailing address"), {
      target: { value: "" },
    });
    expect(
      screen.queryByRole("button", { name: "Add mailing address" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose email" }));
    expect(screen.getByLabelText("Email for this letter")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Email for this letter"), {
      target: { value: "alex@example.org" },
    });
    expect(
      screen.queryByRole("button", { name: "Choose email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Selecting one does not confirm email permission/),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Workspace changed; reload saved results.",
    );
    expect(
      screen.getByRole("checkbox", { name: /communication restrictions/ }),
    ).not.toBeChecked();
  });
  it("opens the contact chooser without choosing or requiring a contact", () => {
    const org = structuredClone(recipient);
    org.recipientCandidates[0].organizationContacts = {
      constituencyCodes: ["Business"],
      contacts: [
        { role: "Main contact", firstName: "Taylor", lastName: "Main" },
      ],
    };
    render(
      <LetterRecipientDialog
        recipient={org}
        initialFocus="contacts"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    expect(screen.getByLabelText("Name this letter to")).toHaveFocus();
    expect(screen.getByLabelText("Name this letter to")).toHaveValue("");
    expect(screen.getByText(/choose a letter contact, or keep/i)).toBeVisible();
    expect(
      screen.getByText(/The contact supplies/).closest("details"),
    ).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeEnabled();
  });
  it("opens a saved missing addressee directly and does not steal focus on later edits", () => {
    const saved = structuredClone(recipient);
    saved.recipientReview = {
      status: "saved",
      token: "saved-token",
      values: {
        recipientConstituentId: "10",
        addressConstituentId: "10",
        addressee: "",
        salutation: "Alex",
        address: "",
        email: "",
      },
    };
    render(
      <LetterRecipientDialog
        recipient={saved}
        initialFocus="greeting"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Addressee")).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Add mailing address" }),
    );
    fireEvent.change(screen.getByLabelText("Mailing address"), {
      target: { value: "12 Street" },
    });
    expect(screen.getByLabelText("Mailing address")).toHaveFocus();
  });
  it("does not offer edit shortcuts when the recipient is unavailable", () => {
    render(
      <LetterRecipientDialog
        recipient={recipient}
        unavailable
        initialFocus="address"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "no longer available for editing",
    );
    expect(screen.getByLabelText("Recipient record")).toBeDisabled();
    expect(screen.queryByText(/Then we'll take you/)).not.toBeInTheDocument();
  });
  it("offers organization contacts without picking among them and preserves the organization's address and ID", () => {
    const save = vi.fn();
    const main = {
      role: "Main contact",
      firstName: "Taylor",
      lastName: "Main",
    };
    const society = {
      role: "Society letter contact",
      firstName: "Jamie",
      lastName: "Letters",
    };
    const org = structuredClone(recipient);
    org.recipientCandidates[0].organizationContacts = {
      constituencyCodes: ["Business"],
      contacts: [main, society],
    };
    render(
      <LetterRecipientDialog recipient={org} onSave={save} onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    const chooser = screen.getByLabelText("Name this letter to");
    expect(chooser).toHaveValue("");
    expect(
      within(chooser).getByRole("option", {
        name: "Jamie Letters (Society letter contact)",
      }),
    ).toBeInTheDocument();
    fireEvent.change(chooser, { target: { value: contactChoiceKey(society) } });
    expect(screen.getByLabelText("Addressee")).toHaveValue("Jamie Letters");
    expect(screen.getByLabelText("Salutation")).toHaveValue("Jamie");
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "10 Test Street",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(save.mock.calls[0][0]).toMatchObject({
      organizationContactKey: contactChoiceKey(society),
      recipientConstituentId: "10",
      addressConstituentId: "10",
    });
    fireEvent.change(chooser, { target: { value: contactChoiceKey(main) } });
    expect(
      screen.getByRole("checkbox", { name: /I reviewed/ }),
    ).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "11" },
    });
    expect(
      screen.queryByLabelText("Name this letter to"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Salutation")).toHaveValue("Pat");
  });
  it("restores a saved contact selection and allows returning to the organization's own greeting", () => {
    const contact = {
      role: "Main contact",
      firstName: "Taylor",
      lastName: "Main",
    };
    const org = structuredClone(recipient);
    org.recipientCandidates[0].organizationContacts = {
      constituencyCodes: ["Foundation"],
      contacts: [contact],
    };
    org.recipientReview.values = {
      recipientConstituentId: "10",
      addressConstituentId: "10",
      organizationContactKey: contactChoiceKey(contact),
      addressee: "Edited contact wording",
      salutation: "Taylor",
      address: "10 Test Street",
      email: "",
    };
    render(
      <LetterRecipientDialog
        recipient={org}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Name this letter to")).toHaveValue(
      contactChoiceKey(contact),
    );
    expect(screen.getByLabelText("Addressee")).toHaveValue(
      "Edited contact wording",
    );
    fireEvent.change(screen.getByLabelText("Name this letter to"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("Addressee")).toHaveValue("Alex Sample");
  });
  it("optionally includes the organization above a contact, previews edits, and saves both lines without changing the greeting or record", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json(
          { error: "Synthetic preview unavailable." },
          { status: 422 },
        ),
      );
    const save = vi.fn();
    const contact = {
      role: "Main contact",
      firstName: "Alexandra",
      preferredName: "Lex",
      lastName: "Contact",
    };
    const org = structuredClone(recipient);
    org.recipientCandidates = [
      {
        ...org.recipientCandidates[0],
        addressee: "Example Foundation",
        organizationContacts: {
          keyIndicator: "organization",
          contacts: [contact],
        },
      },
    ];
    render(
      <LetterRecipientDialog
        recipient={org}
        onSave={save}
        onClose={vi.fn()}
        template={{ version: "a".repeat(64), filename: "saved.docx" }}
      />,
    );
    expect(
      screen.queryByRole("checkbox", {
        name: "Include organization name in address block",
      }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name this letter to"), {
      target: { value: contactChoiceKey(contact) },
    });
    const include = screen.getByRole("checkbox", {
      name: "Include organization name in address block",
    });
    expect(include).not.toBeChecked();
    expect(screen.getByLabelText("Addressee").tagName).toBe("INPUT");
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
    fireEvent.click(include);
    expect(
      screen.getByRole("checkbox", { name: /I reviewed/ }),
    ).not.toBeChecked();
    expect(screen.getByLabelText("Addressee").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Addressee")).toHaveValue(
      "Example Foundation\nAlexandra Contact",
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue("Lex");
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      "10 Test Street",
    );
    fireEvent.change(screen.getByLabelText("Addressee"), {
      target: { value: "Example Foundation\nAttn: Alexandra Contact" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Preview personalized letter" }),
    );
    fireEvent.load(screen.getByTitle("Alex & Pat Sample personalized draft"));
    await screen.findByText("Synthetic preview unavailable.");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      action: "preview_recipient_document",
      includeOrganizationName: true,
      addressee: "Example Foundation\nAttn: Alexandra Contact",
      salutation: "Lex",
      recipientConstituentId: "10",
      addressConstituentId: "10",
    });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        includeOrganizationName: true,
        organizationContactKey: contactChoiceKey(contact),
        addressee: "Example Foundation\nAttn: Alexandra Contact",
        salutation: "Lex",
        recipientConstituentId: "10",
        addressConstituentId: "10",
      }),
    );
  });
  it("restores the organization option with edited wording and resets it when returning to the organization or another record", () => {
    const contact = {
      role: "Main contact",
      firstName: "Taylor",
      lastName: "Main",
    };
    const other = {
      role: "Society letter contact",
      firstName: "Jamie",
      lastName: "Letters",
    };
    const org = structuredClone(recipient);
    org.recipientCandidates[0].addressee = "Example Foundation";
    org.recipientCandidates[0].organizationContacts = {
      keyIndicator: "organization",
      contacts: [contact, other],
    };
    org.recipientReview.values = {
      recipientConstituentId: "10",
      addressConstituentId: "10",
      organizationContactKey: contactChoiceKey(contact),
      includeOrganizationName: true,
      addressee: "The Example Foundation\nAttn: Taylor Main",
      salutation: "Taylor",
      address: "10 Test Street",
      email: "",
    };
    render(
      <LetterRecipientDialog
        recipient={org}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const include = () =>
      screen.getByRole("checkbox", {
        name: "Include organization name in address block",
      });
    expect(include()).toBeChecked();
    expect(screen.getByLabelText("Addressee")).toHaveValue(
      "The Example Foundation\nAttn: Taylor Main",
    );
    const chooser = screen.getByLabelText("Name this letter to");
    fireEvent.change(chooser, { target: { value: contactChoiceKey(other) } });
    expect(include()).toBeChecked();
    expect(screen.getByLabelText("Addressee")).toHaveValue(
      "Example Foundation\nJamie Letters",
    );
    fireEvent.click(include());
    expect(screen.getByLabelText("Addressee")).toHaveValue("Jamie Letters");
    fireEvent.click(include());
    fireEvent.change(chooser, { target: { value: "" } });
    expect(screen.getByLabelText("Addressee")).toHaveValue(
      "Example Foundation",
    );
    expect(
      screen.queryByRole("checkbox", {
        name: "Include organization name in address block",
      }),
    ).not.toBeInTheDocument();
    fireEvent.change(chooser, { target: { value: contactChoiceKey(contact) } });
    expect(include()).not.toBeChecked();
    fireEvent.click(include());
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "11" },
    });
    expect(screen.getByLabelText("Addressee")).toHaveValue("Pat Sample");
    expect(screen.getByLabelText("Addressee").tagName).toBe("INPUT");
    expect(
      screen.queryByRole("checkbox", {
        name: "Include organization name in address block",
      }),
    ).not.toBeInTheDocument();
  });
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
  it("keeps draft preview beside editable fields without opening a second dialog or saving", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json(
        { error: "Synthetic preview unavailable." },
        { status: 422 },
      ),
    );
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
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.load(screen.getByTitle("Alex & Pat Sample personalized draft"));
    expect(
      await screen.findByText("Synthetic preview unavailable."),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Personalized draft document" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Salutation")).toHaveValue("Alex and Pat");
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Friends" },
    });
    expect(screen.getByText(/Your edits have changed/)).toBeVisible();
    expect(
      screen.getByTitle("Alex & Pat Sample personalized draft"),
    ).not.toBeVisible();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps progress and actions outside scrolling fields and hides spouse labels for organizations", () => {
    const org = structuredClone(recipient);
    org.recipientCandidates[0].organizationContacts = {
      constituencyCodes: ["Foundation"],
      contacts: [],
    };
    render(
      <LetterRecipientDialog
        recipient={org}
        onSave={vi.fn()}
        onClose={vi.fn()}
        navigation={{
          index: 0,
          savedCount: 0,
          items: [org, { householdId: "20", name: "Next" }],
          onNavigate: vi.fn(),
          onSkip: vi.fn(),
        }}
      />,
    );
    const fields = screen.getByRole("region", { name: "Recipient fields" });
    const actions = screen.getByLabelText("Recipient review actions");
    expect(fields).not.toContainElement(screen.getByText(/Recipient 1 of 2/));
    expect(fields).not.toContainElement(actions);
    expect(
      within(actions).getByRole("button", { name: "Save & next" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByText("Name merge fields for this recipient"));
    expect(screen.queryByText("Spouse first name")).not.toBeInTheDocument();
    expect(screen.queryByText(/For a joint letter/)).not.toBeInTheDocument();
  });
  it("blocks saving rather than rebasing the token when saved workspace details change during editing", () => {
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
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Save recipient choices" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Recipient record")).toHaveValue("10");
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
    expect(screen.getByLabelText("Edit Recipient first name")).toHaveValue(
      "Pat",
    );
    expect(screen.getByLabelText("Edit Spouse first name")).toHaveValue("Alex");
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
