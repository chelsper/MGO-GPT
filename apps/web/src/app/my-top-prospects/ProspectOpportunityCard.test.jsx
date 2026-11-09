import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProspectOpportunityCard from "./ProspectOpportunityCard";
const props = { opportunity: { id: 40, title: "Future scholarship", opportunity_status: "Cultivation", estimated_amount: 10000 },
  renderRollover: () => null, renderStewardshipOpportunitySection: () => null,
  stewardshipScope: { viewerId: "2", workspaceId: "7", constituentId: "100" } };
let client;
beforeEach(() => {
  sessionStorage.clear(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ viewerId: "2", workspaceId: "7", context: { constituentId: "100", constituentName: "Fictional Donor", opportunityId: "40", opportunityTitle: "Future scholarship" }, contextVersion: "a".repeat(32), request: null, giftChoices: [] }) })));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
const mount = overrides => render(<QueryClientProvider client={client}><ProspectOpportunityCard {...props} {...overrides} /></QueryClientProvider>);
it("labels an undated open opportunity without requiring a guessed fiscal year", () => {
  mount({ opportunity: { ...props.opportunity, opportunity_status: "Active" } });
  expect(screen.getByText(/Expected date needed/)).toBeVisible();
});
it("requests assistance before funding and restores focus to the originating opportunity on cancel", async () => {
  mount(); const trigger = screen.getByRole("button", { name: "Request stewardship assistance" }); fireEvent.click(trigger);
  await screen.findByLabelText("What would you like help with?");
  expect(fetch.mock.calls[0][0]).toContain("constituentId=100&opportunityId=40");
  fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(trigger).toHaveFocus();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it.each([{ readOnly: true }, { stewardshipScope: null }, { stewardshipScope: { ...props.stewardshipScope, constituentId: null } }])("does not offer a write from read-only or unlinked context %o", overrides => {
  mount(overrides); expect(screen.queryByRole("button", { name: "Request stewardship assistance" })).toBeNull(); expect(fetch).not.toHaveBeenCalled();
});
