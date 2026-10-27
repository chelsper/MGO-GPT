import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
const state = vi.hoisted(() => ({ profile: null, data: {}, queryErrors: {}, queryLoading: {}, exportProps: null }));
vi.mock("@/components/ProspectExport", () => ({ default: (props) => { state.exportProps = props; return null; } }));
vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: { id: 2 }, loading: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }) => ({
    data:
      queryKey[0] === "profile-sync-status"
        ? state.profile
        : state.data[queryKey[0]],
    isLoading: Boolean(state.queryLoading[queryKey[0]]),
    isFetching: false,
    error: state.queryErrors[queryKey[0]],
    refetch: vi.fn(),
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));
import MyProspects from "./page";
import { WorkspaceTerminologyProvider } from "@/components/WorkspaceTerminology";
import { PORTFOLIO_SORT_OPTIONS, portfolioViewKey } from "@/utils/portfolioWorklist";

beforeEach(() => {
  localStorage.clear();
  state.queryErrors = {};
  state.queryLoading = {};
  state.profile = {
    user: { id: 2, role: "admin", name: "Admin Author" },
    workspaceUser: {
      id: 44,
      role: "mgo",
      name: "Selected MGO",
      blackbaud_constituent_id: "400",
      blackbaud_portfolio_seeded_at: "2026-09-15",
    },
    actingAsUser: { id: 44, role: "mgo", name: "Selected MGO" },
  };
  state.data = {
    "prospect-pledge-status": {
      byConstituentId: { 100: { count: 2, verifiedAt: "2026-09-15T13:00:00Z", stale: false,
        totalCents: 2500000, balanceCents: 1200000, overdueCents: 250000,
        nextPaymentDueDate: "2026-12-01", asOf: "2026-09-15" } },
    },
    prospects: [
      {
        id: 1,
        status: "Active",
        prospect_name: "Zelda Donor",
        blackbaud_constituent_id: "100",
        priority_order: 1,
        portfolio_open_opportunity_count: 2,
        portfolio_open_pipeline_amount: 35000,
        next_action_text: "Call about proposal",
        next_action_due_date: "2026-09-30",
      },
    ],
    "blackbaud-portfolio": {
      leadSolicitor: [
        {
          constituentId: "100",
          name: "Zelda Donor",
          lookupId: "500",
          assignmentTypes: ["Lead Solicitor"],
        },
      ],
      supportingSolicitor: [{ constituentId: "101", name: "Amy Donor" }],
      summary: {},
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mapped: { lifetimeGiving: { totalGiving: 1200 } },
      }),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("includes the shared originator control in My Portfolio without automatic NXT attribution reads", () => {
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  expect(screen.getAllByRole("button", { name: "Relationship originator" }).length).toBeGreaterThan(0);
  expect(fetch.mock.calls.some(([url]) => String(url).includes("relationship-originator"))).toBe(false);
});

it("does not expose originator writes while an executive views another MGO's portfolio", () => {
  state.profile.user.role = "executive";
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  expect(screen.queryByRole("button", { name: "Relationship originator" })).toBeNull();
});

it("uses configured portfolio labels without renaming NXT roles or adding requests", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  state.data["portfolio-categories"] = { categories: [], assignments: [] };
  render(<WorkspaceTerminologyProvider terminology={{ mgo: "Gift Officer" }}><MyProspects /></WorkspaceTerminologyProvider>);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByText("Current NXT Gift Officer assignments")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Organize by"), { target: { value: "solicitor" } });
  expect(screen.getAllByText("Lead Solicitor").some(node => node.tagName !== "OPTION")).toBe(true);
  expect(screen.getAllByText("Secondary / Athletics Solicitor").some(node => node.tagName !== "OPTION")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  fireEvent.click(screen.getByRole("button", { name: "More actions for Zelda Donor" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove me as Gift Officer" }));
  expect(window.confirm).toHaveBeenCalledWith("Remove yourself as Gift Officer for Zelda Donor? This will change your active NXT assignment to Former Solicitor and set today's date as the end date.");
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

it("returns from prospect details to the same filtered Top Prospects list and workspace", () => {
  window.history.replaceState({}, "", "/my-top-prospects");
  state.data.prospect = { prospect: state.data.prospects[0] };
  render(<MyProspects />);
  const search = screen.getByPlaceholderText("Search by prospect, ask type, or next action");
  fireEvent.change(search, { target: { value: "Zelda" } });
  fireEvent.click(screen.getByRole("button", { name: "View Prospect" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to Top Prospects" }));
  expect(search).toHaveValue("Zelda");
  expect(screen.getByRole("button", { name: "View Prospect" })).toBeVisible();
  expect(screen.getByText("Editing Selected MGO's workspace")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

function addClosedProspects() {
  state.data.prospects.push(
    { id: 2, status: "Closed – Gift Secured", prospect_name: "Closed Secured", expected_close_fy: "FY24", ask_type: "Scholarship", next_action_text: "Send thanks", next_action_due_date: "2027-06-30" },
    { id: 3, status: "Closed – Declined", prospect_name: "Closed Declined", expected_close_fy: "FY26", ask_type: "Major Gift" },
  );
}

it("filters closed and active Top Prospects consistently using only loaded records", () => {
  addClosedProspects();
  render(<MyProspects />);
  expect(screen.getByText("Showing 3 of 3 prospects (1 active)")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Prospect status" }), { target: { value: "Closed – Gift Secured" } });
  expect(screen.getByRole("button", { name: "View closed prospect Closed Secured" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "View closed prospect Closed Declined" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "View Prospect" })).not.toBeInTheDocument();
  expect(state.exportProps.prospectIds).toEqual([]);
  expect(screen.queryByText("No prospects match these filters")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search Top Prospects" }), { target: { value: "not found" } });
  expect(screen.queryByRole("button", { name: "View closed prospect Closed Secured" })).not.toBeInTheDocument();
  expect(screen.getByText("No prospects match these filters")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Show all prospects" }));
  expect(screen.getByText("Showing 3 of 3 prospects (1 active)")).toBeVisible();
  expect(screen.getByRole("button", { name: "View Prospect" })).toBeVisible();
  expect(state.exportProps.prospectIds).toEqual([1]);
  expect(fetch).not.toHaveBeenCalled();
});

it("uses saved close years for closed prospects and preserves unrelated context when clearing filters", () => {
  addClosedProspects();
  window.history.replaceState({}, "", "/my-top-prospects?search=Closed&statusFilter=all&fyFilter=FY24&actionFilter=due&keep=context#list");
  render(<MyProspects />);
  expect(screen.getByRole("combobox", { name: "Filter by fiscal year" })).toHaveValue("FY24");
  expect(screen.getByRole("combobox", { name: "Next-step status" })).toHaveValue("due");
  expect(screen.getByRole("option", { name: "Next step has a due date" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View closed prospect Closed Secured" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "View closed prospect Closed Declined" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(window.location.search + window.location.hash).toBe("?keep=context#list");
  expect(screen.getByRole("combobox", { name: "Filter by fiscal year" })).toHaveValue("all");
  expect(screen.getByRole("combobox", { name: "Next-step status" })).toHaveValue("all");
  expect(screen.getByRole("searchbox", { name: "Search Top Prospects" })).toHaveValue("");
  expect(screen.getByText("Editing Selected MGO's workspace")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["Enter", " "])("opens a closed prospect with the %s key without a new fetch", key => {
  addClosedProspects();
  state.data.prospect = { prospect: state.data.prospects[1] };
  render(<MyProspects />);
  const closed = screen.getByRole("button", { name: "View closed prospect Closed Secured" });
  expect(closed).toHaveAttribute("tabindex", "0");
  fireEvent.keyDown(closed, { key });
  expect(screen.getByRole("button", { name: "Back to Top Prospects" })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not describe an empty read-only workspace as a filter failure or prompt editing", () => {
  state.profile.user.role = "executive";
  state.data.prospects = [];
  render(<MyProspects />);
  expect(screen.getByText("No Top Prospects yet")).toBeVisible();
  expect(screen.getByText("This workspace has no active or closed Top Prospects to show.")).toBeVisible();
  expect(screen.queryByText(/Choose Add Prospect above/)).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("labels filters and limits the pinned prospect header to desktop without adding requests", () => {
  const { container } = render(<MyProspects />);
  expect(container.querySelector("header")).toHaveClass("lg:sticky", "lg:top-0");
  expect(container.querySelector("header").style.position).toBe("");
  for (const name of ["Prospect status", "Filter by fiscal year", "Next-step status"]) {
    expect(screen.getByRole("combobox", { name })).toHaveClass("min-h-11", "min-w-0");
  }
  expect(screen.getByRole("searchbox", { name: "Search Top Prospects" })).toHaveClass("min-h-11");
  expect(fetch).not.toHaveBeenCalled();
});

it("closes a portfolio detail deep link in place without clearing other URL context", () => {
  window.history.replaceState({}, "", "/my-top-prospects?tab=portfolio&prospectId=1&panel=next-step&search=Zelda#portfolio");
  state.data.prospect = { prospect: state.data.prospects[0] };
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "Back to My Portfolio" }));
  expect(window.location.pathname + window.location.search + window.location.hash).toBe("/my-top-prospects?tab=portfolio&search=Zelda#portfolio");
  expect(screen.getByRole("searchbox", { name: "Search portfolio" })).toBeVisible();
  expect(screen.getByText("Editing Selected MGO's workspace")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps healthy background progress compact on the page but exposes status-query failures", () => {
  state.data["portfolio-refresh-job"] = {
    inventory: { total: 2, current: 2, stale: 0, failed: 0, freshness: { givingUpdatedAt: "2026-10-01T12:00:00Z", delayed: 0, missing: 0 } },
    job: { jobId: "40", workspaceUserId: 44, mode: "nightly", status: "queued",
      totalCount: 2, processedCount: 1, successCount: 1, failedCount: 0,
      updatedAt: new Date().toISOString() },
  };
  const { rerender } = render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByText("Giving last updated Oct 1, 2026")).toBeVisible();
  expect(screen.queryByText("Background portfolio maintenance")).not.toBeInTheDocument();
  state.queryErrors["portfolio-refresh-job"] = new Error("Failed to load portfolio refresh progress");
  rerender(<MyProspects />);
  expect(screen.queryByText("Background portfolio maintenance")).not.toBeInTheDocument();
  expect(screen.getByText("Update status is unavailable. Saved portfolio details are still shown.")).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps cooldown details and controls in Integration Health, not the portfolio worklist", () => {
  state.data["portfolio-refresh-job"] = {
    inventory: { total: 2, current: 2, stale: 0, failed: 0, freshness: { givingUpdatedAt: "2026-10-01T12:00:00Z", delayed: 0, missing: 0 } },
    job: { jobId: "41", workspaceUserId: 44, mode: "nightly", status: "paused",
      totalCount: 2, processedCount: 1, successCount: 1, failedCount: 0,
      updatedAt: new Date().toISOString(), pausedUntil: new Date(Date.now() + 60000).toISOString() },
  };
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByText("Giving last updated Oct 1, 2026")).toBeVisible();
  expect(screen.queryByText("Background portfolio maintenance")).not.toBeInTheDocument();
  expect(screen.queryByText(/This refresh will continue automatically/)).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search portfolio" })).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.queryByText("Refresh details")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Waiting for Blackbaud" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Integration Health" })).toHaveAttribute("href", "/integration-health#health-portfolios");
  expect(fetch).not.toHaveBeenCalled();
});

it("shows saved contacts and their checked date immediately without requests", () => {
  Object.assign(state.data["blackbaud-portfolio"].leadSolicitor[0], {
    email: "saved@example.com", phone: "904-555-0199", address: "100 Saved Street",
    contactDataSource: "nxt-portfolio-snapshot", contactCheckedAt: "2026-09-15T12:00:00Z",
  });
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  expect(screen.getByText("saved@example.com · 904-555-0199")).toBeVisible();
  expect(screen.getByText("100 Saved Street")).toBeVisible();
  expect(screen.getByText("Saved contact details · Checked September 15, 2026")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("checks only visible expanded contacts on the actual page without loading summaries", async () => {
  let intersect;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback) { intersect = callback; }
    observe() {} disconnect() {}
  });
  fetch.mockResolvedValue({ ok: true, json: async () => ({ status: "updated", contacts: {
    email: "checked@example.com", phone: null, address: null, contactCheckedAt: new Date().toISOString(),
  } }) });
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  act(() => intersect([{ isIntersecting: true }]));
  await waitFor(() => expect(screen.getByText("checked@example.com")).toBeVisible());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/blackbaud/constituents/100/portfolio-contact?viewer_id=2&workspace_id=44");
  expect(screen.queryByText("Saved summary narrative")).not.toBeInTheDocument();
});

it("uses saved activity dates in collapsed rows without additional fetches or changing order", () => {
  state.data["blackbaud-portfolio"].leadSolicitor[0].savedActivity = {
    gift: { date: "2026-08-31", checkedAt: "2026-09-14T12:00:00Z", amount: 1250.75 },
    action: { date: "2026-09-10", checkedAt: "2026-09-14T12:00:00Z", summary: "Called about scholarship" },
  };
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByText("Last gift (saved)")).toBeVisible();
  expect(screen.getByText("Aug 31, 2026")).toBeVisible();
  expect(screen.getByText("Last action (saved)")).toBeVisible();
  expect(screen.getByText("Sep 10, 2026")).toBeVisible();
  expect(screen.getByText("$1,250.75")).toBeVisible();
  expect(screen.getByText("Called about scholarship")).toBeVisible();
  const amy = within(screen.getAllByRole("article")[1]);
  expect(amy.queryByText(/Opportunity data unavailable|No saved next step|Last gift|Last action/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  expect(screen.getAllByText("$1,250.75")).toHaveLength(2);
  expect(screen.getAllByText("Called about scholarship")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("View"), { target: { value: "detailed" } });
  expect(screen.getByText("Last gift (saved)")).toBeVisible();
  expect(screen.getByText("Aug 31, 2026")).toBeVisible();
  expect(screen.getByText("Last action (saved)")).toBeVisible();
  expect(screen.getByText("Sep 10, 2026")).toBeVisible();
  expect(screen.getByText("$1,250.75")).toBeVisible();
  expect(screen.getByText("Called about scholarship")).toBeVisible();
  fireEvent.change(screen.getByLabelText("View"), { target: { value: "focus" } });
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "name" } });
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Amy Donor");
  expect(state.data.prospects[0].priority_order).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("distinguishes saved empty contacts from contacts that have never loaded", () => {
  Object.assign(state.data["blackbaud-portfolio"].leadSolicitor[0], {
    email: null, phone: null, address: null, contactDataSource: "nxt-summary-cache",
  });
  state.data["blackbaud-portfolio"].supportingSolicitor[0].contactDataSource = "not-loaded";
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.change(screen.getByLabelText("View"), { target: { value: "detailed" } });
  expect(screen.getByText("No contact details available")).toBeVisible();
  expect(screen.getByText("Contact details have not been loaded yet")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not show a missing-contact message when a saved address is available", () => {
  Object.assign(state.data["blackbaud-portfolio"].leadSolicitor[0], {
    email: null, phone: null, address: "100 Saved Street", contactDataSource: "nxt-summary-cache",
  });
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  expect(screen.getByText("100 Saved Street")).toBeVisible();
  expect(within(screen.getAllByRole("article")[0]).queryByText("No contact details available")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps loaded contacts visible while an explicit summary refresh is pending and after failure", async () => {
  let finishRefresh;
  const refresh = new Promise((resolve) => { finishRefresh = resolve; });
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      mapped: { constituent: { email: "loaded@example.com", phone: "904-555-0199", address: "100 Loaded Street" }, lifetimeGiving: { totalGiving: 100 } },
      summaryRefreshedAt: "2026-09-15T12:00:00Z",
    }),
  }).mockImplementationOnce(() => refresh);
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  fireEvent.click(screen.getByRole("button", { name: "Donor briefing" }));
  await waitFor(() => expect(screen.getByText("loaded@example.com · 904-555-0199")).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "Refresh this summary" }));
  expect(screen.getByText("Loading background details...")).toBeVisible();
  expect(screen.getByText("Recorded lifetime giving is $100.00.")).toBeVisible();
  expect(screen.getByText("loaded@example.com · 904-555-0199")).toBeVisible();
  expect(screen.getByText("100 Loaded Street")).toBeVisible();
  finishRefresh({ ok: false, json: async () => ({ error: "NXT temporarily unavailable" }) });
  await waitFor(() => expect(screen.getByText("NXT temporarily unavailable")).toBeVisible());
  expect(screen.getByText("Recorded lifetime giving is $100.00.")).toBeVisible();
  expect(screen.getByText("loaded@example.com · 904-555-0199")).toBeVisible();
  expect(screen.getByText("100 Loaded Street")).toBeVisible();
  expect(screen.getByText("Saved contact details · Checked September 15, 2026")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not restore old card contacts when a newer saved summary has empty fields", async () => {
  Object.assign(state.data["blackbaud-portfolio"].leadSolicitor[0], {
    email: "old@example.com", phone: "904-555-0100", address: "100 Old Street",
    contactDataSource: "nxt-summary-cache", contactCheckedAt: "2026-09-14T12:00:00Z",
  });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
    mapped: { constituent: { email: null, phone: null, address: null } },
    summaryRefreshedAt: "2026-09-15T12:00:00Z",
  }) });
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  fireEvent.click(screen.getByRole("button", { name: "Donor briefing" }));
  await waitFor(() => expect(within(screen.getAllByRole("article")[0]).getByText("No contact details available")).toBeVisible());
  expect(screen.queryByText("old@example.com · 904-555-0100")).not.toBeInTheDocument();
  expect(screen.queryByText("100 Old Street")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("shows saved pledge presence only inside expanded or detailed portfolio cards", () => {
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.queryByRole("complementary", { name: "Saved pledge status" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  expect(screen.getByRole("complementary", { name: "Saved pledge status" })).toHaveTextContent("Active pledge (2 pledges)");
  expect(screen.getByRole("complementary", { name: "Saved pledge status" })).toHaveTextContent("Total pledged$25,000.00");
  expect(screen.getByRole("complementary", { name: "Saved pledge status" })).toHaveTextContent("Balance due$12,000.00");
  expect(screen.getByRole("complementary", { name: "Saved pledge status" })).toHaveTextContent("Next payment dueDec 1, 2026");
  expect(screen.getByRole("complementary", { name: "Saved pledge status" })).toHaveTextContent("Overdue amount$2,500.00");
  fireEvent.click(screen.getByRole("button", { name: "Hide details for Zelda Donor" }));
  expect(screen.queryByRole("complementary", { name: "Saved pledge status" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("View"), { target: { value: "detailed" } });
  expect(screen.getAllByRole("complementary", { name: "Saved pledge status" })).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("expands the actual portfolio card without fetching; briefing reads are explicit and saved-only", async () => {
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  const card = within(screen.getAllByRole("article")[0]);
  expect(card.getByText("2 saved open opportunities")).toBeVisible();
  expect(card.getByText("Call about proposal")).toBeVisible();
  expect(
    card.getByRole("link", { name: "Log action" }),
  ).toBeVisible();
  fireEvent.click(
    card.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(card.getByRole("link", { name: "Log action" })).toHaveAttribute(
    "href",
    expect.stringContaining("blackbaudConstituentId=100"),
  );
  expect(card.getByRole("button", { name: "Set next step" })).toBeEnabled();
  expect(card.getByRole("link", { name: "Open NXT profile" })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(card.getByRole("button", { name: "Donor briefing" }));
  await waitFor(() =>
    expect(card.getByText("Recorded lifetime giving is $1,200.00.")).toBeVisible(),
  );
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "/api/blackbaud/constituents/100/summary?saved_only=1",
  );
  fireEvent.click(
    card.getByRole("button", { name: "Hide details for Zelda Donor" }),
  );
  fireEvent.click(
    card.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  fireEvent.change(screen.getByLabelText("Sort by"), {
    target: { value: "name" },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(state.data.prospects[0].priority_order).toBe(1);
});

it("preserves loaded summaries and existing actions when Focus switches cards", async () => {
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.change(screen.getByLabelText("View"), {
    target: { value: "focus" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(screen.getAllByRole("button", { name: "Set next step" })).toHaveLength(2);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Donor briefing" }));
  await waitFor(() =>
    expect(screen.getByText("Recorded lifetime giving is $1,200.00.")).toBeVisible(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Amy Donor" }),
  );
  expect(screen.getByText("Recorded lifetime giving is $1,200.00.")).not.toBeVisible();
  expect(within(screen.getByRole("button", { name: "Hide details for Amy Donor" }).closest("article")).getByRole("link", { name: "Log action" })).toHaveAttribute(
    "href",
    expect.stringContaining("blackbaudConstituentId=101"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(screen.getByText("Recorded lifetime giving is $1,200.00.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Collapse details" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(screen.getByText("Recorded lifetime giving is $1,200.00.")).toBeVisible();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "/api/blackbaud/constituents/100/summary?saved_only=1",
  );
  expect(state.data.prospects[0].priority_order).toBe(1);
});

it("does not carry a loaded tier summary into another workspace", async () => {
  const { rerender } = render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  fireEvent.click(screen.getByRole("button", { name: "Donor briefing" }));
  await screen.findByText("Recorded lifetime giving is $1,200.00.");
  state.profile = {
    ...state.profile,
    workspaceUser: { ...state.profile.workspaceUser, id: 45, name: "Another MGO" },
    actingAsUser: { ...state.profile.actingAsUser, id: 45, name: "Another MGO" },
  };
  rerender(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  expect(screen.queryByText("Recorded lifetime giving is $1,200.00.")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
    mapped: { lifetimeGiving: { totalGiving: 1500 } },
  }) });
  fireEvent.click(screen.getByRole("button", { name: "Donor briefing" }));
  await screen.findByText("Recorded lifetime giving is $1,500.00.");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("filters actual category and solicitor groups without writes, fetching or rank changes", () => {
  state.data["portfolio-categories"] = {
    categories: [{ id: 9, name: "Planned giving", sort_order: 0 }],
    assignments: [{ blackbaud_constituent_id: "100", category_id: 9 }],
  };
  Object.assign(state.data["blackbaud-portfolio"].leadSolicitor[0], { address: "100 Fictional Street", addressCity: "Jacksonville", addressState: "FL" });
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByLabelText("Portfolio category: Planned giving")).toBeVisible();
  expect(screen.getByText("Jacksonville, FL")).toBeVisible();
  expect(screen.getByText("100 Fictional Street")).not.toBeVisible();
  fireEvent.change(screen.getByLabelText("View"), {
    target: { value: "focus" },
  });
  fireEvent.change(screen.getByLabelText("Organize by"), {
    target: { value: "category" },
  });
  fireEvent.change(screen.getByLabelText("Show group"), {
    target: { value: "category-9" },
  });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Zelda Donor");
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(screen.getByRole("button", { name: "Set next step" })).toBeEnabled();
  expect(
    screen.getByRole("combobox", {
      name: "Move Zelda Donor to portfolio category",
    }),
  ).toHaveValue("9");
  fireEvent.change(screen.getByLabelText("Organize by"), {
    target: { value: "solicitor" },
  });
  expect(screen.getByLabelText("Show group")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Show group"), {
    target: { value: "supporting" },
  });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Amy Donor");
  expect(screen.getByLabelText("View")).toHaveValue("focus");
  expect(fetch).not.toHaveBeenCalled();
  expect(state.data.prospects[0].priority_order).toBe(1);
  expect(state.data["portfolio-categories"].assignments[0].category_id).toBe(9);
});

it("restores the selected category after leaving My Portfolio and reloading the page", () => {
  state.data["portfolio-categories"] = {
    categories: [{ id: 9, name: "Planned giving", sort_order: 0 }],
    assignments: [{ blackbaud_constituent_id: "100", category_id: 9 }],
  };
  const { unmount } = render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.change(screen.getByLabelText("Organize by"), { target: { value: "category" } });
  fireEvent.change(screen.getByLabelText("Show group"), { target: { value: "category-9" } });
  fireEvent.click(screen.getByRole("button", { name: "Top Prospects" }));
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByLabelText("Show group")).toHaveValue("category-9");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Zelda Donor");
  unmount();
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByLabelText("Organize by")).toHaveValue("category");
  expect(screen.getByLabelText("Show group")).toHaveValue("category-9");
  expect(JSON.parse(localStorage.getItem(portfolioViewKey(2, 44))).selectedGroup).toBe("category-9");
  expect(fetch).not.toHaveBeenCalled();
  expect(state.data["portfolio-categories"].assignments[0].category_id).toBe(9);
});

it("loads each MGO's last view without overwriting it during profile or category loading", () => {
  const firstProfile = state.profile;
  localStorage.setItem(portfolioViewKey(2, 44), JSON.stringify({ group: "category", selectedGroup: "category-9" }));
  localStorage.setItem(portfolioViewKey(2, 45), JSON.stringify({ group: "solicitor", selectedGroup: "supporting" }));
  state.profile = null;
  const { rerender } = render(<MyProspects />);
  state.profile = firstProfile;
  state.queryLoading["portfolio-categories"] = true;
  rerender(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading saved categories");
  expect(screen.queryByText(/no longer available/)).not.toBeInTheDocument();
  state.data["portfolio-categories"] = {
    categories: [{ id: 9, name: "Planned giving", sort_order: 0 }],
    assignments: [{ blackbaud_constituent_id: "100", category_id: 9 }],
  };
  state.queryLoading["portfolio-categories"] = false;
  rerender(<MyProspects />);
  expect(screen.getByLabelText("Show group")).toHaveValue("category-9");
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Zelda Donor");
  state.profile = { ...firstProfile, workspaceUser: { ...firstProfile.workspaceUser, id: 45 } };
  rerender(<MyProspects />);
  expect(screen.getByLabelText("Organize by")).toHaveValue("solicitor");
  expect(screen.getByLabelText("Show group")).toHaveValue("supporting");
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Amy Donor");
  state.profile = firstProfile;
  rerender(<MyProspects />);
  expect(screen.getByLabelText("Show group")).toHaveValue("category-9");
  expect(JSON.parse(localStorage.getItem(portfolioViewKey(2, 45))).selectedGroup).toBe("supporting");
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["compact", "focus", "detailed"])(
  "preserves read-only protection inside %s cards",
  (density) => {
    state.profile.user.role = "executive";
    render(<MyProspects />);
    fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: density },
    });
    expect(screen.queryByRole("button", { name: /More actions for/ })).not.toBeInTheDocument();
    if (density !== "detailed") fireEvent.click(
      screen.getByRole("button", { name: "Show details for Zelda Donor" }),
    );
    expect(
      screen.queryByRole("link", { name: "Log action" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set next step" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Open NXT profile" })[0],
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(["compact", "focus", "detailed"])("keeps a single action bar and the original follow-up dialogs in %s view", density => {
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.change(screen.getByLabelText("View"), { target: { value: density } });
  const card = within(screen.getByRole("group", { name: "Actions for Zelda Donor" }));
  expect(card.getAllByRole("button", { name: "Set next step" })).toHaveLength(1);
  expect(card.getAllByRole("link", { name: "Log action" })).toHaveLength(1);
  fireEvent.click(card.getByRole("button", { name: "Set next step" }));
  const nextStep = screen.getByRole("dialog", { name: "Set next step" });
  expect(nextStep).toHaveTextContent("Zelda Donor");
  fireEvent.click(within(nextStep).getByRole("button", { name: "Close" }));
  fireEvent.click(card.getByRole("button", { name: "More actions for Zelda Donor" }));
  const opportunity = new URL(card.getByRole("link", { name: "Add opportunity" }).href);
  expect(opportunity.searchParams.get("blackbaudConstituentId")).toBe("100");
  expect(opportunity.searchParams.get("lookupId")).toBe("500");
  expect(opportunity.searchParams.get("returnTo")).toBe("/my-top-prospects?tab=portfolio");
  expect(opportunity.searchParams.get("mode")).toBe("opportunity");
  fireEvent.click(card.getByRole("button", { name: "Team discussion" }));
  const discussion = screen.getByRole("dialog", { name: "Add team discussion" });
  expect(discussion).toHaveTextContent("Zelda Donor");
  expect(card.getByRole("button", { name: "More actions for Zelda Donor" })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(within(discussion).getByRole("button", { name: "Close" }));
  if (density !== "detailed") {
    const toggle = screen.getByRole("button", { name: "Show details for Zelda Donor" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getAllByRole("group", { name: "Actions for Zelda Donor" })).toHaveLength(1);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves Top Prospect removal confirmation and list state from the compact menu", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search portfolio" }), { target: { value: "Zelda" } });
  fireEvent.click(screen.getByRole("button", { name: "More actions for Zelda Donor" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove from Top Prospects" }));
  expect(confirm).toHaveBeenCalledExactlyOnceWith("Remove Zelda Donor from Top Prospects? This will not remove the constituent from NXT or from the portfolio assignment list.");
  expect(screen.getByRole("searchbox", { name: "Search portfolio" })).toHaveValue("Zelda");
  expect(screen.getByRole("button", { name: "Show details for Zelda Donor" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: "More actions for Zelda Donor" })).toHaveFocus();
  expect(fetch).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it("closes action disclosures when switching views without fetching or expanding contacts", () => {
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "More actions for Zelda Donor" }));
  expect(screen.getByRole("button", { name: "Show details for Zelda Donor" })).toHaveAttribute("aria-expanded", "false");
  fireEvent.change(screen.getByLabelText("View"), { target: { value: "focus" } });
  expect(screen.getByRole("button", { name: "More actions for Zelda Donor" })).toHaveAttribute("aria-expanded", "false");
  expect(fetch).not.toHaveBeenCalled();
});

it("narrows the actual portfolio using saved opportunities and next steps without NXT calls", () => {
  state.data.prospects[0].next_action_due_date = "2025-09-15";
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Open opportunities 1" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Zelda Donor");
  fireEvent.click(screen.getByRole("button", { name: "Follow-ups due 1" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(screen.getByRole("button", { name: "Set next step" })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  expect(state.data.prospects[0].priority_order).toBe(1);
});

it.each(["due", "pipeline"])(
  "uses the %s sort on actual portfolio cards without fetching or changing ranks",
  (sort) => {
    render(<MyProspects />);
    fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "name" },
    });
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Amy Donor");
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: sort },
    });
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Zelda Donor");
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("$35,000");
    expect(screen.getAllByRole("article")[0]).toHaveTextContent(
      "Due Sep 30, 2026",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(state.data.prospects[0].priority_order).toBe(1);
  },
);

it.each(PORTFOLIO_SORT_OPTIONS.filter((option) => option.kind))(
  "uses $value on actual portfolio responses without fetching or changing Top Prospects ranks",
  ({ value, kind, direction }) => {
    state.data["blackbaud-portfolio"].leadSolicitor[0].savedActivity = {
      [kind]: { date: "2020-01-01", checkedAt: "2025-01-01T12:00:00Z" },
    };
    state.data["blackbaud-portfolio"].supportingSolicitor[0].savedActivity = {
      [kind]: { date: "2020-02-01", checkedAt: "2025-01-01T12:00:00Z" },
    };
    render(<MyProspects />);
    fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value } });
    expect(screen.getAllByRole("article")[0]).toHaveTextContent(direction === 1 ? "Zelda Donor" : "Amy Donor");
    fireEvent.change(screen.getByLabelText("Organize by"), { target: { value: "solicitor" } });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByLabelText("Sort by")).toHaveValue(value);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.data.prospects[0].priority_order).toBe(1);
  },
);
