import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProspectDetailModal } from "./page";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
const now = new Date().toISOString();
const clientOptions = { defaultOptions: { queries: { retry: false, staleTime: Infinity } } };
function renderDetail(readOnly = false) {
  const client = new QueryClient(clientOptions);
  client.setQueryData(["prospect", 1], {
    prospect: { id: 1, prospect_name: "Test Prospect", status: "Active", blackbaud_constituent_id: "100" },
    opportunities: [
      { id: 1, title: "Active campaign", current_stage: "Cultivation", opportunity_status: "Active", estimated_amount: 25000, expected_date: "2020-06-30", updated_at: now, blackbaud_opportunity_id: "1" },
      { id: 2, title: "Funded campaign", current_stage: "Funded", opportunity_status: "Closed - Gift Secured", closed_amount: 1000, close_date: getStandingsPeriods().asOf, updated_at: now },
      { id: 3, title: "Withdrawn campaign", current_stage: "Withdrawn", close_date: "2020-01-01", updated_at: now },
    ],
    updates: [{ id: 1, update_title: "Follow-up call", action_category: "Phone Call", update_date: "2026-08-01" }],
  });
  client.setQueryData(["blackbaud-summary", "100"], { mapped: {} });
  client.setQueryData(["mgo-users-for-discussion"], []);
  client.setQueryData(["prospect-recent-activity", 1], {
    linked: true, action: { data: { id: "a", summary: "NXT meeting", date: "2026-09-01" }, fetchedAt: now },
    gift: { data: { id: "g", date: "2026-08-02", amount: 50, type: "Cash", funds: ["Scholarship"] }, fetchedAt: now },
  });
  return render(<QueryClientProvider client={client}><ProspectDetailModal prospectId={1} readOnly={readOnly} onClose={vi.fn()} /></QueryClientProvider>);
}
afterEach(cleanup);
it("renders opportunities once, with recent closed history below real activity", () => {
  renderDetail();
  expect(screen.getAllByText("Active campaign")).toHaveLength(1);
  expect(screen.getAllByText("Funded campaign")).toHaveLength(1);
  expect(screen.getByText("Active Opportunities (1)")).toBeInTheDocument();
  expect(screen.getByText("Activity log (1)")).toBeInTheDocument();
  const history = screen.getByRole("region", { name: "Closed opportunity history" });
  expect(within(history).getByText("Funded campaign")).toBeInTheDocument();
  expect(screen.getByText("Older or undated closed history (1)").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("Recent Actions & Activity").compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("NXT meeting")).toBeInTheDocument();
  expect(screen.getByText("$50.00")).toBeInTheDocument();
  expect(screen.getByText("Scholarship")).toBeInTheDocument();
});
it("retains opportunity editing but removes mutation controls in read-only mode", () => {
  renderDetail(true);
  expect(screen.queryByRole("button", { name: "Edit Opportunity" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Update to FY/ })).not.toBeInTheDocument();
});
