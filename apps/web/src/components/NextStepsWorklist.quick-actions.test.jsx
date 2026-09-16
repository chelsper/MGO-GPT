import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NextStepsWorklist from "./NextStepsWorklist";
import { nextStepDateChoices } from "./NextStepFields";

let client, items, canEdit, respond;
const token = "2026-09-15 12:30:10.123456+00";
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const writes = () => fetch.mock.calls.filter(([, options]) => options?.method === "POST");
beforeEach(() => {
  canEdit = true;
  items = [
    { id: 1, title: "Prepare visit", constituent_name: "Person One", details: "Keep these notes", due_date: "2026-09-16", status: "Open", updated_at: token, discussion_item_id: 9, discussion_status: "Resolved" },
    { id: 2, title: "Make call", constituent_name: "Person Two", due_date: null, status: "Open", updated_at: token },
  ];
  respond = async (id, body) => {
    items = items.map(item => item.id !== id ? item : { ...item,
      status: body.action === "complete" ? "Done" : "Open",
      completed_at: body.action === "complete" ? "2026-09-16T15:00:00Z" : null,
      due_date: body.action === "reschedule" ? body.dueDate : item.due_date,
      updated_at: "2026-09-16 15:00:00.123456+00",
    });
    return reply({ id });
  };
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (String(url).startsWith("/api/follow-ups?")) return reply({
      items: items.filter(item => item.status === (url.includes("Done") ? "Done" : "Open")),
      asOf: "2026-09-16", viewerId: 2, workspace: { id: 7, name: "Selected MGO", canEdit },
    });
    const match = String(url).match(/^\/api\/pending-actions\/(\d+)\/quick-action$/);
    if (match && options?.method === "POST") return respond(Number(match[1]), JSON.parse(options.body));
    throw new Error(`Unexpected request: ${url}`);
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={client}><NextStepsWorklist viewerId={2} workspaceId={7} /></QueryClientProvider>);
const row = () => screen.getByRole("article", { name: "Person One: Prepare visit" });

it("completes once, moves to history, and reopens without changing a discussion or sending an NXT action", async () => {
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(row()).getByRole("button", { name: "Mark complete" }));
  await screen.findByText(/Next step completed/);
  await waitFor(() => expect(screen.queryByText("Prepare visit")).not.toBeInTheDocument());
  expect(JSON.parse(writes()[0][1].body)).toEqual({ action: "complete", expectedWorkspaceId: 7, expectedUpdatedAt: token });
  expect(screen.getByText(/Next step completed/)).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Completed history" }));
  await screen.findByText("Prepare visit");
  fireEvent.click(within(row()).getByText("Details", { exact: true }));
  expect(screen.getByRole("link", { name: "Open linked discussion" })).toHaveAttribute("href", "/team-discussion?discussionId=9&status=Resolved");
  fireEvent.click(screen.getByRole("button", { name: "Reopen", exact: true }));
  await screen.findByText(/Next step reopened as an additional follow-up/);
  expect(JSON.parse(writes()[1][1].body)).toEqual({ action: "reopen", expectedWorkspaceId: 7, expectedUpdatedAt: "2026-09-16 15:00:00.123456+00" });
  fireEvent.click(screen.getByRole("button", { name: "Open next steps" }));
  await screen.findByText("Prepare visit");
  expect(items[0].discussion_status).toBe("Resolved");
  expect(fetch.mock.calls.every(([url]) => url.startsWith("/api/follow-ups") || url.endsWith("/quick-action"))).toBe(true);
});

it.each(["Today", "Tomorrow", "In 1 week", "No date"])("reschedules with %s using a date-only payload", async label => {
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(row()).getByRole("button", { name: "Reschedule" }));
  expect(screen.queryByLabelText("What should happen next?")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Save date" }));
  await screen.findByText(/Due date saved/);
  expect(JSON.parse(writes()[0][1].body)).toEqual({
    action: "reschedule", dueDate: nextStepDateChoices().find(choice => choice.label === label).value || null,
    expectedWorkspaceId: 7, expectedUpdatedAt: token,
  });
  expect(items[0]).toMatchObject({ title: "Prepare visit", details: "Keep these notes", status: "Open", discussion_status: "Resolved" });
});

it("retains a custom date and draft after a stale-edit conflict", async () => {
  respond = () => reply({ error: "This next step changed. Reload the saved list." }, 409);
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(row()).getByRole("button", { name: "Reschedule" }));
  fireEvent.change(screen.getByLabelText("New due date (optional)"), { target: { value: "2026-11-10" } });
  fireEvent.click(screen.getByRole("button", { name: "Save date" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("New due date (optional)")).toHaveValue("2026-11-10");
  expect(writes()).toHaveLength(1);
  expect(items[0].due_date).toBe("2026-09-16");
});

it("does not remove a task when completion fails", async () => {
  respond = () => reply({ error: "Reload the saved list before trying again." }, 500);
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(row()).getByRole("button", { name: "Mark complete" }));
  await screen.findByRole("alert");
  expect(row()).toBeInTheDocument();
  expect(screen.queryByText(/Next step completed/)).not.toBeInTheDocument();
});

it("blocks repeated clicks and other writes while an action is in flight", async () => {
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  mount();
  await screen.findByText("Prepare visit");
  const complete = within(row()).getByRole("button", { name: "Mark complete" });
  fireEvent.click(complete);
  fireEvent.click(complete);
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Completed history" })).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Reschedule" }).every(button => button.disabled)).toBe(true);
  finish(reply({ id: 1 }));
  await screen.findByText(/Next step completed/);
});

it("requires confirmation before discarding a changed reschedule draft for another action", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(row()).getByRole("button", { name: "Reschedule" }));
  fireEvent.click(screen.getByRole("button", { name: "No date", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(writes()).toHaveLength(0);
  expect(screen.getByLabelText("New due date (optional)")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Reload saved list" }));
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("hides all quick actions for read-only viewers, including completed history", async () => {
  canEdit = false;
  items[1].status = "Done";
  mount();
  await screen.findByText("Prepare visit");
  expect(screen.queryByRole("button", { name: "Mark complete" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Completed history" }));
  await screen.findByText("Make call");
  expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
});
