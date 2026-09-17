import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import usePortfolioSummary from "./usePortfolioSummary";

const payload = {
  summaryRefreshedAt: "2026-09-17T12:00:00Z",
  mapped: { constituent: { email: "test@example.com", phone: null, address: null } },
};
const response = (data = payload) => ({ ok: true, json: async () => data });

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response())));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("reads only on explicit summary expansion and reuses that result on reopening", async () => {
  const { result, rerender } = renderHook(() => usePortfolioSummary({ allowNxtSummary: true }));
  rerender();
  expect(fetch).not.toHaveBeenCalled();
  act(() => result.current.toggleSummary("100"));
  await waitFor(() => expect(result.current.summaryStates[100]?.status).toBe("success"));
  act(() => result.current.toggleSummary("100"));
  expect(result.current.expandedSummaries[100]).toBe(false);
  act(() => result.current.toggleSummary("100"));
  expect(result.current.expandedSummaries[100]).toBe(true);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/blackbaud/constituents/100/summary");
});

it("retains saved data during an explicit refresh and after a failed refresh without retrying", async () => {
  const { result } = renderHook(() => usePortfolioSummary({ allowNxtSummary: true }));
  await act(async () => result.current.loadSummary("100"));
  const saved = result.current.summaryStates[100];
  let finish;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending;
  act(() => { pending = result.current.loadSummary("100", { refresh: true }); });
  expect(result.current.summaryStates[100]).toMatchObject({
    status: "loading", payload, contactDetails: saved.contactDetails,
  });
  await act(async () => {
    finish({ ok: false, json: async () => ({ error: "Temporarily unavailable" }) });
    await pending;
  });
  expect(result.current.summaryStates[100]).toMatchObject({
    status: "error", error: "Temporarily unavailable", payload, contactDetails: saved.contactDetails,
  });
  act(() => result.current.toggleSummary("100"));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith("/api/blackbaud/constituents/100/summary?refresh=1");
});

it("blocks summary reads during a Blackbaud pause without discarding saved data", async () => {
  const { result, rerender } = renderHook(props => usePortfolioSummary(props), {
    initialProps: { allowNxtSummary: true },
  });
  await act(async () => result.current.loadSummary("100"));
  rerender({ allowNxtSummary: false });
  await act(async () => result.current.loadSummary("100", { refresh: true }));
  await act(async () => result.current.loadSummary("200"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(result.current.summaryStates[100]).toMatchObject({ status: "error", payload });
  expect(result.current.summaryStates[200].error).toMatch(/paused/);
});

it("keeps constituent state separate and accepts newer verified empty contacts", async () => {
  const { result } = renderHook(() => usePortfolioSummary({ allowNxtSummary: true }));
  await act(async () => result.current.loadSummary("100"));
  fetch.mockResolvedValue(response({
    summaryRefreshedAt: "2026-09-18T12:00:00Z",
    mapped: { constituent: { email: null, phone: null, address: null } },
  }));
  await act(async () => result.current.loadSummary("200"));
  expect(result.current.summaryStates[100].contactDetails.email).toBe("test@example.com");
  await act(async () => result.current.loadSummary("100", { refresh: true }));
  expect(result.current.summaryStates[100].contactDetails).toMatchObject({ email: null, phone: null, address: null });
});
