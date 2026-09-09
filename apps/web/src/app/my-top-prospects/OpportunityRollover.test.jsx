import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OpportunityRollover from "./OpportunityRollover";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
const opportunity = { id: 9, current_stage: "Solicitation", expected_date: "2020-06-30", blackbaud_opportunity_id: "90" };
function view(props = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><OpportunityRollover opportunity={opportunity} onUpdated={vi.fn()} {...props} /></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("requires confirmation before any write and sends the confirmed original date", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ expectedDate: getStandingsPeriods().fiscalYear.endsOn }));
  vi.stubGlobal("fetch", fetch); const updated = vi.fn(); view({ onUpdated: updated });
  fireEvent.click(screen.getByRole("button", { name: /Update to FY/ }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("group")).toHaveTextContent("amount, stage, and ask date will not change");
  fireEvent.click(screen.getByRole("button", { name: "Confirm update in app and NXT" }));
  await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ confirmed: true, expectedDate: "2020-06-30", fiscalYear: getStandingsPeriods().fiscalYear.label });
});
it("cancels without changing either system", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); view();
  fireEvent.click(screen.getByRole("button", { name: /Update to FY/ }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("group")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("shows the error and leaves confirmation available after a failed save", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Reload and review before retrying." }, { status: 409 })));
  const updated = vi.fn(); view({ onUpdated: updated });
  fireEvent.click(screen.getByRole("button", { name: /Update to FY/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm update in app and NXT" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Reload and review");
  expect(updated).not.toHaveBeenCalled();
});
it("is absent in read-only workspaces", () => {
  view({ readOnly: true }); expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("does not offer a dual-system update for local-only opportunities", () => {
  view({ opportunity: { ...opportunity, blackbaud_opportunity_id: null } });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
