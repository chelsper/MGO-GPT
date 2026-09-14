import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PortfolioRefreshStatus from "./PortfolioRefreshStatus";

afterEach(cleanup);
const healthy = () => ({
  job: { jobId: "39", workspaceUserId: 9, status: "completed", failedCount: 0 },
  inventory: { total: 140, current: 140, stale: 0, failed: 0 },
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
