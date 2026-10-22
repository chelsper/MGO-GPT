import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortfolioMaintenanceDetails from "./PortfolioMaintenanceDetails";
const state = { inventory: { total: 2, current: 1, stale: 1 }, serverManaged: true, job: null };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => Response.json(state))));
afterEach(() => vi.unstubAllGlobals());
it("only reads saved data on open and reload", async () => {
  render(<PortfolioMaintenanceDetails workspaceId="9" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reload maintenance status" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  for (const [url, options] of fetch.mock.calls) {
    expect(url).toBe("/api/blackbaud/portfolio-refresh?adminWorkspaceId=9");
    expect(options.method).toBeUndefined();
  }
});
it("keeps a retry available when saved status cannot be read", async () => {
  fetch.mockResolvedValueOnce(Response.json({}, { status: 403 }));
  render(<PortfolioMaintenanceDetails workspaceId="9" />);
  await screen.findByText(/Maintenance details could not be read/);
  fireEvent.click(await screen.findByRole("button", { name: "Reload maintenance status" }));
  expect(await screen.findByText("Cached intelligence refresh")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not resume a saved manual job just because an admin opens details", async () => {
  fetch.mockResolvedValue(Response.json({ ...state, job: { jobId: "5", mode: "full", status: "queued" } }));
  render(<PortfolioMaintenanceDetails workspaceId="9" />);
  await screen.findByRole("button", { name: "Reload maintenance status" });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
});
it("sends an explicit refresh only to the chosen workspace and reloads saved status", async () => {
  render(<PortfolioMaintenanceDetails workspaceId="9" />);
  fireEvent.click(await screen.findByRole("button", { name: "Refresh 1 stale" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls[1][0]).toBe("/api/blackbaud/portfolio-refresh?adminWorkspaceId=9");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "start", mode: "stale" });
  expect(fetch.mock.calls[2][1].method).toBeUndefined();
});
