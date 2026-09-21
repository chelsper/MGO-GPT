import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server.node";
import IntegrationHealthPage from "./page";

const snapshot = () => ({ viewerId: "1", readAt: "2026-09-17T15:00:00Z", limit: 100, sections: {
  quota: { available: true, paused: false },
  connections: { available: true, credentialsPresent: true, scheduledOwner: { id: "1", name: "Test Admin" }, total: 1,
    items: [{ id: "1", name: "Test Admin", isViewer: true, level: "quiet", label: "Saved connection; renewal available", guidance: "Not a live check." }] },
  portfolios: { available: true, total: 1, items: [{ id: "7", name: "Test MGO", level: "notice", label: "Refresh backlog",
    total: 10, summaryDue: 2, givingDue: 3, failed: 0, guidance: "Wait for overnight maintenance.", job: null }] },
  activity: { available: true, enabled: false },
  verifications: { available: true, total: 0, items: [] },
} });
const reply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(snapshot()))));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reads one saved endpoint and keeps successful results quiet", async () => {
  render(<IntegrationHealthPage />);
  expect(await screen.findByText("Saved connection; renewal available")).toBeVisible();
  expect(screen.getByText(/No reminder-linked submissions are processing/)).toBeVisible();
  expect(screen.getByText(/does not contact Blackbaud/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/admin/integration-health", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(screen.queryByRole("button", { name: /approve|resend|reconnect|restart/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByText("Saved check details")[0]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([200, 401, 403])("hydrates the server loading view without replacing it or repeating reads (HTTP %i)", async (status) => {
  const view = <html lang="en"><head><title>Integration Health</title></head><body><IntegrationHealthPage /></body></html>;
  const doc = new DOMParser().parseFromString(renderToString(view), "text/html");
  const originalMain = doc.querySelector("main");
  const originalHeading = doc.querySelector("h1");
  const recoverableError = vi.fn();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  let finishRead;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
  let root;
  try {
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { root = hydrateRoot(doc, view, { onRecoverableError: recoverableError }); });
    expect(doc.querySelector("main")).toBe(originalMain);
    expect(doc.querySelector("h1")).toBe(originalHeading);
    expect(doc.querySelector('[role="status"]').textContent).toContain("Loading saved integration status");
    await act(async () => { finishRead(reply(status === 200 ? snapshot() : {}, status)); });
    expect(doc.querySelector("main")).toBe(originalMain);
    expect(doc.querySelector("h1")).toBe(originalHeading);
    if (status === 200) {
      expect(doc.body.textContent).toContain("Saved connection; renewal available");
    } else {
      expect(doc.querySelector('[role="alert"]').textContent).toContain(status === 401 ? "Sign in" : "active Admin users only");
      expect(doc.body.textContent).not.toContain("Test MGO");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(recoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  } finally {
    if (root) await act(async () => root.unmount());
    consoleError.mockRestore();
  }
});

it("reloads only on request and does not keep privileged data after access is revoked", async () => {
  render(<IntegrationHealthPage />);
  await screen.findByText("Saved connection; renewal available");
  fetch.mockResolvedValueOnce(reply({ error: "private details should not be shown" }, 403));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved status" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("active Admin users only");
  expect(screen.queryByText("Test MGO")).not.toBeInTheDocument();
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("renders partial failures as unknown without claiming a clear verification list", async () => {
  const data = snapshot();
  data.sections.connections = { available: false };
  data.sections.verifications = { available: false };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  await screen.findByText("Test MGO");
  const region = screen.getByRole("region", { name: "NXT action verification" });
  expect(within(region).getByRole("status")).toHaveTextContent("unknown, not clear");
  expect(within(region).queryByText(/No action required/)).not.toBeInTheDocument();
});

it("explains wait versus verification and preserves the original owner context", async () => {
  const data = snapshot();
  data.sections.quota = { available: true, paused: true, blockedUntil: "2026-09-17T16:00:00Z" };
  data.sections.verifications = { available: true, total: 104, items: [
    { id: "33", ownerName: "Test MGO", ownerActive: true, state: "review", hasActionId: true,
      href: "/follow-ups?tab=next-steps&nextStepId=33&status=Open", updatedAt: data.readAt },
    { id: "34", ownerName: "Old account", ownerActive: false, state: "processing", hasActionId: false, updatedAt: data.readAt },
  ] };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  expect(await screen.findByText("Wait before more NXT reads")).toBeVisible();
  expect(screen.getByText(/Select the named owner's workspace/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Open in Follow-ups" })).toHaveAttribute("href", "/follow-ups?tab=next-steps&nextStepId=33&status=Open");
  expect(screen.getByText(/Owner is inactive/)).toBeVisible();
  expect(screen.getByText(/Showing 2 of 104/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("aborts a pending read on unmount without starting any workflow", async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const { unmount } = render(<IntegrationHealthPage />);
  const signal = fetch.mock.calls[0][1].signal;
  expect(screen.getByRole("button", { name: "Reading saved status..." })).toBeDisabled();
  unmount();
  expect(signal.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("ends a stalled read and offers an explicit retry without polling", async () => {
  vi.useFakeTimers();
  fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  render(<IntegrationHealthPage />);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(screen.getByRole("alert")).toHaveTextContent("timed out");
  expect(screen.getByRole("button", { name: "Reload saved status" })).toBeEnabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("recovers after a failed saved read without repeating the request automatically", async () => {
  fetch.mockRejectedValueOnce(new Error("Network unavailable"));
  render(<IntegrationHealthPage />);
  await screen.findByRole("alert");
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved status" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(await screen.findByText("Test MGO")).toBeVisible();
});

it("shows automatic enrollment, initial setup needs and the unchanged shared budget without starting work", async () => {
  const data = snapshot();
  data.sections.activity = { available: true, enabled: true, enrollmentMode: "active_mgos", workspaceCount: 5,
    awaitingAssignments: 1, total: 1800, neverChecked: 1300, due: 1400, callsToday: 288, dailyBudget: 360 };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  expect(await screen.findByText(/Automatic enrollment: active MGOs. 5 enrolled workspaces/)).toBeVisible();
  expect(screen.getByText(/New active MGOs join automatically after fundraiser mapping/)).toBeVisible();
  expect(screen.getByText(/1 enrolled workspaces still need an initial assignment snapshot/)).toBeVisible();
  expect(screen.getByText(/288 of 360 reserved API calls today/)).toBeVisible();
  expect(screen.getByText(/A backlog can take multiple overnight windows/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /start|enroll|sync|restart/i })).not.toBeInTheDocument();
});

it("shows individual coverage and expands saved evidence without another fetch", async () => {
  const data = snapshot();
  data.sections.activity = { available: true, enabled: true, enrollmentMode: "active_mgos", workspaceCount: 1,
    total: 20, neverChecked: 5, due: 9, callsToday: 288, dailyBudget: 360,
    items: [{ id: "7", name: "Test Fundraiser", hasAssignments: true, assigned: 10, checked: 6, waiting: 4,
      giftsChecked: 8, actionsChecked: 7, due: 9, connectionErrors: 1, throttled: 2, otherErrors: 0,
      level: "review", label: "Checks need attention", lastCheckedAt: "2026-09-19T10:00:00Z", oldestCheckedAt: "2026-09-17T10:00:00Z", lastAttemptAt: "2026-09-19T10:05:00Z" }] };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  const item = await screen.findByRole("article", { name: "Test Fundraiser activity coverage" });
  expect(within(item).getByText("6 / 10")).toBeVisible();
  expect(within(item).getByText("Records checked")).toBeVisible();
  expect(within(item).getByText("Waiting for first checks")).toBeVisible();
  expect(within(item).getByText(/Last successful individual check: Sep 19, 2026, 6:00 AM/)).toBeVisible();
  fireEvent.click(within(item).getByText("Saved check details"));
  expect(within(item).getByText(/Gift checks saved: 8 \/ 10. Action checks saved: 7 \/ 10./)).toBeVisible();
  expect(within(item).getByText(/Errors: 1 connection \/ 2 throttled \/ 0 unverified response/)).toBeVisible();
  expect(within(item).getByText(/These counts overlap/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not present a missing assignment snapshot as a checked empty portfolio", async () => {
  const data = snapshot();
  data.sections.activity = { available: true, enabled: true, workspaceCount: 2, items: [
    { id: "7", name: "New MGO", hasAssignments: false, assigned: null, level: "notice", label: "Assignment sync needed" },
    { id: "8", name: "Empty MGO", hasAssignments: true, assigned: 0, checked: 0, waiting: 0, due: 0,
      connectionErrors: 0, throttled: 0, otherErrors: 0, level: "notice", label: "No assigned constituents" },
  ] };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  const newMgo = await screen.findByRole("article", { name: "New MGO activity coverage" });
  expect(within(newMgo).getByText(/coverage is unknown, not zero/)).toBeVisible();
  expect(within(newMgo).queryByText("Records checked")).not.toBeInTheDocument();
  expect(within(screen.getByRole("article", { name: "Empty MGO activity coverage" })).getByText("0 / 0")).toBeVisible();
});

it("discloses a bounded coverage list instead of hiding additional portfolios", async () => {
  const data = snapshot();
  data.sections.activity = { available: true, enabled: true, workspaceCount: 101,
    items: [{ id: "7", name: "Test MGO", hasAssignments: false, level: "notice", label: "Assignment sync needed" }] };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  expect(await screen.findByText(/Showing 1 of 101/)).toBeVisible();
});

it("shows capacity separately from saved freshness, without starting more work", async () => {
  const data = snapshot();
  data.sections.capacity = { available: true, workspaces: 103, unknownWorkspaces: 2, slots: 908,
    uniqueConstituents: 800, due: 578, givingDue: 578, summaryDue: 10, neverChecked: 25,
    givingOver48Hours: 100, givingChecked24Hours: 330, itemsPerNight: 360,
    minimumSweepNights: 3, minimumBacklogNights: 2, exceedsNight: true, assignmentsDue: 1 };
  data.sections.activity = { available: true, enabled: true, dailyBudget: 360, callsToday: 288,
    capacity: { callsPerNight: 288, minimumSweepNights: 7 } };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  const section = await screen.findByRole("region", { name: "Refresh capacity" });
  expect(within(section).getByText("Daily coverage exceeds scheduled capacity")).toBeVisible();
  expect(within(section).getByText("330 / 908")).toBeVisible();
  expect(within(section).getByText(/2 workspaces lack/)).toBeVisible();
  expect(within(section).getByText(/25 slots have no saved giving check/)).toBeVisible();
  fireEvent.click(within(section).getByText("Saved check details"));
  expect(within(section).getByText(/best-case arithmetic lower bounds, not finish dates/)).toBeVisible();
  expect(screen.getByText(/at most 288 reserved call slots per normal night/)).toBeVisible();
  expect(screen.getByText(/Morning catch-up is off/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /start|refresh now|restart|sync/i })).not.toBeInTheDocument();
});

it("shows unknown capacity when the section is unavailable", async () => {
  render(<IntegrationHealthPage />);
  const section = await screen.findByRole("region", { name: "Refresh capacity" });
  expect(within(section).getByRole("status")).toHaveTextContent("unknown, not clear");
  expect(within(section).queryByText("Known assignment slots")).not.toBeInTheDocument();
});

it("explains enabled catch-up without offering controls to start or increase it", async () => {
  const data = snapshot();
  data.sections.activity = { available: true, enabled: true, dailyBudget: 360, callsToday: 304,
    catchupEnabled: true, catchupCallsToday: 16,
    capacity: { callsPerNight: 288, minimumSweepNights: 7, catchupCallsPerDay: 72 } };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  expect(await screen.findByText(/Morning catch-up is enabled from 7:00-9:00 AM Eastern/)).toBeVisible();
  expect(screen.getByText(/16 of 72 catch-up call reservations used today, included in the same 360 daily limit/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /enable|start|catch-up/i })).not.toBeInTheDocument();
});

it("keeps missing catch-up usage explicitly unavailable instead of showing zero", async () => {
  const data = snapshot();
  data.sections.activity = { available: true, enabled: true, dailyBudget: 360,
    catchupEnabled: true, catchupCallsToday: null, capacity: { catchupCallsPerDay: 72 } };
  fetch.mockResolvedValueOnce(reply(data));
  render(<IntegrationHealthPage />);
  expect(await screen.findByText(/Today's usage is unavailable/)).toBeVisible();
  expect(screen.queryByText(/0 of 72 catch-up/)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
