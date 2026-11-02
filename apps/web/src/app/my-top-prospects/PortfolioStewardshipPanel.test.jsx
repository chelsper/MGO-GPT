import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PortfolioStewardshipPanel from "./PortfolioStewardshipPanel";

const props = { person: { name: "Fictional Donor", constituentId: "100", prospectId: 7 }, viewerId: 2, workspaceId: 44 };
const profile = { user: { id: 2, role: "admin", name: "Admin" }, workspaceUser: { id: 44, role: "mgo", name: "Selected MGO" }, actingAsUser: { id: 44 } };
const saved = { viewerId: "2", workspaceId: "44", constituentId: "100", ownerName: "Selected MGO",
  requests: [{ id: "81", request_type: "Stewardship: Personal gift", status: "In Progress", item_name: "Fictional keepsake", task_id: "9", needed_by: null }],
  receivedItems: [{ id: "71", name: "Fictional scarf", receivedOn: null, source: "Imported NXT history" }],
  followUps: [{ id: "9", title: "Plan a thank-you", due_date: "2027-01-15", can_request: true, request_id: "81" },
    { id: "10", title: "Plan recognition", due_date: null, can_request: true, request_id: null }],
};
const reply = (data, ok = true) => ({ ok, json: async () => data });
let onClose, client;
beforeEach(() => {
  sessionStorage.clear(); onClose = vi.fn();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  vi.stubGlobal("fetch", vi.fn(async url => reply(url === "/api/users/profile" ? profile : saved)));
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={client}><PortfolioStewardshipPanel {...props} onClose={onClose} /></QueryClientProvider>);
const loaded = () => screen.findByText("Fictional scarf");

it("loads one saved-data endpoint and distinguishes pending requests, receipts and planned touches", async () => {
  mount(); await loaded();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/portfolio-stewardship?viewerId=2&workspaceId=44&constituentId=100", expect.objectContaining({ cache: "no-store" }));
  expect(screen.getByRole("region", { name: "Recorded gifts received" })).toHaveTextContent("Date not recorded");
  expect(screen.getByText(/Completed does not mean delivered/)).toBeVisible();
  expect(screen.getByText(/not a complete NXT action history/)).toBeVisible();
  expect(screen.getByRole("link", { name: "View received-item history" }).href).toContain("constituentId=100");
  expect(screen.getAllByRole("link", { name: "Open follow-up" })[0]).toHaveAttribute("href", "/follow-ups?tab=next-steps&nextStepId=9");
  expect(screen.getAllByRole("button", { name: "Request assistance" })).toHaveLength(1);
});
it("returns to the same stewardship panel after canceling the existing action form", async () => {
  mount(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Log stewardship action" }));
  await waitFor(() => expect(screen.getByLabelText("Interaction type")).toHaveValue("Stewardship"));
  expect(screen.getByRole("dialog", { name: "Log action" })).toHaveTextContent("Fictional Donor");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await loaded(); expect(onClose).not.toHaveBeenCalled();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it.each(["View request #81", "View linked request", "Request assistance"])("opens %s using the existing task request workflow", async label => {
  const taskId = label === "Request assistance" ? "10" : "9";
  fetch.mockImplementation(async url => reply(String(url).startsWith("/api/pending-actions/") ? {
    viewerId: "2", workspaceId: "44", task: { id: taskId, status: "Open", source_gift_snapshot: {}, request: taskId === "9"
      ? { id: "81", request_type: "Stewardship: Personal gift", status: "In Progress", request_note: "Please help with recognition" } : null }, giftChoices: [],
  } : saved));
  mount(); await loaded(); fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/pending-actions/${taskId}/stewardship-request?viewerId=2&workspaceId=44`, expect.any(Object)));
  if (taskId === "9") {
    await screen.findByText("This follow-up already has a request.");
    expect(screen.queryByRole("button", { name: "Submit request" })).toBeNull();
  } else await screen.findByLabelText("What would you like help with?");
  fireEvent.click(screen.getByRole("button", { name: "Close" })); await loaded();
  expect(onClose).not.toHaveBeenCalled(); expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it.each(["viewerId", "workspaceId", "constituentId"])("rejects a mismatched %s without showing history or enabling workflows", async key => {
  fetch.mockResolvedValue(reply({ ...saved, [key]: "999" })); mount();
  await screen.findByRole("alert"); expect(screen.queryByText("Fictional scarf")).toBeNull();
  expect(screen.getByRole("button", { name: "Log stewardship action" })).toBeDisabled();
});
it("treats errors as unavailable data, allows retry, and explains genuinely empty history", async () => {
  fetch.mockResolvedValue(reply({ error: "Saved details unavailable" }, false)); mount();
  await screen.findByRole("alert"); expect(screen.queryByText(/No received items/)).toBeNull();
  fetch.mockResolvedValue(reply({ ...saved, requests: [], followUps: [], receivedItems: [] }));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText(/does not confirm that the donor has never received/);
  expect(screen.queryByRole("button", { name: "Request assistance" })).toBeNull();
  expect(screen.getByText(/requests currently start from a saved gift follow-up/)).toBeVisible();
});
it("closes with Escape, restores focus and scrolling, and aborts outstanding reads", async () => {
  const opener = document.createElement("button"); document.body.append(opener); opener.focus();
  let resolve; fetch.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = mount(); const signal = fetch.mock.calls[0][1].signal;
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true })); expect(onClose).toHaveBeenCalledOnce();
  view.unmount(); expect(opener).toHaveFocus(); expect(signal.aborted).toBe(true); expect(document.body.style.overflow).toBe("");
  await act(async () => resolve(reply(saved))); opener.remove();
});
