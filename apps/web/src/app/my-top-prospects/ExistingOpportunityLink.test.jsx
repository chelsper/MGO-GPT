import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExistingOpportunityLink from "./ExistingOpportunityLink";
const row = { id: "900", title: "Fictional Memorial Scholarship", current_stage: "Solicitation", estimated_amount: 25000, expected_date: null, linkState: "available" };
function view(props = {}) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  return { ...render(<QueryClientProvider client={client}><ExistingOpportunityLink prospectId={7} scope="1:44" {...props} /></QueryClientProvider>), invalidate };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function open() { fireEvent.click(screen.getByRole("button", { name: "Link existing NXT opportunity" })); await screen.findByRole("radio"); }
it("loads only on request, explains undated records, and requires explicit selection", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ opportunities: [row] })); vi.stubGlobal("fetch", fetch);
  view(); expect(fetch).not.toHaveBeenCalled(); await open();
  expect(fetch).toHaveBeenCalledWith("/api/prospects/7/opportunities/link-existing?scope=1%3A44", { cache: "no-store" });
  expect(screen.getByText(/Expected date needed/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Link selected opportunity" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio")); expect(screen.getByRole("button", { name: "Link selected opportunity" })).toBeEnabled();
});
it("links only the selected ID, invalidates views, and returns to the same prospect", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ opportunities: [row] }))
    .mockResolvedValueOnce(Response.json({ opportunityId: 91, expectedDateNeeded: true }));
  vi.stubGlobal("fetch", fetch); const { invalidate } = view(); await open(); fireEvent.click(screen.getByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: "Link selected opportunity" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Opportunity linked. NXT was not changed."));
  expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ scope: "1:44", opportunityId: "900" }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["prospects"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["opportunity-pipeline"] });
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
it("cancels locally without saving and restores focus", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ opportunities: [row] })); vi.stubGlobal("fetch", fetch);
  view(); await open(); fireEvent.click(screen.getByRole("radio")); fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Link existing NXT opportunity" })).toHaveFocus();
});
it.each(["linked", "elsewhere"])("does not offer duplicate links: %s", async linkState => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ opportunities: [{ ...row, linkState }] })));
  view(); await open(); expect(screen.getByRole("radio")).toBeDisabled();
});
it("prevents double submission and offers reload after an uncertain save", async () => {
  let finish;
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ opportunities: [row] })).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch); view(); await open(); fireEvent.click(screen.getByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: "Link selected opportunity" }));
  expect(screen.getByRole("button", { name: "Linking..." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  finish(Response.json({ error: "Reload the list before retrying." }, { status: 503 }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Reload the list");
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reload NXT list" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("disables linking during an edit", () => {
  vi.stubGlobal("fetch", vi.fn()); view({ disabled: true });
  expect(screen.getByRole("button")).toBeDisabled(); expect(fetch).not.toHaveBeenCalled();
});
