import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NextStepActionDialog from "./NextStepActionDialog";

let client, context, respond, onSaved, onClose;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const writes = () => fetch.mock.calls.filter(([, options]) => options?.method === "POST");
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  context = { workspace: { id: 7, name: "Selected MGO" }, viewer: { id: 2, name: "Admin Author" }, today: "2026-09-16", receipt: null,
    task: { id: 40, constituentId: "123", constituentName: "Test Donor", title: "Thank donor", details: "Discuss impact", category: "Stewardship", status: "Open", sourceToken: "source", opportunityTitle: "Gift", willLinkOpportunity: true } };
  onSaved = vi.fn(); onClose = vi.fn();
  respond = async () => reply({ receipt: { state: "saved", actionId: "500", constituentId: "123", reminderCompleted: true, message: "NXT action saved and verified. Next step completed." } });
  vi.stubGlobal("fetch", vi.fn(async (url, options) => options?.method === "POST" ? respond(JSON.parse(options.body)) : reply(context)));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={client}><NextStepActionDialog item={{ id: 40 }} viewerId={2} workspaceId={7} onClose={onClose} onSaved={onSaved} /></QueryClientProvider>);
const choose = async () => { await screen.findByLabelText("Category"); fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Meeting" } }); };

it("prefills saved notes and stewardship type, but requires category and does not write on open", async () => {
  mount();
  expect(await screen.findByLabelText("Summary")).toHaveValue("Thank donor");
  expect(screen.getByLabelText("Action notes")).toHaveValue("Discuss impact");
  expect(screen.getByLabelText("Action date")).toHaveValue("2026-09-16");
  expect(screen.getByLabelText("Action type")).toHaveValue("Stewardship");
  expect(screen.getByLabelText("Category")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Log action and complete next step" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Open constituent in NXT" })).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/123");
  expect(screen.getByText(/Entered by Admin Author/)).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  expect(fetch.mock.calls).toHaveLength(1);
});
it("submits the reviewed action exactly once without legacy next-step or discussion fields", async () => {
  mount(); await choose();
  const button = screen.getByRole("button", { name: "Log action and complete next step" });
  fireEvent.click(button); fireEvent.click(button);
  await screen.findByText("NXT action saved and verified. Next step completed.");
  expect(writes()).toHaveLength(1);
  expect(JSON.parse(writes()[0][1].body)).toEqual({ actionDate: "2026-09-16", actionCategory: "Meeting", interactionType: "Stewardship", summary: "Thank donor", notes: "Discuss impact", completeReminder: true, sourceToken: "source", expectedWorkspaceId: 7 });
  expect(onSaved).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Log action and complete next step" })).not.toBeInTheDocument();
});
it("allows leaving the next step open", async () => {
  mount(); await choose();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Log action; keep next step open" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(JSON.parse(writes()[0][1].body).completeReminder).toBe(false);
});
it("does not let the dialog close or submit again while a write is pending", async () => {
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  mount(); await choose();
  fireEvent.click(screen.getByRole("button", { name: "Log action and complete next step" }));
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(onClose).not.toHaveBeenCalled();
  finish(reply({ receipt: { state: "review", message: "Check NXT before continuing." } }, 202));
  await screen.findByText("Check NXT before continuing.");
  expect(writes()).toHaveLength(1);
});
it("retains the draft after a pre-write rejection", async () => {
  respond = () => reply({ error: "No action was sent. Fix fundraiser mapping." }, 502);
  mount(); await choose();
  fireEvent.change(screen.getByLabelText("Action notes"), { target: { value: "Actual outcome" } });
  fireEvent.click(screen.getByRole("button", { name: "Log action and complete next step" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Action notes")).toHaveValue("Actual outcome");
  expect(screen.getByRole("button", { name: "Log action and complete next step" })).toBeEnabled();
  expect(onSaved).not.toHaveBeenCalled();
});
it("blocks a resend after a lost response and can recover the durable receipt by reading status", async () => {
  respond = () => { throw new Error("Network disconnected. Reload submission status."); };
  mount(); await choose();
  fireEvent.click(screen.getByRole("button", { name: "Log action and complete next step" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Log action and complete next step" })).toBeDisabled();
  context.receipt = { state: "saved", actionId: "500", message: "Recovered saved action." };
  fireEvent.click(screen.getByRole("button", { name: "Reload submission status" }));
  await screen.findByText("Recovered saved action.");
  expect(writes()).toHaveLength(1);
});
it.each(["processing", "review", "saved"])("shows a prior %s receipt rather than another action form", async state => {
  context.receipt = { state, message: "Existing submission. Do not send again." };
  mount();
  await screen.findByText("Existing submission. Do not send again.");
  expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});
it("explains a missing constituent link rather than guessing", async () => {
  context.task.constituentId = null;
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("single confirmed NXT constituent link");
  expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();
});
it("protects a dirty draft when closing", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  mount(); await choose();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(window.confirm).toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
it("does not show another workspace's cached context", async () => {
  context.workspace.id = 8;
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("workspace changed");
  expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();
});
