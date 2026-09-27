import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OutreachDraft from "./OutreachDraft";
import { priorityDraftContext } from "@/utils/outreachDrafts";

const gift = { key: "gift:900", revision: "a", kind: "gift", constituentName: "Sample Donor", title: "$12,500 gift", giftAmount: 12500, dueDate: "2026-09-20", savedAt: "2026-09-27" };
const context = priorityDraftContext(gift);
const open = () => fireEvent.click(screen.getByRole("button", { name: "Prepare a draft" }));
const edit = text => fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
const review = () => fireEvent.click(screen.getByRole("checkbox"));
let clipboard;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal("navigator", { clipboard });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("does nothing until explicitly opened and never fetches, stores, or sends a draft", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem");
  render(<OutreachDraft context={context} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  open();
  expect(screen.getByRole("dialog", { name: "Sample Donor" })).toBeVisible();
  expect(screen.getByText(/without an AI model/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Copy thank-you draft" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled(); expect(clipboard.writeText).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
});
it("requires personalization and review, copies only edited text, and resets review after edits", async () => {
  render(<OutreachDraft context={context} />); open(); review();
  expect(screen.getByRole("button", { name: "Copy thank-you draft" })).toBeDisabled();
  const text = screen.getByRole("textbox").value.replace("[Preferred greeting]", "Sam").replace("[Your name]", "Pat");
  edit(text);
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  review(); fireEvent.click(screen.getByRole("button", { name: "Copy thank-you draft" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Nothing was sent or recorded");
  expect(clipboard.writeText).toHaveBeenCalledWith(text);
  expect(clipboard.writeText.mock.calls[0][0]).not.toContain("NXT");
  edit(text + "\nI look forward to hearing from you.");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "Copy thank-you draft" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});
it("copies sources with meeting notes and handles a clipboard failure honestly", async () => {
  clipboard.writeText.mockRejectedValue(new Error("denied"));
  render(<OutreachDraft context={context} />); open();
  fireEvent.click(screen.getByRole("button", { name: "Meeting notes" })); review();
  fireEvent.click(screen.getByRole("button", { name: "Copy meeting notes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("copy it manually");
  expect(clipboard.writeText.mock.calls[0][0]).toContain("Source: Saved NXT gift source");
  expect(clipboard.writeText.mock.calls[0][0]).toContain("suggestions, not recorded donor preferences");
  expect(screen.queryByRole("status")).toBeNull();
});
it("allows closing an untouched starter and restores focus", () => {
  render(<OutreachDraft context={context} />); open();
  fireEvent.click(screen.getByRole("button", { name: "Close draft" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Discard edits and close" })).toBeNull();
  expect(screen.getByRole("button", { name: "Prepare a draft" })).toHaveFocus();
});
it("protects edited text when closing, changing type, or resetting; discarded edits are not restored", () => {
  render(<OutreachDraft context={context} />); open(); edit("Personal wording");
  fireEvent.click(screen.getByRole("button", { name: "Meeting notes" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("textbox")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Reset starter" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  fireEvent.click(screen.getByRole("button", { name: "Close draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("textbox")).toHaveValue("Personal wording");
  fireEvent.click(screen.getByRole("button", { name: "Discard edits and close" })); open();
  expect(screen.getByRole("textbox")).not.toHaveValue("Personal wording");
});
it("blocks stale context without overwriting edits and requires explicit restart and review", () => {
  const view = render(<OutreachDraft context={context} />); open(); edit("Personal wording"); review();
  view.rerender(<OutreachDraft context={priorityDraftContext({ ...gift, giftAmount: 15000 })} />);
  expect(screen.getByRole("alert")).toHaveTextContent("saved details changed");
  expect(screen.getByRole("textbox")).toHaveValue("Personal wording");
  expect(screen.getByRole("button", { name: "Copy thank-you draft" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Use current details" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("textbox")).toHaveValue("Personal wording");
  fireEvent.click(screen.getByRole("button", { name: "Use current details" }));
  fireEvent.click(screen.getByRole("button", { name: "Replace draft" }));
  expect(screen.getByRole("textbox").value).toContain("$15,000.00");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("does not interpret HTML in sources or drafts", () => {
  render(<OutreachDraft context={{ ...context, name: "<img src=x onerror=alert(1)>", facts: [{ title: "Note", text: "<script>alert(1)</script>", source: "Saved" }] }} />); open();
  expect(screen.getByRole("dialog").querySelector("img, script")).toBeNull();
  expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
});
it("does not allow duplicate copying while the clipboard operation is pending", async () => {
  let done;
  clipboard.writeText.mockReturnValue(new Promise(resolve => { done = resolve; }));
  render(<OutreachDraft context={context} />); open(); edit("Reviewed wording"); review();
  fireEvent.click(screen.getByRole("button", { name: "Copy thank-you draft" }));
  expect(screen.getByRole("button", { name: "Copying..." })).toBeDisabled();
  expect(screen.getByRole("textbox")).toBeDisabled();
  done();
  await screen.findByRole("status");
  expect(clipboard.writeText).toHaveBeenCalledTimes(1);
});
it("does not show stale success when source details change during copying", async () => {
  let done;
  clipboard.writeText.mockReturnValue(new Promise(resolve => { done = resolve; }));
  const view = render(<OutreachDraft context={context} />); open(); edit("Reviewed wording"); review();
  fireEvent.click(screen.getByRole("button", { name: "Copy thank-you draft" }));
  view.rerender(<OutreachDraft context={priorityDraftContext({ ...gift, revision: "new" })} />);
  done();
  await waitFor(() => expect(screen.getByRole("button", { name: "Use current details" })).not.toBeDisabled());
  expect(screen.queryByRole("status")).toBeNull();
});
it("warns before navigation with unsaved edits and removes the guard on unmount", () => {
  const view = render(<OutreachDraft context={context} />); open(); edit("Unsaved notes");
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  view.unmount();
  const after = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
it("renders no launcher without saved context", () => {
  render(<OutreachDraft context={null} />);
  expect(screen.queryByRole("button")).toBeNull();
});
