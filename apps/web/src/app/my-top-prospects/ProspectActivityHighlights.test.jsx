import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProspectActivityHighlights from "./ProspectActivityHighlights";
function view(activity, updates = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["prospect-recent-activity", 1], activity);
  render(<QueryClientProvider client={client}><ProspectActivityHighlights prospectId={1} linked updates={updates} /></QueryClientProvider>);
}
afterEach(cleanup);
it("retains last good highlights and clearly marks failed refreshes", () => {
  view({ action: { data: { id: "a", date: "2026-08-01", summary: "Earlier meeting" }, stale: true, fetchedAt: "2026-08-02" }, gift: { data: null, unavailable: true, stale: true } });
  expect(screen.getByText("Earlier meeting")).toBeInTheDocument();
  expect(screen.getByText(/Showing the last successful snapshot/)).toBeInTheDocument();
  expect(screen.getByText(/not confirmation of no activity/)).toBeInTheDocument();
  expect(screen.queryByText("No latest gift returned by NXT.")).not.toBeInTheDocument();
});
it("shows a more recent locally logged action immediately without waiting for the cache", () => {
  view({ action: { data: { id: "a", date: "2026-08-01", summary: "Earlier meeting" } }, gift: { data: null } }, [
    { id: 2, update_title: "Newer call", action_category: "Phone Call", update_date: "2026-08-02" },
  ]);
  expect(screen.getByText("Newer call")).toBeInTheDocument();
  expect(screen.queryByText("Earlier meeting")).not.toBeInTheDocument();
});
