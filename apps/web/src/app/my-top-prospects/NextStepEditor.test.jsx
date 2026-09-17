import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProspectDetailModal } from "./page";
import PortfolioFollowUpModal from "./PortfolioFollowUpModal";

const clients = [];
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function clientForTest() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return client;
}
function portfolio() {
  const onClose = vi.fn();
  const client = clientForTest();
  render(<QueryClientProvider client={client}><PortfolioFollowUpModal kind="next-step"
    person={{ constituentId: "100", name: "Test Donor" }} ownerName="Selected MGO" onClose={onClose} /></QueryClientProvider>);
  return onClose;
}

it("opens with no requests and sends only the existing local next-step write", async () => {
  portfolio();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save next step" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "  Call about visit  " } });
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
  const dueDate = screen.getByLabelText("Due date (optional)").value;
  fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 5 }) });
  fireEvent.click(screen.getByRole("button", { name: "Save next step" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Next step saved for Test Donor"));
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("/api/pending-actions");
  expect(JSON.parse(options.body)).toEqual({ constituentId: "100", title: "Call about visit", details: null, dueDate, category: "General" });
});

it("retains input on failure and prevents duplicate submission or dismissal during save", async () => {
  const onClose = portfolio();
  let finish;
  fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Prepare visit" } });
  const form = screen.getByRole("button", { name: "Save next step" }).closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => finish({ ok: false, json: async () => ({ error: "Try again later" }) }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try again later"));
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Prepare visit");
  expect(screen.getByRole("button", { name: "Save next step" })).toBeEnabled();
});

it("asks before discarding a draft", () => {
  const onClose = portfolio();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Call" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(confirm).toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

function detail(readOnly = false) {
  const onClose = vi.fn();
  const client = clientForTest();
  const data = { prospect: { id: 1, user_id: 7, prospect_name: "Test Donor", status: "Active" },
    pendingActions: [{ id: 40, title: "Original step", details: "Existing notes", due_date: "2026-09-30", status: "Open", is_primary: true, category: "General" }] };
  client.setQueryData(["prospect", 1], data);
  client.setQueryData(["mgo-users-for-discussion"], []);
  render(<QueryClientProvider client={client}><ProspectDetailModal prospectId={1} initialPanel="next-step"
    ownerName="Selected MGO" readOnly={readOnly} onClose={onClose} /></QueryClientProvider>);
  return { client, data, onClose };
}

it("keeps the Top Prospects draft when background data changes", async () => {
  const { client, data } = detail();
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Original step");
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "My unsaved step" } });
  fireEvent.click(screen.getByRole("button", { name: "No date" }));
  await act(async () => client.setQueryData(["prospect", 1], { ...data,
    pendingActions: [{ ...data.pendingActions[0], title: "Updated background title", due_date: "2026-10-01" }] }));
  await screen.findAllByText("Updated background title");
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("My unsaved step");
  expect(screen.getByLabelText("Due date (optional)")).toHaveValue("");
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Save unavailable" }) });
  fireEvent.click(screen.getByRole("button", { name: "Save next step" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0][0]).toBe("/api/pending-actions/40");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ title: "My unsaved step", dueDate: null, details: "Existing notes" });
});

it("does not overwrite a different primary step selected while editing", async () => {
  const { client, data } = detail();
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "My draft" } });
  await act(async () => client.setQueryData(["prospect", 1], { ...data,
    pendingActions: [{ ...data.pendingActions[0], id: 41, title: "New primary" }] }));
  await screen.findAllByText("New primary");
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("My draft");
  fireEvent.submit(screen.getByRole("form", { name: "Edit next step" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/The current next step changed while you were editing/));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("My draft");
});

it("keeps keyboard focus inside the portfolio editor", () => {
  portfolio();
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Call" } });
  const save = screen.getByRole("button", { name: "Save next step" });
  save.focus();
  fireEvent.keyDown(save, { key: "Tab" });
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: "Tab", shiftKey: true });
  expect(save).toHaveFocus();
});

it("does not open the editor for a read-only viewer", () => {
  detail(true);
  expect(screen.queryByRole("form", { name: "Edit next step" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps a Top Prospects next-step draft across panel changes and cancelled dismissal", () => {
  const { onClose } = detail();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Keep my draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Team Discussion", exact: true }));
  expect(screen.getByText(/Your unsaved next-step draft is kept/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Set Next Step", exact: true }));
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Keep my draft");
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Keep my draft");
  expect(onClose).not.toHaveBeenCalled();
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
});

it("warns before unloading an unsaved portfolio follow-up and clears the warning after save", async () => {
  portfolio();
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Call" } });
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
  fireEvent.click(screen.getByRole("button", { name: "Save next step" }));
  await screen.findByText("Saved in app");
  const savedUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(savedUnload);
  expect(savedUnload.defaultPrevented).toBe(false);
});
