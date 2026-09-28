import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GiftFollowUpDialog from "./GiftFollowUpDialog";
const item = { key: "gift:900", revision: "a".repeat(64), giftId: "900", constituentId: "100", constituentName: "Sample Donor", giftAmount: 2500, dueDate: "2026-09-28" };
const data = { viewerId: "2", workspaceUserId: "7", key: item.key, revision: item.revision, gift: item, ownerName: "Example Officer", task: null };
const saved = { ...data, task: { id: 50, owner_user_id: 7, title: "Plan a stewardship follow-up", status: "Open", due_date: "2026-09-30", source_gift_snapshot: { constituentName: "Sample Donor", amount: 2500, date: "2026-09-28" } } };
const reply = (value, ok = true) => ({ ok, json: async () => value });
let client, onClose;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  onClose = vi.fn();
  return render(<QueryClientProvider client={client}><GiftFollowUpDialog item={item} viewerId="2" workspaceId="7" onClose={onClose} /></QueryClientProvider>);
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  vi.stubGlobal("fetch", vi.fn(async () => reply(structuredClone(data))));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });
it("loads saved context once, explains owner and uses explicit submit with only editable fields", async () => {
  mount(); await screen.findByText("Sample Donor");
  const invalidate = vi.spyOn(client, "invalidateQueries");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Example Officer")).toBeVisible();
  expect(screen.getByText(/primary next step stays unchanged/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Due date (optional)"), { target: { value: "2026-09-30" } });
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Arrange a thank-you call" } });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(reply(saved));
  fireEvent.click(screen.getByRole("button", { name: "Create follow-up" }));
  expect(await screen.findByRole("link", { name: "View follow-up" })).toHaveAttribute("href", "/follow-ups?tab=next-steps&nextStepId=50&status=Open");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ key: item.key, revision: item.revision, title: "Arrange a thank-you call", dueDate: "2026-09-30", details: "" });
  expect(screen.getByRole("status")).toHaveTextContent("Follow-up created");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["next-step-worklist"], refetchType: "none" });
  expect(invalidate.mock.calls.every(([options]) => options.refetchType === "none")).toBe(true);
});
it("shows completed existing tasks instead of permitting another creation", async () => {
  fetch.mockResolvedValue(reply({ ...saved, task: { ...saved.task, status: "Done" }, alreadyExists: true }));
  mount();
  expect(await screen.findByRole("link", { name: "View follow-up" })).toHaveAttribute("href", "/follow-ups?tab=next-steps&nextStepId=50&status=Done");
  expect(screen.queryByRole("button", { name: "Create follow-up" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("already has a follow-up");
});
it("keeps edits when closing and requires explicit discard", async () => {
  mount(); await screen.findByText("Sample Donor");
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Custom call" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Custom call");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard edits" }));
  expect(onClose).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
});
it("prevents double clicks and closing during a write", async () => {
  mount(); await screen.findByText("Sample Donor");
  let resolve;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const button = screen.getByRole("button", { name: "Create follow-up" });
  fireEvent.click(button); fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(onClose).not.toHaveBeenCalled();
  resolve(reply(saved)); await screen.findByRole("link", { name: "View follow-up" });
});
it("does not retry an uncertain submission; read-only recovery can reveal the committed task", async () => {
  mount(); await screen.findByText("Sample Donor");
  fetch.mockRejectedValueOnce(new Error("Network interrupted"));
  fireEvent.click(screen.getByRole("button", { name: "Create follow-up" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Network interrupted");
  expect(screen.getByRole("button", { name: "Create follow-up" })).toBeDisabled();
  fetch.mockResolvedValueOnce(reply({ ...saved, alreadyExists: true }));
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await screen.findByRole("link", { name: "View follow-up" });
  expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
});
it.each(["viewerId", "workspaceUserId", "revision", "key"])("rejects read scope mismatch: %s", async field => {
  fetch.mockResolvedValue(reply({ ...data, [field]: "wrong" })); mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("workspace changed");
  expect(screen.queryByRole("button", { name: "Create follow-up" })).toBeNull();
});
it("does not show success for a write response from another owner", async () => {
  mount(); await screen.findByText("Sample Donor");
  fetch.mockResolvedValueOnce(reply({ ...saved, task: { ...saved.task, owner_user_id: 9 } }));
  fireEvent.click(screen.getByRole("button", { name: "Create follow-up" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("workspace changed");
  expect(screen.queryByRole("link", { name: "View follow-up" })).toBeNull();
});
it("unmount closes the dialog and aborts a pending scoped read", async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const view = mount();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = fetch.mock.calls[0][1].signal;
  view.unmount(); expect(signal.aborted).toBe(true);
  expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
});
