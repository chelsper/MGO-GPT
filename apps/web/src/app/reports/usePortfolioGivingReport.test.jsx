import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePortfolioGivingReport } from "./usePortfolioGivingReport";

const saved = {
  snapshot: {
    workspaceUserId: 7,
    generatedAt: "2026-09-19",
    hardCreditTotals: { received: 150 },
  },
  refresh: null,
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json(saved)),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it("loads the saved report once and never starts an NXT refresh on mount or rerender", async () => {
  const { result, rerender } = renderHook(() =>
    usePortfolioGivingReport({ workspaceUserId: 7, enabled: true }),
  );
  await waitFor(() =>
    expect(result.current.data?.snapshot).toEqual(saved.snapshot),
  );
  rerender();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/reports/portfolio-giving");
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
});
it("does not read reports before access is granted", () => {
  renderHook(() =>
    usePortfolioGivingReport({ workspaceUserId: 7, enabled: false }),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps the saved report visible when a refresh fails", async () => {
  const { result } = renderHook(() =>
    usePortfolioGivingReport({ workspaceUserId: 7, enabled: true }),
  );
  await waitFor(() => expect(result.current.data).not.toBeNull());
  fetch.mockResolvedValueOnce(
    Response.json({ error: "Provider unavailable" }, { status: 503 }),
  );
  await act(() => result.current.refresh());
  expect(result.current.data.snapshot).toEqual(saved.snapshot);
  expect(result.current.error).toContain("saved report is unchanged");
});
it("stops at a paused checkpoint rather than hammering a throttled provider", async () => {
  const { result } = renderHook(() =>
    usePortfolioGivingReport({ workspaceUserId: 7, enabled: true }),
  );
  await waitFor(() => expect(result.current.data).not.toBeNull());
  const originalSnapshot = result.current.data.snapshot;
  fetch.mockResolvedValueOnce(
    Response.json({ ...saved, refresh: { status: "paused", id: "job" } }),
  );
  await act(() => result.current.refresh());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.current.refreshing).toBe(false);
  expect(result.current.data.snapshot).toBe(originalSnapshot);
});
it("continues bounded batches only after an explicit refresh", async () => {
  const { result } = renderHook(() =>
    usePortfolioGivingReport({ workspaceUserId: 7, enabled: true }),
  );
  await waitFor(() => expect(result.current.data).not.toBeNull());
  fetch
    .mockResolvedValueOnce(
      Response.json({ ...saved, refresh: { status: "pending", id: "job" } }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...saved, refresh: { status: "complete", id: "job" } }),
    );
  await act(() => result.current.refresh());
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "start" });
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    action: "continue",
    jobId: "job",
  });
});
it("aborts on unmount and discards a late result", async () => {
  let resolve;
  fetch.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result, unmount } = renderHook(() =>
    usePortfolioGivingReport({ workspaceUserId: 7, enabled: true }),
  );
  const signal = fetch.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json(saved)));
  expect(result.current.data).toBeNull();
});
it("refuses a response from a changed workspace", async () => {
  fetch.mockResolvedValueOnce(
    Response.json({ snapshot: { ...saved.snapshot, workspaceUserId: 8 } }),
  );
  const { result } = renderHook(() =>
    usePortfolioGivingReport({ workspaceUserId: 7, enabled: true }),
  );
  await waitFor(() =>
    expect(result.current.error).toContain("workspace changed"),
  );
  expect(result.current.data).toBeNull();
});
