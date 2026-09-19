import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FollowUpsPage from "./page";
import { followUpTab } from "@/components/FollowUpsWorkspace";
import { WorkspaceTerminologyProvider } from "@/components/WorkspaceTerminology";

const user = vi.hoisted(() => ({ id: 2, name: "Admin", role: "admin" }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: user, loading: false }) }));
let client;
let items;
let canEdit;
let workspaceId;
let saveResponse;
const token = "2026-09-15 12:30:10.123456+00";
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const callsTo = path => fetch.mock.calls.filter(([url]) => String(url).startsWith(path));

beforeEach(() => {
  window.history.replaceState(null, "", "/follow-ups");
  canEdit = true;
  workspaceId = 7;
  saveResponse = () => reply({ id: 1 });
  items = [
    { id: 1, title: "Prepare visit", details: "Discuss scholarship", constituent_name: "Portfolio Person", prospect_id: null, due_date: "2026-09-14", updated_at: token, category: "Stewardship", discussion_item_id: 9, discussion_status: "Resolved" },
    { id: 2, title: "Schedule call", constituent_name: "Second Person", due_date: null, updated_at: token },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (url === "/api/users/profile") return reply({ user, workspaceUser: { id: 7, name: "Selected MGO", role: "mgo" }, actingAsUser: { id: 7 } });
    if (String(url).startsWith("/api/follow-ups")) return reply({
      items: String(url).includes("Done") ? [{ ...items[0], title: "Finished task", status: "Done", completed_at: "2026-09-15" }] : items,
      asOf: "2026-09-15", viewerId: 2, workspace: { id: workspaceId, name: "Selected MGO", canEdit },
    });
    if (url === "/api/pending-actions/1" && options.method === "PUT") return saveResponse();
    if (String(url).startsWith("/api/discussion-items?")) return reply([{ id: 9, subject: "Visit discussion", status: String(url).includes("Resolved") ? "Resolved" : "Open", body: "Talk together", assigned_user_id: 7 }]);
    if (url === "/api/users/mgos") return reply([{ id: 7, name: "Selected MGO" }]);
    throw new Error(`Unexpected fetch: ${url}`);
  }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

afterEach(() => { cleanup(); client?.clear(); delete HTMLElement.prototype.scrollIntoView; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={client}><FollowUpsPage /></QueryClientProvider>);
const firstRow = () => screen.getByRole("article", { name: "Portfolio Person: Prepare visit" });

it("reuses configured workspace terminology without fetching settings or losing edits", async () => {
  const page = label => <QueryClientProvider client={client}><WorkspaceTerminologyProvider terminology={{ mgo: label }}><FollowUpsPage /></WorkspaceTerminologyProvider></QueryClientProvider>;
  const view = render(page("Fundraiser"));
  await screen.findByText("Prepare visit");
  expect(screen.getByText(/Fundraiser workspace:/)).toBeVisible();
  fireEvent.click(within(firstRow()).getByText("Details", { exact: true }));
  fireEvent.click(within(firstRow()).getByRole("button", { name: "Edit next step" }));
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Keep this draft" } });
  view.rerender(page("Senior Major Gift Officer"));
  expect(screen.getByText(/Senior Major Gift Officer workspace:/)).toBeVisible();
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Keep this draft");
  expect(callsTo("/api/users/profile")).toHaveLength(1);
  expect(callsTo("/api/follow-ups")).toHaveLength(1);
  expect(fetch.mock.calls).toHaveLength(2);
});

it("loads saved next steps first and fetches discussions only when that tab is opened", async () => {
  mount();
  await screen.findByText("Prepare visit");
  expect(screen.getByRole("link", { name: "Return to home" })).toHaveAttribute("href", "/");
  expect(screen.getByText("Use Next Steps for tasks to do, and Team Discussion for talking points and handoffs.")).toBeVisible();
  expect(screen.getByText(/Mark complete finishes only the reminder/)).toBeVisible();
  expect(screen.getByRole("heading", { name: /Overdue/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /No date/ })).toBeInTheDocument();
  expect(screen.getByText("Stewardship")).toBeInTheDocument();
  expect(callsTo("/api/discussion-items")).toHaveLength(0);
  expect(callsTo("/api/users/profile")[0][0]).toBe("/api/users/profile");
  fireEvent.click(screen.getByRole("tab", { name: "Team Discussion" }));
  await screen.findByText("Visit discussion");
  expect(callsTo("/api/discussion-items")).toHaveLength(1);
  expect(window.location.search).toBe("?tab=discussion");
  fireEvent.click(screen.getByRole("tab", { name: "Next Steps" }));
  expect(screen.getByText("Prepare visit")).toBeVisible();
  expect(callsTo("/api/follow-ups")).toHaveLength(1);
});

it("searches and pages the complete saved list without additional fetches", async () => {
  items = Array.from({ length: 32 }, (_, index) => ({ id: index, title: `Task ${index}`, constituent_name: `Person ${index}`, due_date: "2026-09-16" }));
  mount();
  await screen.findByText("Task 0");
  expect(screen.getAllByRole("article")).toHaveLength(25);
  fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
  expect(screen.getAllByRole("article")).toHaveLength(7);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Person 31" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByText("Task 31")).toBeInTheDocument();
  expect(callsTo("/api/follow-ups")).toHaveLength(1);
});

it("preserves a failed edit across tab changes and saves only the intended fields with an exact version token", async () => {
  saveResponse = () => reply({ error: "This next step changed. Your draft was not sent." }, 409);
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(firstRow()).getByText("Details", { exact: true }));
  fireEvent.click(within(firstRow()).getByRole("button", { name: "Edit next step" }));
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Call about visit" } });
  fireEvent.click(screen.getByRole("button", { name: "No date", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Save next step" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Call about visit");
  expect(JSON.parse(callsTo("/api/pending-actions/")[0][1].body)).toEqual({
    title: "Call about visit", details: "Discuss scholarship", dueDate: null,
    expectedWorkspaceId: 7, expectedUpdatedAt: token,
  });
  fireEvent.click(screen.getByRole("tab", { name: "Team Discussion" }));
  await screen.findByText("Visit discussion");
  fireEvent.click(screen.getByRole("tab", { name: "Next Steps" }));
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Call about visit");
  expect(screen.getByLabelText("Due date (optional)")).toHaveValue("");
  saveResponse = () => reply({ id: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Save next step" }));
  await screen.findByText("Next step saved. No NXT action was created.");
  expect(screen.queryByLabelText("What should happen next?")).not.toBeInTheDocument();
});

it("confirms before discarding an unsaved edit to view history", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(firstRow()).getByText("Details", { exact: true }));
  fireEvent.click(within(firstRow()).getByRole("button", { name: "Edit next step" }));
  fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "Unsaved draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Completed history" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("What should happen next?")).toHaveValue("Unsaved draft");
  expect(callsTo("/api/follow-ups")).toHaveLength(1);
});

it("offers reopen but not field editing in history and links to the matching resolved discussion", async () => {
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.click(within(firstRow()).getByText("Details", { exact: true }));
  expect(screen.getByRole("link", { name: "Open linked discussion" })).toHaveAttribute("href", "/team-discussion?discussionId=9&status=Resolved");
  fireEvent.click(screen.getByRole("button", { name: "Completed history" }));
  await screen.findByText("Finished task");
  expect(screen.queryByRole("button", { name: "Edit next step" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
  expect(callsTo("/api/pending-actions/")).toHaveLength(0);
});

it("does not offer edits in a read-only workspace", async () => {
  canEdit = false;
  mount();
  await screen.findByText("Prepare visit");
  expect(screen.getByText(/Next steps are read-only/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit next step" })).not.toBeInTheDocument();
});

it("fails closed rather than displaying another workspace or a misleading empty state", async () => {
  workspaceId = 88;
  mount();
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("The workspace changed");
  expect(screen.queryByText("Prepare visit")).not.toBeInTheDocument();
  expect(screen.queryByText(/No open next steps/)).not.toBeInTheDocument();
});

it("preserves existing discussion bookmarks and resolved-item edit links", async () => {
  window.history.replaceState(null, "", "/team-discussion?discussionId=9&status=Resolved&edit=1");
  mount();
  await screen.findByText("Visit discussion");
  await waitFor(() => expect(screen.getByRole("button", { name: "Editing details" })).toBeInTheDocument());
  expect(screen.getByRole("tab", { name: "Team Discussion" })).toHaveAttribute("aria-selected", "true");
  expect(callsTo("/api/follow-ups")).toHaveLength(0);
  expect(callsTo("/api/discussion-items")[0][0]).toBe("/api/discussion-items?status=Resolved");
  expect(followUpTab({ pathname: "/team-discussion", search: "?tab=next-steps" })).toBe("next-steps");
});

it("supports keyboard tab navigation", async () => {
  mount();
  await screen.findByText("Prepare visit");
  fireEvent.keyDown(screen.getByRole("tab", { name: "Next Steps" }), { key: "ArrowRight" });
  await screen.findByText("Visit discussion");
  expect(screen.getByRole("tab", { name: "Team Discussion" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("tab", { name: "Team Discussion" }), { key: "Home" });
  expect(screen.getByRole("tab", { name: "Next Steps" })).toHaveFocus();
});
