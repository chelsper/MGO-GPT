import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TeamDiscussionView from "./TeamDiscussionView";

let client, respond;
const items = [1, 2].map(id => ({ id, subject: `Topic ${id}`, body: "Existing notes", status: "Open", tagged_users: [], linked_constituents: [] }));
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  window.history.replaceState(null, "", "/follow-ups?tab=discussion");
  respond = () => reply({ id: 3 });
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (options?.method) return respond(url, options);
    if (url === "/api/users/mgos") return reply([{ id: 7, name: "Test MGO" }]);
    if (url.startsWith("/api/discussion-items?")) return reply(url.includes("Resolved") ? [] : items);
    throw new Error(`Unexpected request: ${url}`);
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={client}><TeamDiscussionView user={{ id: 7 }} workspaceId={7} /></QueryClientProvider>);

it("retains an edited discussion when a view switch or another edit is cancelled", async () => {
  mount(); await screen.findByText("Topic 1");
  fireEvent.click(screen.getAllByRole("button", { name: "Edit details" })[0]);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Keep this edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Resolved", exact: true }));
  expect(screen.getByLabelText("Title")).toHaveValue("Keep this edit");
  expect(screen.getByRole("button", { name: "Open", exact: true })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
  expect(screen.getByLabelText("Title")).toHaveValue("Keep this edit");
  fireEvent.click(screen.getByRole("button", { name: "Assigned to me" }));
  expect(screen.getByLabelText("Title")).toHaveValue("Keep this edit");
  expect(screen.getByRole("button", { name: "By date" })).toHaveAttribute("aria-pressed", "true");
  expect(window.confirm).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it("makes update failures visible and retains the draft", async () => {
  respond = () => reply({ error: "Save unavailable" }, 503);
  mount(); await screen.findByText("Topic 1");
  fireEvent.click(screen.getAllByRole("button", { name: "Edit details" })[0]);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Keep this edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save unavailable");
  expect(screen.getByLabelText("Title")).toHaveValue("Keep this edit");
});

it("keeps hidden composer drafts and warns before leaving without writing storage or NXT", async () => {
  mount(); await screen.findByText("Topic 1");
  fireEvent.click(screen.getByRole("button", { name: "Add discussion item", exact: true }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft topic" } });
  fireEvent.click(screen.getByRole("button", { name: "Hide and keep draft" }));
  expect(screen.getByText(/Your unsaved discussion draft is kept/)).toBeVisible();
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Add discussion item", exact: true }));
  expect(screen.getByLabelText("Title")).toHaveValue("Draft topic");
  expect(fetch.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it("disables the composer while saving and reports app-only success", async () => {
  let finish; respond = () => new Promise(resolve => { finish = resolve; });
  mount(); await screen.findByText("Topic 1");
  fireEvent.click(screen.getByRole("button", { name: "Add discussion item", exact: true }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New topic" } });
  fireEvent.click(screen.getByRole("button", { name: "Create discussion item" }));
  await waitFor(() => expect(screen.getByLabelText("Title")).toBeDisabled());
  finish(reply({ id: 3 }));
  await screen.findByText("Saved in app");
  expect(screen.getByText("Team discussion created. No NXT action was created.")).toBeVisible();
  expect(screen.queryByText("Verified in NXT")).not.toBeInTheDocument();
});
