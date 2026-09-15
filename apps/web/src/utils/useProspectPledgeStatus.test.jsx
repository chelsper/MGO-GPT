import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useProspectPledgeStatus from "./useProspectPledgeStatus";

function setup(props = { viewer: 1, workspace: 44 }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(
    ({ viewer, workspace }) => useProspectPledgeStatus(viewer, workspace),
    {
      initialProps: props,
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads one cached projection, not per card or on local rerenders", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          workspaceUserId: 44,
          byConstituentId: { 100: { count: 1 } },
        }),
      }),
  );
  const hook = setup();
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  hook.rerender({ viewer: 1, workspace: 44 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/prospect-pledge-status",
    expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }),
  );
});
it("does not load until the authenticated workspace is known", () => {
  vi.stubGlobal("fetch", vi.fn());
  setup({ viewer: null, workspace: null });
  expect(fetch).not.toHaveBeenCalled();
});
it("does not reuse the previous viewer/workspace's indicators", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspaceUserId: 44,
          byConstituentId: { 100: { count: 1 } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workspaceUserId: 45, byConstituentId: {} }),
      }),
  );
  const hook = setup();
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  hook.rerender({ viewer: 2, workspace: 45 });
  expect(hook.result.current.data).toBeUndefined();
  await waitFor(() =>
    expect(hook.result.current.data?.workspaceUserId).toBe(45),
  );
  expect(hook.result.current.data.byConstituentId).toEqual({});
});
it("fails closed on a mismatched workspace without repeated retries or NXT requests", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          workspaceUserId: 999,
          byConstituentId: { 100: { count: 1 } },
        }),
      }),
  );
  const hook = setup();
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
});
