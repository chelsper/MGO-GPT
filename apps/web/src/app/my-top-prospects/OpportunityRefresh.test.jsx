import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OpportunityRefresh from "./OpportunityRefresh";

function view(props = {}) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const result = render(<QueryClientProvider client={client}><OpportunityRefresh prospectId={7} hasLinkedOpportunities editing={false} {...props} /></QueryClientProvider>);
  return { ...result, invalidate, client };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("checks only the opened prospect and refreshes saved UI data after a verified change", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: "current", changed: 1 }));
  vi.stubGlobal("fetch", fetch); const { invalidate } = view();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Linked opportunities checked"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/prospects/7/opportunities/refresh", { method: "POST" });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["prospect", 7] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["prospects"] });
});
it("does not check local-only opportunities or while editing", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const first = view({ hasLinkedOpportunities: false }); expect(screen.queryByRole("button")).not.toBeInTheDocument(); first.unmount();
  view({ editing: true }); expect(screen.getByRole("button")).toBeDisabled(); expect(fetch).not.toHaveBeenCalled();
});
it("reloads saved details when another request already refreshed NXT", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "current", total: 1, changed: 0, checked: 0 })));
  const { invalidate } = view();
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["prospect", 7] }));
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["prospects"] });
});
it("offers an explicit read-only retry and prevents double-clicks", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ status: "unavailable", changed: 0 }))
    .mockImplementationOnce(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch); const { invalidate } = view();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved details shown"));
  fireEvent.click(screen.getByRole("button", { name: "Check NXT updates" }));
  expect(fetch).toHaveBeenLastCalledWith("/api/prospects/7/opportunities/refresh?force=1", { method: "POST" });
  expect(screen.getByRole("button")).toBeDisabled(); expect(invalidate).not.toHaveBeenCalled();
});
it("does not report unavailable or deferred results as current", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "deferred", changed: 0 })));
  view(); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Some checks are waiting"));
  expect(screen.getByRole("status")).not.toHaveTextContent("opportunities checked");
});
it("does not invalidate another prospect when a request resolves after unmount", async () => {
  let finish;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
  const { unmount, invalidate } = view(); unmount();
  finish(Response.json({ status: "current", changed: 1 }));
  await Promise.resolve(); await Promise.resolve();
  expect(invalidate).not.toHaveBeenCalled();
});
