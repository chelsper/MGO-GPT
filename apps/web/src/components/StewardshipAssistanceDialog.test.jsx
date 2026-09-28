import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StewardshipAssistanceDialog from "./StewardshipAssistanceDialog";
const data = { viewerId: "2", workspaceId: "7", task: { id: 50, status: "Open", updated_at: "2026-09-28 10:00:00.123456+00", request: null,
  source_gift_snapshot: { constituentName: "Sample Donor", constituentId: "100", amount: 2500, date: "2026-09-28" } } };
const saved = { ...data, task: { ...data.task, request: { id: "11", status: "Open", request_type: "Stewardship: Personal gift", request_note: "A retirement gift", needed_by: "2026-10-01" } } };
const reply = (value, ok = true) => ({ ok, json: async () => value });
let client, onClose;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); onClose = vi.fn();
  return render(<QueryClientProvider client={client}><StewardshipAssistanceDialog item={{ id: 50 }} viewerId={2} workspaceId={7} onClose={onClose} /></QueryClientProvider>);
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  vi.stubGlobal("fetch", vi.fn(async () => reply(structuredClone(data))));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });
async function fill() {
  await screen.findByLabelText("What would you like help with?");
  fireEvent.change(screen.getByLabelText("What would you like help with?"), { target: { value: "gift" } });
  fireEvent.change(screen.getByLabelText("What do you have in mind?"), { target: { value: "A retirement gift" } });
}
it("submits a linked request explicitly, without sending donor identity or changing the task", async () => {
  mount(); await fill(); expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Stewardship > Assistance Requests/)).toBeVisible();
  fetch.mockResolvedValueOnce(reply(saved)); fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await screen.findByText("Request submitted to Advancement Services.");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ type: "gift", instructions: "A retirement gift", neededBy: "", expectedUpdatedAt: data.task.updated_at });
  expect(screen.queryByRole("button", { name: "Submit request" })).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(([url]) => url.includes("/50/stewardship-request?viewerId=2&workspaceId=7"))).toBe(true);
});
it("shows the same saved request and staff update, even when the task is completed", async () => {
  fetch.mockResolvedValue(reply({ ...saved, task: { ...saved.task, status: "Done", request: { ...saved.task.request, status: "In Progress", reviewer_notes: "Finding a suitable item" } } }));
  mount(); await screen.findByText("Finding a suitable item"); expect(screen.queryByRole("button", { name: "Submit request" })).not.toBeInTheDocument();
});
it("prevents repeated submissions and closing during submission", async () => {
  mount(); await fill(); let finish; fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const submit = screen.getByRole("button", { name: "Submit request" }); fireEvent.click(submit); fireEvent.click(submit);
  expect(fetch).toHaveBeenCalledTimes(2); expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  finish(reply(saved)); await screen.findByText("Request submitted to Advancement Services.");
});
it("uses read-only recovery after an uncertain save and retains the draft", async () => {
  mount(); await fill(); fetch.mockRejectedValueOnce(new Error("Connection interrupted"));
  fireEvent.click(screen.getByRole("button", { name: "Submit request" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("What do you have in mind?")).toHaveValue("A retirement gift");
  expect(screen.getByRole("button", { name: "Submit request" })).toBeDisabled();
  fetch.mockResolvedValueOnce(reply(saved)); fireEvent.click(screen.getByRole("button", { name: "Reload saved status" }));
  await screen.findByText("This follow-up already has a request.");
  expect(fetch.mock.calls.filter(([, o]) => o.method === "POST")).toHaveLength(1);
});
it.each(["viewerId", "workspaceId"])("rejects mismatched %s", async key => {
  fetch.mockResolvedValue(reply({ ...data, [key]: "99" })); mount(); await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Submit request" })).not.toBeInTheDocument();
});
it("confirms unsaved drafts before closing and aborts pending reads", async () => {
  const view = mount(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("What do you have in mind?")).toHaveValue("A retirement gift");
  view.unmount();
  fetch.mockImplementation(() => new Promise(() => {})); const second = mount(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const signal = fetch.mock.calls[1][1].signal; second.unmount(); expect(signal.aborted).toBe(true);
});
