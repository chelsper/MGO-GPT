import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DashboardAssistant from "./DashboardAssistant";
import DashboardAssistantSettings from "./DashboardAssistantSettings";
import { WorkspaceTerminologyProvider } from "./WorkspaceTerminology";
const item = { key: "follow-up:1", revision: "a".repeat(64), constituentName: "Sample Donor", title: "Plan the visit", message: "This follow-up is due today.", timing: "Due today", href: "/follow-ups?tab=next-steps&nextStepId=1&status=Open", linkLabel: "Review follow-up" };
const payload = { viewerId: "7", workspaceUserId: "10", workspaceName: "Example Officer", items: [item], hidden: [], asOf: "2026-09-27" };
let client;
function mount({ viewerId = 7, workspaceId = 10, settings } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = (workspace = workspaceId) => <QueryClientProvider client={client}><WorkspaceTerminologyProvider dashboardAssistant={settings}><DashboardAssistant viewerId={viewerId} workspaceId={workspace} /></WorkspaceTerminologyProvider></QueryClientProvider>;
  return { ...render(ui()), ui };
}
const open = () => fireEvent.click(screen.getByRole("button", { name: /Check in with/ }));
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => structuredClone(payload) })));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });
it("does not load any data until opened and never auto-opens", async () => {
  mount();
  expect(screen.getByRole("button", { name: /Check in with Nellie/ })).toHaveAttribute("aria-expanded", "false");
  expect(fetch).not.toHaveBeenCalled();
  open();
  expect(await screen.findByText("Sample Donor")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/dashboard-priorities?workspaceId=10");
  expect(screen.getByRole("link", { name: /Review follow-up/ })).toHaveAttribute("href", item.href);
  expect(screen.getByText(/not a live NXT check/)).toBeVisible();
});
it("honors organization branding and disabling", () => {
  const view = mount({ settings: { name: "Guide", avatar: "compass", enabled: true } });
  expect(screen.getByRole("button", { name: /Check in with Guide/ })).toBeVisible();
  view.unmount();
  mount({ settings: { enabled: false, name: "Guide", avatar: "compass" } });
  expect(screen.queryByRole("button", { name: /Check in with/ })).toBeNull(); expect(fetch).not.toHaveBeenCalled();
});
it("persists dismiss, explains scope, and allows restoration", async () => {
  mount(); open(); await screen.findByText("Sample Donor");
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...payload, items: [], hidden: [{ ...item, hiddenReason: "dismissed" }] }) });
  fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
  expect(await screen.findByRole("status")).toHaveTextContent("The record is still open");
  await screen.findByRole("button", { name: "Snoozed & dismissed (1)" });
  expect(screen.getByText(/Your snoozed and dismissed items are still available/)).toBeVisible();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ key: item.key, revision: item.revision, action: "dismiss" });
  fireEvent.click(screen.getByRole("button", { name: "Snoozed & dismissed (1)" }));
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });
  fireEvent.click(screen.getByRole("button", { name: "Restore reminder" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reminder restored"));
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toMatchObject({ action: "restore" });
});
it("snoozes without changing the record date", async () => {
  mount(); open(); await screen.findByText("Sample Donor");
  fireEvent.click(screen.getByText("Snooze", { selector: "summary" }));
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });
  fireEvent.click(screen.getByRole("button", { name: "Until tomorrow" }));
  expect(await screen.findByRole("status")).toHaveTextContent("The record's date has not changed");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ action: "snooze", days: 1 });
});
it("leaves a reminder visible after a rejected write with no false success", async () => {
  mount(); open(); await screen.findByText("Sample Donor");
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "This reminder has changed. Reload reminders before continuing." }) });
  fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This reminder has changed");
  expect(screen.getByText("Sample Donor")).toBeVisible(); expect(screen.queryByRole("status")).toBeNull();
});
it("rejects response scope mismatches and clears the panel when switching workspace", async () => {
  const view = mount(); open(); await screen.findByText("Sample Donor");
  view.rerender(view.ui(20));
  expect(screen.queryByText("Sample Donor")).toBeNull();
  expect(screen.getByRole("button", { name: /Check in with/ })).toHaveAttribute("aria-expanded", "false");
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Your workspace changed");
  expect(screen.queryByText("Sample Donor")).toBeNull();
});
it("limits initial cards and lets users reveal more without additional requests", async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, items: Array.from({ length: 7 }, (_, index) => ({ ...item, key: `follow-up:${index}` })) }) });
  mount(); open();
  await screen.findByRole("button", { name: "Show five more" });
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "Show five more" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(7); expect(fetch).toHaveBeenCalledTimes(1);
});
it("clearly labels a limited selection and a factual empty state", async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, items: [], truncated: true }) });
  mount(); open();
  expect(await screen.findByText(/Nothing in the available saved records/)).toBeVisible();
  expect(screen.getByText(/limited selection/)).toBeVisible();
});
it("settings edits are controlled and use the existing profile save rather than making requests", () => {
  const onChange = vi.fn();
  render(<DashboardAssistantSettings value={{ enabled: true, name: "Nellie", avatar: "dolphin" }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Helper name"), { target: { value: "Guide" } });
  expect(onChange).toHaveBeenLastCalledWith({ enabled: true, name: "Guide", avatar: "dolphin" });
  fireEvent.change(screen.getByLabelText("Helper avatar"), { target: { value: "compass" } });
  expect(onChange).toHaveBeenLastCalledWith({ enabled: true, name: "Nellie", avatar: "compass" });
  expect(fetch).not.toHaveBeenCalled();
});
it("filters gift reminders locally and shows safe review/action links without submitting anything", async () => {
  const gift = { ...item, key: "gift:900", kind: "gift", constituentId: "100", title: "$2,500.00 gift", message: "Would a thank-you be helpful?", href: "/action-opportunity-update?mode=action&actionType=Stewardship&blackbaudConstituentId=100", linkLabel: "Log stewardship action" };
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, items: [item, gift], giftCoverage: { status: "ready", startDate: "2026-08-29", endDate: "2026-09-27", checkedAt: "2026-09-27T06:00:00Z" } }) });
  mount(); open(); await screen.findByText("$2,500.00 gift");
  fireEvent.change(screen.getByLabelText("Show"), { target: { value: "gift" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByRole("link", { name: /Log stewardship action/ })).toHaveAttribute("href", gift.href);
  expect(screen.getByRole("link", { name: /Review donor in NXT/ })).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/100");
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("About gift suggestions"));
  expect(screen.getByText(/does not tell us whether someone has already been thanked/)).toBeVisible();
});
it("explains unavailable gift coverage without claiming no gifts exist", async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, items: [], giftCoverage: { status: "unavailable" } }) });
  mount(); open(); await screen.findByText("About gift suggestions");
  fireEvent.change(screen.getByLabelText("Show"), { target: { value: "gift" } });
  expect(screen.getByText(/doesn't mean there were no gifts/)).toBeVisible();
});
it("dismisses gift reminders without claiming the donor was thanked", async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, items: [{ ...item, kind: "gift", key: "gift:900", constituentId: "100" }] }) });
  mount(); open(); await screen.findByText("Sample Donor");
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });
  fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Nothing was sent or marked thanked");
});
