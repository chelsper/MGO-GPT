import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import usePortfolioRefreshRunner, { getPortfolioRefreshDelay } from "./usePortfolioRefreshRunner";

const now = Date.parse("2026-09-14T23:21:36Z");
const pausedJob = () => ({ jobId: "36", status: "paused", processedCount: 84, pausedUntil: new Date(now + 60000).toISOString() });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("portfolio automatic cooldown recovery", () => {
  it("waits through the entire cooldown, then continues the existing job once", () => {
    const onProcess = vi.fn();
    renderHook(() => usePortfolioRefreshRunner({ job: pausedJob(), enabled: true, onProcess }));
    act(() => vi.advanceTimersByTime(60000));
    expect(onProcess).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onProcess).toHaveBeenCalledExactlyOnceWith({ action: "process", jobId: "36" });
    act(() => vi.advanceTimersByTime(300000));
    expect(onProcess).toHaveBeenCalledOnce();
  });

  it("keeps polling rerenders from postponing automatic resume", () => {
    const onProcess = vi.fn();
    const { rerender } = renderHook(({ job }) => usePortfolioRefreshRunner({ job, enabled: true, onProcess }), { initialProps: { job: pausedJob() } });
    act(() => vi.advanceTimersByTime(30000));
    rerender({ job: { ...pausedJob() } });
    act(() => vi.advanceTimersByTime(30250));
    expect(onProcess).toHaveBeenCalledOnce();
  });

  it("honors an extended cooldown received from the server", () => {
    const onProcess = vi.fn();
    const { rerender } = renderHook(({ job }) => usePortfolioRefreshRunner({ job, enabled: true, onProcess }), { initialProps: { job: pausedJob() } });
    act(() => vi.advanceTimersByTime(30000));
    rerender({ job: { ...pausedJob(), pausedUntil: new Date(now + 120000).toISOString() } });
    act(() => vi.advanceTimersByTime(90249));
    expect(onProcess).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onProcess).toHaveBeenCalledOnce();
  });

  it.each([{ enabled: false }, { isPending: true }, { error: new Error("Unavailable") }])("does not retry while disabled, in flight, or in error: %j", (overrides) => {
    const onProcess = vi.fn();
    renderHook(() => usePortfolioRefreshRunner({ job: pausedJob(), enabled: true, onProcess, ...overrides }));
    act(() => vi.advanceTimersByTime(300000));
    expect(onProcess).not.toHaveBeenCalled();
  });

  it("cancels a pending retry on unmount or workspace change", () => {
    const onProcess = vi.fn();
    const { rerender, unmount } = renderHook(({ job }) => usePortfolioRefreshRunner({ job, enabled: true, onProcess }), { initialProps: { job: pausedJob() } });
    rerender({ job: { jobId: "other", status: "completed" } });
    act(() => vi.advanceTimersByTime(60250));
    expect(onProcess).not.toHaveBeenCalled();
    rerender({ job: { jobId: "other", status: "queued" } });
    unmount();
    act(() => vi.advanceTimersByTime(3000));
    expect(onProcess).not.toHaveBeenCalled();
  });

  it("does not overflow the browser timeout on a long cooldown", () => {
    const onProcess = vi.fn();
    const deadline = now + 30 * 86400000;
    renderHook(() => usePortfolioRefreshRunner({ job: { ...pausedJob(), pausedUntil: new Date(deadline).toISOString() }, enabled: true, onProcess }));
    act(() => vi.advanceTimersByTime(2 ** 31 - 1));
    expect(onProcess).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(deadline - Date.now() + 250));
    expect(onProcess).toHaveBeenCalledOnce();
  });

  it("spaces batches, resumes expired pauses, and never schedules terminal or unknown jobs", () => {
    expect(getPortfolioRefreshDelay({ jobId: "1", status: "queued" })).toBe(3000);
    expect(getPortfolioRefreshDelay({ ...pausedJob(), pausedUntil: new Date(now - 1000).toISOString() })).toBe(3000);
    for (const status of ["cancelled", "completed", "completed_with_failures", "unknown"]) {
      expect(getPortfolioRefreshDelay({ jobId: "1", status })).toBeNull();
    }
    expect(getPortfolioRefreshDelay({ ...pausedJob(), pausedUntil: "invalid" })).toBeNull();
    expect(getPortfolioRefreshDelay(null)).toBeNull();
  });
});
