import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
