import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DiscussionNextStepDialog from "./DiscussionNextStepDialog";

let client, context, respond, onSaved, onClose;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const writes = () => fetch.mock.calls.filter(([, options]) => options?.method === "POST");
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  context = { workspaceId: 7, viewerId: 2,
    discussion: { id: 9, subject: "Arrange visit", body: "Discuss scholarship", dueDate: "2026-09-20", version: "exact-version" },
    topics: [{ key: "nxt:123", name: "First Donor", ownerId: null }],
    owners: [{ id: 7, name: "Selected MGO" }, { id: 8, name: "Other MGO" }], tasks: [] };
  onSaved = vi.fn(); onClose = vi.fn();
  respond = async () => reply({ task: { id: 50, owner_user_id: 7, owner_name: "Selected MGO", status: "Open" }, message: "Additional next step created." }, 201);
  vi.stubGlobal("fetch", vi.fn(async (url, options) => options?.method === "POST" ? respond(JSON.parse(options.body)) : reply(context)));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={client}><DiscussionNextStepDialog item={{ id: 9 }} viewerId={2} workspaceId={7} onClose={onClose} onSaved={onSaved} /></QueryClientProvider>);
const ready = () => screen.findByLabelText("What should happen next?");

it("prefills saved discussion data without writing or fetching NXT", async () => {
  mount();
  expect(await ready()).toHaveValue("Arrange visit");
  expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Discuss scholarship");
  expect(screen.getByLabelText("Due date (optional)")).toHaveValue("2026-09-20");
  expect(screen.getByLabelText("Responsible owner")).toHaveValue("7");
  expect(screen.getByLabelText("Constituent topic")).toHaveValue("nxt:123");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/discussion-items/9/next-step?workspaceId=7");
  expect(writes()).toHaveLength(0);
});
it("requires a topic choice for a multi-constituent discussion", async () => {
  context.topics.push({ key: "nxt:456", name: "Second Donor" });
  mount(); await ready();
  expect(screen.getByLabelText("Constituent topic")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Create additional next step" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Constituent topic"), { target: { value: "nxt:456" } });
  fireEvent.click(screen.getByRole("button", { name: "Create additional next step" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(JSON.parse(writes()[0][1].body).topicKey).toBe("nxt:456");
});
it("submits only the additional task draft once and links to its saved next step", async () => {
  mount(); await ready();
  const button = screen.getByRole("button", { name: "Create additional next step" });
  fireEvent.click(button); fireEvent.click(button);
  expect(await screen.findByRole("link", { name: "View next step" })).toHaveAttribute("href", "/follow-ups?tab=next-steps&nextStepId=50&status=Open");
  expect(writes()).toHaveLength(1);
  expect(JSON.parse(writes()[0][1].body)).toEqual({ title: "Arrange visit", details: "Discuss scholarship", dueDate: "2026-09-20", ownerId: "7", topicKey: "nxt:123", expectedUpdatedAt: "exact-version", expectedWorkspaceId: 7 });
});
it.each(["Open", "Done"])("shows the existing %s task instead of creating another", async status => {
  context.tasks.push({ id: 50, owner_user_id: 7, owner_name: "Selected MGO", status, source_topic_key: "nxt:123" });
  mount();
  expect(await screen.findByRole("link", { name: "View next step" })).toHaveAttribute("href", `/follow-ups?tab=next-steps&nextStepId=50&status=${status}`);
  expect(screen.queryByRole("button", { name: "Create additional next step" })).not.toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});
it("lets an Admin select another eligible owner without linking to the wrong workspace", async () => {
  respond = async () => reply({ task: { id: 50, owner_user_id: 8, owner_name: "Other MGO", status: "Open" }, message: "Created." });
  mount(); await ready();
  fireEvent.change(screen.getByLabelText("Responsible owner"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Create additional next step" }));
  await screen.findByText("This follow-up is in Other MGO's workspace.");
  expect(screen.queryByRole("link", { name: "View next step" })).not.toBeInTheDocument();
  expect(JSON.parse(writes()[0][1].body).ownerId).toBe("8");
});
it("retains a changed draft after a stale-source error", async () => {
  respond = async () => reply({ error: "Discussion changed. Close and reopen." }, 409);
  mount(); await ready();
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Call first" } });
  fireEvent.click(screen.getByRole("button", { name: "Create additional next step" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Call first");
  expect(onSaved).not.toHaveBeenCalled();
});
it("protects an unsaved draft on close", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  mount(); await ready();
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Changed" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(window.confirm).toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
it("blocks dismissal and double submission during a save", async () => {
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  mount(); await ready();
  fireEvent.click(screen.getByRole("button", { name: "Create additional next step" }));
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(onClose).not.toHaveBeenCalled();
  finish(reply({ task: { id: 50, owner_user_id: 7, status: "Open" }, message: "Saved" }));
  await screen.findByText("Saved");
  expect(writes()).toHaveLength(1);
});
it("blocks a foreign local-only topic", async () => {
  context.topics = [{ key: "local:10", name: "Local only", ownerId: 8 }];
  mount(); await ready();
  expect(screen.getByRole("button", { name: "Create additional next step" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("another workspace");
});
it("rejects context returned for another workspace", async () => {
  context.workspaceId = 8;
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("workspace changed");
  expect(screen.queryByLabelText("What should happen next?")).not.toBeInTheDocument();
});
