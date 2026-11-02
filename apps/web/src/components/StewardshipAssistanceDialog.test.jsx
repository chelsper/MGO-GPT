import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StewardshipAssistanceDialog from "./StewardshipAssistanceDialog";
const data = { viewerId: "2", workspaceId: "7", giftChoices: [{ id: "12", name: "JU Blanket", description: "Green" }], task: { id: 50, status: "Open", updated_at: "2026-09-28 10:00:00.123456+00", request: null,
  source_gift_snapshot: { constituentName: "Sample Donor", constituentId: "100", amount: 2500, date: "2026-09-28" } } };
const saved = { ...data, task: { ...data.task, request: { id: "11", status: "Open", request_type: "Stewardship: Personal gift", request_note: "A retirement gift", needed_by: "2026-10-01" } } };
const reply = (value, ok = true) => ({ ok, json: async () => value });
let client, onClose;
function mount(props = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); onClose = vi.fn();
  return render(<QueryClientProvider client={client}><StewardshipAssistanceDialog item={{ id: 50 }} viewerId={2} workspaceId={7} onClose={onClose} {...props} /></QueryClientProvider>);
}
beforeEach(() => {
  sessionStorage.clear();
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
it("sends only the optional selected ID, then displays the saved preference", async () => {
  mount(); await fill();
  fireEvent.change(screen.getByLabelText("Gift preference (optional)"), { target: { value: "12" } });
  fetch.mockResolvedValueOnce(reply({ ...saved, task: { ...saved.task, request: { ...saved.task.request, stewardship_gift_item_snapshot: { id: "12", name: "JU Blanket" } } } }));
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await screen.findByText("Gift preference:");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ type: "gift", instructions: "A retirement gift", neededBy: "", giftItemId: "12", expectedUpdatedAt: data.task.updated_at });
  expect(screen.getByText(/Saved on this request/)).toBeVisible();
});
it("clears a gift when switching request types and still permits requests with no available items", async () => {
  mount(); await fill(); fireEvent.change(screen.getByLabelText("Gift preference (optional)"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("What would you like help with?"), { target: { value: "letter" } });
  expect(screen.queryByLabelText("Gift preference (optional)")).toBeNull();
  fetch.mockResolvedValueOnce(reply(saved)); fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await screen.findByText("Request submitted to Advancement Services.");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty("giftItemId");
});

const directData = { viewerId: "2", workspaceId: "7", context: { constituentId: "100", constituentName: "Sample Donor", opportunityId: "40", opportunityTitle: "Future scholarship" }, contextVersion: "a".repeat(32), giftChoices: [], request: null };
const directProps = { item: undefined, source: { constituentId: "100", opportunityId: "40" } };
it("prefills donor and opportunity context and submits without a gift or pending task", async () => {
  fetch.mockResolvedValue(reply(directData)); mount(directProps); await fill();
  expect(screen.getByText("Opportunity: Future scholarship")).toBeVisible();
  expect(screen.getByText(/No donation is required/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("What would you like help with?"), { target: { value: "visit" } });
  fireEvent.change(screen.getByLabelText("Needed by (optional)"), { target: { value: "2026-11-20" } });
  fetch.mockResolvedValueOnce(reply({ ...directData, request: saved.task.request }));
  fireEvent.click(screen.getByRole("button", { name: "Submit request" })); await screen.findByText("Request submitted to Advancement Services.");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ type: "visit", instructions: "A retirement gift", neededBy: "2026-11-20", contextVersion: directData.contextVersion });
  expect(fetch.mock.calls[1][0]).toBe(fetch.mock.calls[0][0]);
  expect(fetch.mock.calls[0][0]).toContain("/api/stewardship/direct-request?viewerId=2&workspaceId=7&constituentId=100&opportunityId=40&requestKey=");
});
it("retains a direct recovery key on reopen and starts another request only explicitly", async () => {
  fetch.mockResolvedValue(reply({ ...directData, request: saved.task.request })); const first = mount(directProps);
  await screen.findByText("Your saved stewardship request."); const initialUrl = fetch.mock.calls[0][0]; first.unmount(); client.clear();
  mount(directProps); await screen.findByText("Your saved stewardship request."); expect(fetch.mock.calls[1][0]).toBe(initialUrl);
  fetch.mockResolvedValueOnce(reply(directData)); fireEvent.click(screen.getByRole("button", { name: "Start a separate request" }));
  await screen.findByLabelText("What would you like help with?"); expect(fetch.mock.calls[2][0]).not.toBe(initialUrl);
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("recovers an uncertain direct save using only a GET", async () => {
  fetch.mockResolvedValue(reply(directData)); mount(directProps); await fill();
  fetch.mockRejectedValueOnce(new Error("Connection interrupted")); fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "Submit request" })).toBeDisabled();
  fetch.mockResolvedValueOnce(reply({ ...directData, request: saved.task.request })); fireEvent.click(screen.getByRole("button", { name: "Reload saved status" }));
  await screen.findByText("Your saved stewardship request."); expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
});
it.each([{ constituentId: "999" }, { opportunityId: "999" }])("rejects a mismatched direct response %o", async change => {
  fetch.mockResolvedValue(reply({ ...directData, context: { ...directData.context, ...change } })); mount(directProps);
  await screen.findByRole("alert"); expect(screen.queryByRole("button", { name: "Submit request" })).toBeNull();
});
it("shows a saved request by ID without offering another or submitting again", async () => {
  fetch.mockResolvedValue(reply({ ...directData, request: saved.task.request }));
  mount({ source: { constituentId: "100", requestId: "11" } }); await screen.findByText("Your saved stewardship request.");
  expect(screen.queryByRole("button", { name: "Start a separate request" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit request" })).toBeNull();
  expect(fetch.mock.calls[0][0]).toContain("requestId=11");
});
