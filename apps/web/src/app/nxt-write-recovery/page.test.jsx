import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NxtWriteRecoveryPage from "./page";
import NxtWriteRecoveryLink from "@/components/NxtWriteRecoveryLink";

const receipt = overrides => ({ id: "12", kind: "action", state: "created", title: "Planned call",
  constituentId: "123", remoteId: "456", createdAt: "2026-09-21T14:00:00Z", ...overrides });
const response = (body, ok = true) => ({ ok, json: async () => body });
const listing = receipts => ({ workspace: { id: 7, name: "Selected Fundraiser" }, receipts });
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => response(listing([receipt()])))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("loads saved receipts only and links the existing constituent without sending writes", async () => {
  render(<NxtWriteRecoveryPage />);
  expect(await screen.findByRole("heading", { name: "Planned call" })).toBeInTheDocument();
  expect(screen.getByText(/Selected Fundraiser/)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/nxt-write-recovery", { cache: "no-store" });
  expect(screen.getByRole("link", { name: /Open constituent in NXT/ })).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/123");
  expect(screen.queryByRole("button", { name: /resend|create|retry/i })).not.toBeInTheDocument();
});
it("verifies the saved remote ID and workspace, never replays the original payload", async () => {
  fetch.mockResolvedValueOnce(response(listing([receipt()]))).mockResolvedValueOnce(response({ receipt: receipt({ state: "verified" }) }));
  render(<NxtWriteRecoveryPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Verify existing record only" }));
  await screen.findByText("Existing NXT record verified. Nothing was resent. App updates and reminders were not changed.");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toBe("/api/nxt-write-recovery");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ receiptId: "12", remoteId: "456", workspaceId: 7 });
  expect(screen.queryByRole("button", { name: "Verify existing record only" })).not.toBeInTheDocument();
});
it("requires an existing numeric NXT ID when the create response was lost", async () => {
  fetch.mockResolvedValueOnce(response(listing([receipt({ state: "review", remoteId: null })])))
    .mockResolvedValueOnce(response({ receipt: receipt({ state: "verified", remoteId: "789" }) }));
  render(<NxtWriteRecoveryPage />);
  const button = await screen.findByRole("button", { name: "Verify existing record only" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "not an ID" } });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "789" } });
  fireEvent.click(button);
  await screen.findByText("NXT action ID: 789");
  expect(JSON.parse(fetch.mock.calls[1][1].body).remoteId).toBe("789");
});
it("keeps the held receipt visible after failed verification and reload only reads saved status", async () => {
  fetch.mockResolvedValueOnce(response(listing([receipt()])))
    .mockResolvedValueOnce(response({ error: "The record does not match. Nothing was resent." }, false));
  render(<NxtWriteRecoveryPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Verify existing record only" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was resent");
  expect(screen.getByText("NXT ID saved; app completion unconfirmed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload saved submissions" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls[2][1]).toEqual({ cache: "no-store" });
});
it("explains an empty saved history without suggesting a refresh or another create", async () => {
  fetch.mockResolvedValue(response(listing([])));
  render(<NxtWriteRecoveryPage />);
  await screen.findByText(/Only submissions made after this safeguard was enabled/);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not offer verification or resending when the workflow already completed", async () => {
  fetch.mockResolvedValue(response(listing([receipt({ state: "complete" })])));
  render(<NxtWriteRecoveryPage />);
  await screen.findByText("App workflow completed");
  expect(screen.queryByRole("button", { name: "Verify existing record only" })).not.toBeInTheDocument();
});
it("shows a recovery link only for protected submissions and keeps the current form open", () => {
  const { rerender } = render(<NxtWriteRecoveryLink message="Some unrelated validation error" />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  rerender(<NxtWriteRecoveryLink message="NXT submission 12 is protected against resending." />);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/nxt-write-recovery");
  expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
});
