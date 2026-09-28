import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ user: { id: "auth-2" }, loading: false }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: session.user, loading: session.loading }) }));
import Page from "./page";
import StewardshipPage from "../page";

const task = { id: "50", donorName: "Sample Donor", constituentId: "100", title: "Arrange a thank-you call", status: "Open", dueDate: "2026-09-27", ownerId: "7", ownerName: "Example Officer", ownerActive: true, giftAmount: 2500, giftDate: "2026-09-20", linkedTaskCount: 1 };
const base = { viewerKey: "auth-2", asOf: "2026-09-28", timeZone: "America/New_York", total: 1, page: 1, pages: 1, pageSize: 25, items: [task], owners: [{ id: "7", name: "Example Officer", active: true }] };
let client;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}
beforeEach(() => {
  session.user = { id: "auth-2" }; session.loading = false;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(structuredClone(base))));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); focusManager.setFocused(undefined); });

it("shows saved donor, gift, owner, task and due status without any mutations or provider reads", async () => {
  mount(); await screen.findByText("Sample Donor");
  expect(screen.getByText("$2,500.00")).toBeVisible();
  expect(screen.getByText("on Sep 20, 2026")).toBeVisible();
  expect(screen.getByText("Example Officer", { selector: "span" })).toBeVisible();
  expect(screen.getByText("Arrange a thank-you call")).toBeVisible();
  expect(screen.getByText("Overdue", { selector: "span" })).toBeVisible();
  expect(screen.getByText("Due Sep 27, 2026")).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to Stewardship" })).toHaveAttribute("href", "/stewardship");
  expect(screen.getByText(/Completing a task does not confirm/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatch(/^\/api\/stewardship\/gift-follow-ups\?/);
  expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  expect(screen.queryByRole("button", { name: /edit|send|archive|create/i })).toBeNull();
});

it("applies filters explicitly, resets pagination, and does not fetch on typing or window focus", async () => {
  mount(); await screen.findByText("Sample Donor");
  fireEvent.change(screen.getByLabelText("Search follow-ups"), { target: { value: " Donor " } });
  fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "overdue" } });
  fireEvent.change(screen.getByRole("combobox", { name: "MGO" }), { target: { value: "7" } });
  focusManager.setFocused(false); focusManager.setFocused(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const params = new URL(fetch.mock.calls[1][0], "https://example.test").searchParams;
  expect(Object.fromEntries(params)).toEqual({ search: "Donor", due: "overdue", owner: "7", status: "Open", page: "1" });
  await screen.findByText("Sample Donor");
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(screen.getByLabelText("Search follow-ups")).toHaveValue("");
});

it("paginates with filters and restarts at page one when filters change", async () => {
  fetch.mockImplementation(async () => Response.json({ ...base, total: 26, pages: 2 }));
  mount(); await screen.findByText("Sample Donor");
  fetch.mockResolvedValueOnce(Response.json({ ...base, total: 26, page: 2, pages: 2 }));
  fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
  await screen.findByText("Page 2 of 2");
  expect(fetch.mock.calls[1][0]).toContain("page=2");
  expect(screen.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Search follow-ups"), { target: { value: "Another" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await screen.findByText("Page 1 of 2");
  expect(fetch.mock.calls[2][0]).toContain("page=1");
});

it("shows completed tasks without suggesting delivery and clears incompatible due filters", async () => {
  mount(); await screen.findByText("Sample Donor");
  fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "overdue" } });
  fireEvent.change(screen.getByLabelText("Task status"), { target: { value: "Done" } });
  expect(screen.getByLabelText("Due date")).toBeDisabled();
  expect(screen.getByLabelText("Due date")).toHaveValue("all");
  fetch.mockResolvedValueOnce(Response.json({ ...base, items: [{ ...task, status: "Done" }] }));
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(await screen.findByText("Completed task")).toBeVisible();
  expect(screen.getByText("Task complete; delivery is not tracked here.")).toBeVisible();
  expect(screen.queryByText("Overdue", { selector: "span" })).toBeNull();
});

it("handles undated, missing gift, inactive owner and multi-workspace gift tasks honestly", async () => {
  fetch.mockResolvedValue(Response.json({ ...base, items: [{ ...task, dueDate: null, donorName: null, giftAmount: null, giftDate: "invalid", ownerActive: false, linkedTaskCount: 2 }] }));
  mount(); await screen.findByText("Saved donor unavailable");
  expect(screen.getByText("Saved gift amount unavailable")).toBeVisible();
  expect(screen.getByText("No due date", { selector: "p" })).toBeVisible();
  expect(screen.getByText(/inactive account/)).toBeVisible();
  expect(screen.getByText("2 workspace follow-ups reference this gift.")).toBeVisible();
  expect(screen.queryByText("$0.00")).toBeNull();
});

it("distinguishes an empty saved queue from no filter matches", async () => {
  fetch.mockImplementation(async () => Response.json({ ...base, total: 0, items: [] }));
  mount(); await screen.findByText("No open gift follow-ups yet");
  fireEvent.change(screen.getByLabelText("Search follow-ups"), { target: { value: "Nobody" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await screen.findByText("No follow-ups match these filters");
});

it.each([401, 403, 500])("hides previously loaded tasks when reload returns %s", async status => {
  mount(); await screen.findByText("Sample Donor");
  fetch.mockResolvedValueOnce(Response.json({ error: "private upstream details" }, { status }));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved tasks" }));
  const alert = await screen.findByRole("alert");
  expect(alert).not.toHaveTextContent("private upstream details");
  expect(screen.queryByText("Sample Donor")).toBeNull();
  expect(screen.queryByText("No open gift follow-ups yet")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("rejects mismatched signed-in identity before showing any returned data", async () => {
  fetch.mockResolvedValue(Response.json({ ...base, viewerKey: "other-viewer" }));
  mount(); expect(await screen.findByRole("alert")).toHaveTextContent("Your sign-in changed");
  expect(screen.queryByText("Sample Donor")).toBeNull();
});

it("uses a natural error for network failures and allows a read-only retry", async () => {
  fetch.mockRejectedValueOnce(new Error("Technical connection detail"));
  mount(); expect(await screen.findByRole("alert")).toHaveTextContent("Gift follow-ups could not be loaded. Please try again.");
  expect(screen.queryByText("Technical connection detail")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Sample Donor");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("aborts a pending read on unmount and does not load for signed-out users", async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const view = mount(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = fetch.mock.calls[0][1].signal;
  view.unmount(); expect(signal.aborted).toBe(true);
  session.user = null; mount();
  expect(screen.getByRole("link", { name: "Sign in to view gift follow-ups" })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("links both stewardship tools from the landing page without loading donor data", () => {
  render(<StewardshipPage />);
  expect(screen.getByRole("link", { name: /Gift Follow-ups/ })).toHaveAttribute("href", "/stewardship/gift-follow-ups");
  expect(screen.getByRole("link", { name: /Society Letter Creation/ })).toHaveAttribute("href", "/stewardship/society-letters");
  expect(fetch).not.toHaveBeenCalled();
});
