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
