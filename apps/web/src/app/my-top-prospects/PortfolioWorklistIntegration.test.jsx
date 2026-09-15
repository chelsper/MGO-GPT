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
    vi
      .fn()
      .mockResolvedValue({
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

it("preserves read-only protection inside expanded cards", () => {
  state.profile.user.role = "executive";
  render(<MyProspects />);
  fireEvent.click(screen.getByRole("button", { name: "My Portfolio" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Show details for Zelda Donor" }),
  );
  expect(
    screen.queryByRole("link", { name: "Log action" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Set next step" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open NXT profile" })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
