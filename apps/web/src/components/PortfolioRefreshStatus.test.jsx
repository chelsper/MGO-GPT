import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PortfolioRefreshStatus from "./PortfolioRefreshStatus";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const healthy = () => ({
  job: { jobId: "39", workspaceUserId: 9, status: "completed", failedCount: 0 },
  inventory: { total: 140, current: 140, stale: 0, failed: 0 },
});

function runningNightly(overrides = {}) {
  return {
    inventory: { total: 302, current: 302, stale: 0, failed: 0 },
    job: { jobId: "40", workspaceUserId: 9, mode: "nightly", status: "queued",
      totalCount: 302, processedCount: 170, successCount: 170, failedCount: 0,
      updatedAt: new Date(Date.now() - 1000).toISOString(), ...overrides },
  };
}

describe("quiet healthy background maintenance", () => {
  it.each(["queued", "processing"])("collapses a healthy %s nightly job without claiming giving is current", (status) => {
    const onRefresh = vi.fn();
    render(<View state={runningNightly({ status })} onRefresh={onRefresh} />);
    expect(screen.getByText("Saved summaries ready")).toBeVisible();
    expect(screen.getByText("Background giving check: 170 of 302 checked. You can keep working.")).toBeVisible();
    expect(screen.queryByText("Portfolio summaries up to date")).not.toBeInTheDocument();
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
    fireEvent.click(screen.getByText("Refresh details"));
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not flash expanded during batch requests or close details on progress updates", () => {
    const state = runningNightly();
    const { rerender } = render(<View state={state} />);
    rerender(<View state={state} isPending />);
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
    fireEvent.click(screen.getByText("Refresh details"));
    rerender(<View state={runningNightly({ processedCount: 180, successCount: 180 })} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    expect(screen.getByText(/Background giving check: 180 of 302/)).toBeVisible();
    rerender(<View state={runningNightly({ status: "completed", processedCount: 302, successCount: 302 })} />);
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
    expect(screen.getByText("Portfolio summaries up to date")).toBeVisible();
  });

  it.each([
    { mode: "full" }, { mode: "stale" }, { mode: undefined },
    { status: "paused" }, { status: "completed_with_failures" }, { status: "unknown" },
    { failedCount: 1 }, { failedCount: null }, { failedItems: [{ constituentId: "1" }] },
    { processedCount: 303 }, { successCount: 169 }, { totalCount: 0 },
    { totalCount: null }, { processedCount: "170" }, { updatedAt: null },
    { updatedAt: "invalid" }, { updatedAt: "2000-01-01T00:00:00Z" },
    { updatedAt: "2999-01-01T00:00:00Z" },
  ])("does not hide nonroutine, failed or unverified work: %j", (overrides) => {
    render(<View state={runningNightly(overrides)} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    expect(screen.queryByText("Saved summaries ready")).not.toBeInTheDocument();
  });

  it.each([
    null,
    { total: 302, current: 301, stale: 1, failed: 0 },
    { total: 302, current: 302, stale: 0, failed: 1 },
    { total: 302, current: 302, stale: null, failed: 0 },
    { total: 0, current: 0, stale: 0, failed: 0 },
  ])("keeps unavailable or incomplete inventory visible: %j", (inventory) => {
    render(<View state={{ ...runningNightly(), inventory }} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
  });

  it("reveals errors immediately even while the next batch is pending", () => {
    const state = runningNightly();
    const { rerender } = render(<View state={state} isPending />);
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
    rerender(<View state={state} isPending error={new Error("Status unavailable")} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    rerender(<View state={runningNightly({ status: "paused" })} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
  });

  it("shows a progress-check notice when the saved update ages beyond 15 minutes", () => {
    let now = Date.parse("2026-09-17T21:11:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const state = runningNightly({ updatedAt: new Date(now).toISOString() });
    const { rerender } = render(<View state={state} />);
    now += 15 * 60 * 1000;
    rerender(<View state={state} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Background refresh progress needs checking");
    expect(screen.getByRole("status")).toHaveTextContent("does not by itself mean the refresh failed");
  });
});
function View({ state = healthy(), onRefresh = vi.fn(), ...props }) {
  return <PortfolioRefreshStatus state={state} {...props}>
    <div>Nightly portfolio maintenance</div>
    <button onClick={onRefresh}>Refresh stale giving</button>
  </PortfolioRefreshStatus>;
}

describe("quiet completed portfolio maintenance", () => {
  it("collapses a healthy completed job without starting another refresh", () => {
    const onRefresh = vi.fn();
    render(<View onRefresh={onRefresh} />);
    expect(screen.getByText("Portfolio summaries up to date")).toBeVisible();
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
    expect(screen.getByText("Refresh stale giving")).not.toBeVisible();
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it("keeps refresh controls accessible behind a native disclosure", () => {
    const onRefresh = vi.fn();
    render(<View onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText("Refresh options"));
    expect(screen.getByRole("button", { name: "Refresh stale giving" })).toBeVisible();
    expect(onRefresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh stale giving" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
  it.each(["queued", "processing", "paused", "completed_with_failures", "unknown"])("does not hide a %s job behind current cached values", (status) => {
    const state = healthy();
    state.job.status = status;
    render(<View state={state} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    expect(screen.queryByText("Portfolio summaries up to date")).not.toBeInTheDocument();
  });
  it.each([
    { inventory: { total: 140, current: 139, stale: 1, failed: 0 } },
    { inventory: { total: 140, current: 140, stale: 0, failed: 1 } },
    { inventory: { total: 140, current: 139, stale: 0, failed: 0 } },
    { inventory: { total: 140, current: 140, stale: null, failed: 0 } },
    { inventory: null },
    { job: { status: "completed", failedCount: 1 } },
  ])("keeps incomplete inventory or failure counts visible: %j", (overrides) => {
    render(<View state={{ ...healthy(), ...overrides }} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    expect(screen.queryByText("Portfolio summaries up to date")).not.toBeInTheDocument();
  });
  it.each([{ isPending: true }, { error: new Error("Refresh unavailable") }])("shows pending requests and errors even after success", (props) => {
    render(<View {...props} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
  });
  it("automatically collapses a completed run, and exposes a subsequent failure", () => {
    const state = healthy();
    const { rerender } = render(<View state={{ ...state, job: { ...state.job, status: "processing" } }} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    rerender(<View state={state} />);
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
    fireEvent.click(screen.getByText("Refresh options"));
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
    rerender(<View state={{ ...state, job: { ...state.job, jobId: "40", status: "completed" } }} />);
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
    rerender(<View state={{ ...state, job: { ...state.job, status: "completed_with_failures", failedCount: 1 } }} />);
    expect(screen.getByText("Nightly portfolio maintenance")).toBeVisible();
  });
  it("does not imply an empty portfolio has loaded constituent summaries", () => {
    render(<View state={{ job: null, inventory: { total: 0, current: 0, stale: 0, failed: 0 } }} />);
    expect(screen.getByText("No portfolio summaries to refresh")).toBeVisible();
    expect(screen.getByText("Nightly portfolio maintenance")).not.toBeVisible();
  });
});
