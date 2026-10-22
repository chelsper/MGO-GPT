import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecipientLetterPreview from "./RecipientLetterPreview";

const { renderAsync } = vi.hoisted(() => ({ renderAsync: vi.fn() }));
vi.mock("docx-preview", () => ({ renderAsync }));
const props = {
  recipient: { name: "Alex Example", householdId: "10" },
  values: {
    recipientConstituentId: "10",
    addressConstituentId: "10",
    addressee: "Alex Example",
    salutation: "Alex",
    address: "10 Example St",
    email: "",
  },
  reviewToken: "original-review",
  template: {
    version: "a".repeat(64),
    societyName: "Society",
    filename: "letter.docx",
  },
  onEscape: vi.fn(),
};
let fetchMock;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response("Word bytes"));
  renderAsync.mockImplementation(async (_data, body) => {
    body.textContent = "Personalized draft";
  });
});
afterEach(() => vi.restoreAllMocks());
async function preview() {
  fireEvent.click(
    screen.getByRole("button", { name: "Preview personalized letter" }),
  );
  fireEvent.load(screen.getByTitle("Alex Example personalized draft"));
  await waitFor(() => expect(renderAsync).toHaveBeenCalledOnce());
}
describe("inline recipient preview", () => {
  it("renders only on request with the original token and current edits, without a second modal", async () => {
    render(<RecipientLetterPreview {...props} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await preview();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "preview_recipient_document",
      householdId: "10",
      reviewToken: "original-review",
      templateVersion: props.template.version,
      ...props.values,
    });
    expect(
      screen.getByTitle("Alex Example personalized draft"),
    ).toHaveAttribute("sandbox", "allow-same-origin");
  });
  it("hides stale previews while typing and refreshes only when requested", async () => {
    const view = render(<RecipientLetterPreview {...props} />);
    await preview();
    const changed = {
      ...props,
      values: { ...props.values, salutation: "Alex and Pat" },
    };
    view.rerender(<RecipientLetterPreview {...changed} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your edits have changed",
    );
    expect(
      screen.getByTitle("Alex Example personalized draft"),
    ).not.toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Update letter preview" }),
    );
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).salutation).toBe(
      "Alex and Pat",
    );
    expect(
      screen.queryByText(/Your edits have changed/),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("Alex Example personalized draft")).toBeVisible();
  });
  it("reuses the matching preview if edits are reverted and invalidates changed templates", async () => {
    const view = render(<RecipientLetterPreview {...props} />);
    await preview();
    view.rerender(
      <RecipientLetterPreview
        {...props}
        values={{ ...props.values, address: "New address" }}
      />,
    );
    expect(
      screen.getByTitle("Alex Example personalized draft"),
    ).not.toBeVisible();
    view.rerender(<RecipientLetterPreview {...props} />);
    expect(screen.getByTitle("Alex Example personalized draft")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
    view.rerender(
      <RecipientLetterPreview
        {...props}
        template={{ ...props.template, version: "b".repeat(64) }}
      />,
    );
    expect(
      screen.getByTitle("Alex Example personalized draft"),
    ).not.toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps missing templates, incomplete choices and unavailable rows non-previewable", () => {
    const view = render(
      <RecipientLetterPreview {...props} template={undefined} />,
    );
    expect(screen.getByText(/Save a Word template/)).toBeVisible();
    expect(screen.getByRole("button")).toBeDisabled();
    view.rerender(
      <RecipientLetterPreview
        {...props}
        values={{ ...props.values, salutation: "" }}
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    view.rerender(<RecipientLetterPreview {...props} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves edits after a failed preview and retries only the draft request", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Check the template mapping." }, { status: 422 }),
    );
    render(<RecipientLetterPreview {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Preview personalized letter" }),
    );
    fireEvent.load(screen.getByTitle("Alex Example personalized draft"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the template mapping.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try preview again" }));
    await waitFor(() => expect(renderAsync).toHaveBeenCalledOnce());
    expect(
      fetchMock.mock.calls.map(
        ([, options]) => JSON.parse(options.body).action,
      ),
    ).toEqual(["preview_recipient_document", "preview_recipient_document"]);
  });
  it("closes only the preview on Escape and returns focus to its opener", async () => {
    render(<RecipientLetterPreview {...props} />);
    await preview();
    fireEvent.keyDown(
      screen.getByTitle("Alex Example personalized draft").contentDocument,
      { key: "Escape" },
    );
    expect(props.onEscape).not.toHaveBeenCalled();
    expect(
      screen.queryByTitle("Alex Example personalized draft"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview personalized letter" }),
    ).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("closes the preview without exiting recipient review or requesting another document", async () => {
    render(<RecipientLetterPreview {...props} />);
    await preview();
    fireEvent.click(
      screen.getByRole("button", { name: "Close letter preview" }),
    );
    expect(
      screen.queryByTitle("Alex Example personalized draft"),
    ).not.toBeInTheDocument();
    expect(props.onEscape).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
