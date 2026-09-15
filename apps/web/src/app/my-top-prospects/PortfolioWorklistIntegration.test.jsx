import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
const state = vi.hoisted(() => ({ profile: null, data: {} }));
vi.mock("@/components/ProspectExport", () => ({ default: () => null }));
vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: { id: 2 }, loading: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }) => ({
    data:
      queryKey[0] === "profile-sync-status"
        ? state.profile
        : state.data[queryKey[0]],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));
import MyProspects from "./page";

beforeEach(() => {
  localStorage.clear();
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
        mapped: { prospectSummaryNarrative: "Saved summary narrative" },
      }),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

it("uses saved activity dates in collapsed rows without additional fetches or changing order", () => {
  state.data["blackbaud-portfolio"].leadSolicitor[0].savedActivity = {
    gift: { date: "2026-08-31", checkedAt: "2026-09-14T12:00:00Z" },
    action: { date: "2026-09-10", checkedAt: "2026-09-14T12:00:00Z" },
  };
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  expect(screen.getByText("Last gift (saved)")).toBeVisible();
  expect(screen.getByText("Aug 31, 2026")).toBeVisible();
  expect(screen.getByText("Last action (saved)")).toBeVisible();
  expect(screen.getByText("Sep 10, 2026")).toBeVisible();
  const amy = within(screen.getAllByRole("article")[1]);
  expect(amy.queryByText(/Opportunity data unavailable|No saved next step|Last gift|Last action/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
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
      mapped: { constituent: { email: "loaded@example.com", phone: "904-555-0199", address: "100 Loaded Street" } },
      summaryRefreshedAt: "2026-09-15T12:00:00Z",
    }),
  }).mockImplementationOnce(() => refresh);
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details for Zelda Donor" }));
  fireEvent.click(screen.getByRole("button", { name: "NXT Summary" }));
  await waitFor(() => expect(screen.getByText("loaded@example.com · 904-555-0199")).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "Refresh this summary" }));
  expect(screen.getByText("Loading NXT summary...")).toBeVisible();
  expect(screen.getByText("loaded@example.com · 904-555-0199")).toBeVisible();
  expect(screen.getByText("100 Loaded Street")).toBeVisible();
  finishRefresh({ ok: false, json: async () => ({ error: "NXT temporarily unavailable" }) });
  await waitFor(() => expect(screen.getByText("NXT temporarily unavailable")).toBeVisible());
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
  fireEvent.click(screen.getByRole("button", { name: "NXT Summary" }));
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

it("expands the actual portfolio card without fetching; NXT Summary remains explicit", async () => {
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  const card = within(screen.getAllByRole("article")[0]);
  expect(card.getByText("2 saved open opportunities")).toBeVisible();
  expect(card.getByText("Call about proposal")).toBeVisible();
  expect(
    card.queryByRole("link", { name: "Log action" }),
  ).not.toBeInTheDocument();
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
  fireEvent.click(card.getByRole("button", { name: "NXT Summary" }));
  await waitFor(() =>
    expect(card.getByText("Saved summary narrative")).toBeVisible(),
  );
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "/api/blackbaud/constituents/100/summary",
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
  expect(screen.getByRole("button", { name: "Set next step" })).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "NXT Summary" }));
  await waitFor(() =>
    expect(screen.getByText("Saved summary narrative")).toBeVisible(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Amy Donor" }),
  );
  expect(screen.getByText("Saved summary narrative")).not.toBeVisible();
  expect(screen.getByRole("link", { name: "Log action" })).toHaveAttribute(
    "href",
    expect.stringContaining("blackbaudConstituentId=101"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(screen.getByText("Saved summary narrative")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Collapse details" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(screen.getByText("Saved summary narrative")).toBeVisible();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "/api/blackbaud/constituents/100/summary",
  );
  expect(state.data.prospects[0].priority_order).toBe(1);
});

it("filters actual category and solicitor groups without writes, fetching or rank changes", () => {
  state.data["portfolio-categories"] = {
    categories: [{ id: 9, name: "Planned giving", sort_order: 0 }],
    assignments: [{ blackbaud_constituent_id: "100", category_id: 9 }],
  };
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
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

it.each(["compact", "focus"])(
  "preserves read-only protection inside %s cards",
  (density) => {
    state.profile.user.role = "executive";
    render(<MyProspects />);
    fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: density },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Zelda Donor" }),
    );
    expect(
      screen.queryByRole("link", { name: "Log action" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set next step" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open NXT profile" }),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  },
);

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
