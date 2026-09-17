import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PortfolioRefreshProgress from "./PortfolioRefreshProgress";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function controls(overrides = {}) {
  return {
    state: { inventory: { total: 10, current: 8, stale: 2, failed: 0 } },
    isPending: false, isAdmin: false,
    onStart: vi.fn(), onResume: vi.fn(), onRetryFailures: vi.fn(), onCancel: vi.fn(),
    ...overrides,
  };
}

it("collapses healthy maintenance without starting a request or refresh", () => {
  const props = controls({ state: { inventory: { total: 10, current: 10, stale: 0, failed: 0 } } });
  render(<PortfolioRefreshProgress {...props} />);
  expect(screen.getByText("Portfolio summaries up to date").closest("details")).not.toHaveAttribute("open");
  expect(props.onStart).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps the reported 302-current nightly run compact through batches without changing its controls", () => {
  const props = controls({ state: {
    inventory: { total: 302, current: 302, stale: 0, failed: 0 },
    job: { jobId: "40", workspaceUserId: 9, mode: "nightly", status: "queued",
      totalCount: 302, processedCount: 170, successCount: 170, failedCount: 0,
      updatedAt: new Date().toISOString() },
  } });
  const { rerender } = render(<PortfolioRefreshProgress {...props} />);
  expect(screen.getByText("Background portfolio maintenance")).not.toBeVisible();
  expect(screen.getByText(/Background giving check: 170 of 302/)).toBeVisible();
  rerender(<PortfolioRefreshProgress {...props} isPending />);
  expect(screen.getByText("Background portfolio maintenance")).not.toBeVisible();
  fireEvent.click(screen.getByText("Refresh details"));
  expect(screen.getByText("Saved summaries: 302 of 302 current · 0 due for refresh")).toBeVisible();
  expect(screen.getByText(/Current summaries can still have a giving check due/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  rerender(<PortfolioRefreshProgress {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onCancel).toHaveBeenCalledOnce();
  expect(props.onStart).not.toHaveBeenCalled();
  expect(props.onResume).not.toHaveBeenCalled();
  expect(props.onRetryFailures).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("exposes status-read errors instead of presenting cached progress as healthy", () => {
  const props = controls({ state: {
    inventory: { total: 10, current: 10, stale: 0, failed: 0 },
    job: { mode: "nightly", status: "queued", totalCount: 10, processedCount: 2,
      successCount: 2, failedCount: 0, updatedAt: new Date().toISOString() },
  }, error: new Error("Failed to load portfolio refresh progress") });
  render(<PortfolioRefreshProgress {...props} />);
  expect(screen.getByText("Failed to load portfolio refresh progress")).toBeVisible();
  expect(screen.getByText("Background portfolio maintenance")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("honors the cooldown and delegates explicit resume and cancellation to the parent", () => {
  let now = Date.parse("2026-09-17T12:00:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const props = controls({ state: { job: {
    status: "paused", pausedUntil: "2026-09-17T12:01:00Z", totalCount: 10, processedCount: 2,
  } } });
  const { rerender } = render(<PortfolioRefreshProgress {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Waiting for Blackbaud" }));
  expect(props.onResume).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Waiting for Blackbaud" })).toBeDisabled();
  now += 61000;
  rerender(<PortfolioRefreshProgress {...props} />);
  expect(props.onResume).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Resume now" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onResume).toHaveBeenCalledTimes(1);
  expect(props.onCancel).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("restricts diagnostics and full rebuild to admins and preserves refresh modes", () => {
  const props = controls({ state: {
    inventory: { total: 10, current: 8, stale: 2, failed: 1 },
    job: { status: "completed_with_failures", failedCount: 1,
      failedItems: [{ constituentId: "100", position: 1, stage: "read", apiCallCount: 2, retryCount: 1 }] },
  } });
  const { rerender } = render(<PortfolioRefreshProgress {...props} />);
  expect(screen.queryByText(/Restricted failure diagnostics/)).not.toBeInTheDocument();
  expect(screen.queryByText("Full rebuild")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry 1 failed" }));
  expect(props.onRetryFailures).toHaveBeenCalledTimes(1);
  rerender(<PortfolioRefreshProgress {...props} isAdmin />);
  expect(screen.getByText(/Restricted failure diagnostics/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh 2 stale" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh stale giving" }));
  fireEvent.click(screen.getByText("Full rebuild"));
  expect(props.onStart.mock.calls).toEqual([["stale"], ["nightly"], ["full"]]);
  expect(fetch).not.toHaveBeenCalled();
});

it("does not dispatch additional refreshes while a mutation is pending", () => {
  const props = controls({ isPending: true, isAdmin: true });
  render(<PortfolioRefreshProgress {...props} />);
  for (const name of ["Refresh 2 stale", "Refresh stale giving", "Full rebuild"]) {
    const button = screen.getByText(name);
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(props.onStart).not.toHaveBeenCalled();
});
