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
    task: { id: 40, constituentId: "123", constituentName: "Test Donor", title: "Thank donor", details: "Discuss impact", category: "Stewardship", status: "Open", dueDate: "2026-09-18", sourceToken: "source", opportunityTitle: "Gift", willLinkOpportunity: true } };
  onSaved = vi.fn(); onClose = vi.fn();
  respond = async () => reply({ receipt: { state: "saved", actionId: "500", constituentId: "123", reminderCompleted: true, message: "NXT action saved and verified. Next step completed." } });
  vi.stubGlobal("fetch", vi.fn(async (url, options) => options?.method === "POST" ? respond(JSON.parse(options.body)) : reply(context)));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={client}><NextStepActionDialog item={{ id: 40 }} viewerId={2} workspaceId={7} onClose={onClose} onSaved={onSaved} /></QueryClientProvider>);
const choose = async () => {
  fireEvent.click(await screen.findByRole("radio", { name: "Log completed action" }));
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Meeting" } });
  fireEvent.click(screen.getByRole("checkbox"));
};

it("prefills saved notes and stewardship type, but requires category and does not write on open", async () => {
  mount();
  await screen.findByRole("radio", { name: "Log completed action" });
  expect(screen.getAllByRole("radio").every(radio => !radio.checked)).toBe(true);
  expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Log completed action" }));
  expect(screen.getByLabelText("Summary")).toHaveValue("Thank donor");
  expect(screen.getByLabelText("Action notes")).toHaveValue("Discuss impact");
  expect(screen.getByLabelText("Completed action date")).toHaveValue("2026-09-16");
  expect(screen.getByLabelText("Action type")).toHaveValue("Stewardship");
  expect(screen.getByLabelText("Category")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Log completed action; keep next step open" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Open constituent in NXT" })).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/123");
  expect(screen.getByText(/Entered by Admin Author/)).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  expect(fetch.mock.calls).toHaveLength(1);
});
it("submits the reviewed action exactly once without legacy next-step or discussion fields", async () => {
  mount(); await choose();
  const button = screen.getByRole("button", { name: "Log completed action and complete next step" });
  fireEvent.click(button); fireEvent.click(button);
  await screen.findByText("NXT action saved and verified. Next step completed.");
  expect(screen.getByText("Verified in NXT")).toBeInTheDocument();
  expect(screen.getByText("NXT action ID: 500")).not.toBeVisible();
  fireEvent.click(screen.getByText("Technical details"));
  expect(screen.getByText("NXT action ID: 500")).toBeVisible();
  expect(writes()).toHaveLength(1);
  expect(JSON.parse(writes()[0][1].body)).toEqual({ actionIntent: "completed", actionDate: "2026-09-16", actionCategory: "Meeting", interactionType: "Stewardship", summary: "Thank donor", notes: "Discuss impact", completeReminder: true, sourceToken: "source", expectedWorkspaceId: 7 });
  expect(onSaved).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Log completed action and complete next step" })).not.toBeInTheDocument();
});
it("allows leaving the next step open", async () => {
  mount(); await choose();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Log completed action; keep next step open" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(JSON.parse(writes()[0][1].body).completeReminder).toBe(false);
});
it("does not let the dialog close or submit again while a write is pending", async () => {
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  mount(); await choose();
  fireEvent.click(screen.getByRole("button", { name: "Log completed action and complete next step" }));
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(onClose).not.toHaveBeenCalled();
  finish(reply({ receipt: { state: "review", message: "Check NXT before continuing." } }, 202));
  await screen.findByText("Check NXT before continuing.");
  expect(screen.getByText("Needs verification")).toBeInTheDocument();
  expect(screen.getByText("Needs verification").closest('[role="status"]')).toHaveClass("bg-amber-50");
  expect(screen.queryByText("Verified in NXT")).not.toBeInTheDocument();
  expect(writes()).toHaveLength(1);
});
it("retains the draft after a pre-write rejection", async () => {
  respond = () => reply({ error: "No action was sent. Fix fundraiser mapping." }, 502);
  mount(); await choose();
  fireEvent.change(screen.getByLabelText("Action notes"), { target: { value: "Actual outcome" } });
  fireEvent.click(screen.getByRole("button", { name: "Log completed action and complete next step" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Action notes")).toHaveValue("Actual outcome");
  expect(screen.getByRole("button", { name: "Log completed action and complete next step" })).toBeEnabled();
  expect(onSaved).not.toHaveBeenCalled();
});
it("blocks a resend after a lost response and can recover the durable receipt by reading status", async () => {
  respond = () => { throw new Error("Network disconnected. Reload submission status."); };
  mount(); await choose();
  fireEvent.click(screen.getByRole("button", { name: "Log completed action and complete next step" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Log completed action and complete next step" })).toBeDisabled();
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

function withReview(status = "Done") {
  context.task.status = status;
  context.receipt = { state: "review", actionId: "500", constituentId: "123", reminderCompleted: false,
    reminderStatus: status, message: "Existing action needs verification." };
}
it("can reverify a completed reminder once without resending or completing it", async () => {
  withReview();
  let finish;
  fetch.mockImplementation(async (url, options) => options?.method === "PATCH" ? new Promise(resolve => { finish = resolve; }) : reply(context));
  mount();
  const button = await screen.findByRole("button", { name: "Verify existing NXT action" });
  expect(screen.getByText("Next step: Completed.")).toBeInTheDocument();
  expect(fetch.mock.calls).toHaveLength(1);
  fireEvent.click(button); fireEvent.click(button);
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reload submission status" })).toBeDisabled();
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(1);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ expectedWorkspaceId: 7, actionId: "500" });
  finish(reply({ receipt: { ...context.receipt, state: "saved", message: "Existing NXT action verified." } }));
  await screen.findByText("Existing NXT action verified.");
  expect(writes()).toHaveLength(0);
  expect(onSaved).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Verify existing NXT action" })).not.toBeInTheDocument();
});
it("shows current open status after verification without applying an old completion request", async () => {
  withReview("Open");
  fetch.mockImplementation(async (url, options) => options?.method === "PATCH"
    ? reply({ receipt: { ...context.receipt, state: "saved", message: "Existing NXT action verified." } }) : reply(context));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Verify existing NXT action" }));
  await screen.findByText(/If this follow-up is finished/);
  expect(screen.getByText("Next step: Open.")).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});
it.each(["mismatch", "network", "wrong identity"])("keeps recovery retryable and resending blocked after %s", async problem => {
  withReview();
  fetch.mockImplementation(async (url, options) => {
    if (options?.method !== "PATCH") return reply(context);
    if (problem === "network") throw new Error("No connection. Retry verification.");
    if (problem === "wrong identity") return reply({ receipt: { ...context.receipt, state: "saved", actionId: "other" } });
    return reply({ error: "Required fields do not match. Review NXT." }, 409);
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Verify existing NXT action" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Verify existing NXT action" })).toBeEnabled();
  expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
});
it.each(["processing", "saved", "no action ID"])("does not offer recovery for %s", async state => {
  withReview();
  if (state === "no action ID") context.receipt.actionId = null;
  else context.receipt.state = state;
  mount();
  await screen.findByText("Existing action needs verification.");
  expect(screen.queryByRole("button", { name: "Verify existing NXT action" })).not.toBeInTheDocument();
  expect(fetch.mock.calls).toHaveLength(1);
});

it("schedules from the saved due date without offering reminder completion", async () => {
  respond = async action => reply({ receipt: { state: "saved", actionId: "500", constituentId: "123", actionIntent: action.actionIntent,
    actionDate: action.actionDate, reminderCompleted: false, message: "Planned NXT action saved and verified as incomplete." } });
  mount();
  fireEvent.click(await screen.findByRole("radio", { name: "Schedule planned action" }));
  expect(screen.getByLabelText("Planned action date")).toHaveValue("2026-09-18");
  expect(screen.getByLabelText("Planned action date")).toHaveAttribute("min", "2026-09-16");
  expect(screen.getByLabelText("Planned action date")).not.toHaveAttribute("max");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Phone Call" } });
  const button = screen.getByRole("button", { name: "Schedule NXT action" });
  fireEvent.click(button); fireEvent.click(button);
  await screen.findByText("Planned NXT action saved and verified as incomplete.");
  expect(JSON.parse(writes()[0][1].body)).toMatchObject({ actionIntent: "planned", completeReminder: false, actionDate: "2026-09-18", actionCategory: "Phone Call" });
  expect(writes()).toHaveLength(1);
  expect(screen.getByText(/Submitted as: Planned action for Sep 18, 2026/)).toBeInTheDocument();
  expect(screen.getByText(/Mark complete in this app only closes the reminder/)).toBeInTheDocument();
});
it("keeps separate dates when switching intent and always resets reminder completion consent", async () => {
  mount(); await choose();
  fireEvent.change(screen.getByLabelText("Completed action date"), { target: { value: "2026-09-15" } });
  fireEvent.change(screen.getByLabelText("Action notes"), { target: { value: "Reviewed notes" } });
  fireEvent.click(screen.getByRole("radio", { name: "Schedule planned action" }));
  expect(screen.getByLabelText("Planned action date")).toHaveValue("2026-09-18");
  fireEvent.change(screen.getByLabelText("Planned action date"), { target: { value: "2026-09-20" } });
  fireEvent.click(screen.getByRole("radio", { name: "Log completed action" }));
  expect(screen.getByLabelText("Completed action date")).toHaveValue("2026-09-15");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByLabelText("Action notes")).toHaveValue("Reviewed notes");
  fireEvent.click(screen.getByRole("radio", { name: "Schedule planned action" }));
  expect(screen.getByLabelText("Planned action date")).toHaveValue("2026-09-20");
  expect(writes()).toHaveLength(0);
});
it.each([null, "2026-09-01", "invalid"])("uses today, not a past/invalid/missing due date (%s), for a new plan", async dueDate => {
  context.task.dueDate = dueDate;
  mount();
  fireEvent.click(await screen.findByRole("radio", { name: "Schedule planned action" }));
  expect(screen.getByLabelText("Planned action date")).toHaveValue("2026-09-16");
});
it("blocks future completed dates and past planned dates before sending", async () => {
  mount(); await choose();
  fireEvent.change(screen.getByLabelText("Completed action date"), { target: { value: "2026-09-18" } });
  expect(screen.getByRole("button", { name: "Log completed action and complete next step" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Schedule planned action" }));
  fireEvent.change(screen.getByLabelText("Planned action date"), { target: { value: "2026-09-15" } });
  expect(screen.getByRole("button", { name: "Schedule NXT action" })).toBeDisabled();
  expect(writes()).toHaveLength(0);
});
it("does not expose mode switching after a saved planned submission", async () => {
  withReview("Open");
  context.receipt = { ...context.receipt, state: "saved", actionIntent: "planned", actionDate: "2026-09-18" };
  mount();
  await screen.findByText(/Submitted as: Planned action/);
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.queryByText(/If this follow-up is finished/)).not.toBeInTheDocument();
  expect(screen.getByText(/Mark complete in this app only closes the reminder/)).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});
