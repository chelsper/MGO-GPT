import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  report: vi.fn(),
  user: { id: 7, email: "operator@example.test" },
}));
vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: m.user, loading: false }),
}));
vi.mock("./useReportConfigurations", () => ({
  useReportConfigurations: () => ({
    configurations: [{ key: "portfolio-fy-giving", canView: true }],
    visibleReports: [
      {
        key: "portfolio-fy-giving",
        title: "FY27 portfolio giving",
        canView: true,
      },
    ],
    canManage: false,
    isLoading: false,
  }),
}));
vi.mock("./usePortfolioGivingReport", () => ({
  usePortfolioGivingReport: m.report,
}));
import ReportsPage from "./page";
const snapshot = {
  workspaceUserId: 7,
  generatedAt: "2026-09-19T12:00:00Z",
  period: { yearLabel: "FY27", endDate: "2026-09-19" },
  reportRows: [{ constituentId: "1", name: "Example Donor" }],
  hardCreditTotals: { received: 100, committed: 0 },
  closedGiftSummary: { currentFY: "FY27", closedThisFY: 200 },
  opportunities: {
    1: [{ id: "op1", name: "Scholarship", status: "Cultivation" }],
  },
  acknowledgmentGiftGroups: [
    {
      key: "gift",
      giftId: "1",
      date: "2026-09-01",
      giftType: "Donation",
      fundDescriptions: ["Scholarships"],
      hardCreditDonor: { constituentId: "1", name: "Example Donor" },
      softCreditRecipients: [],
      receivedAmount: 100,
      committedAmount: 0,
    },
  ],
};
const state = () => ({
  data: { snapshot, refresh: null },
  loading: false,
  refreshing: false,
  error: "",
  reload: vi.fn(),
  refresh: vi.fn(),
});
beforeEach(() => {
  m.report.mockReturnValue(state());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (url !== "/api/users/profile")
        throw new Error(`Unexpected visit-time request: ${url}`);
      return Response.json({
        user: { ...m.user, role: "mgo" },
        workspaceUser: { ...m.user, name: "Example Fundraiser", role: "mgo" },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows saved amounts and existing gift actions without live gift or opportunity requests", async () => {
  render(<ReportsPage />);
  await waitFor(() =>
    expect(screen.getByText("Log Stewardship Action")).toBeTruthy(),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Link to Opportunity" }),
    ).toBeTruthy(),
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
    /FY\d+ portfolio giving/,
  );
  expect(screen.queryByText("Available reports")).toBeNull();
  expect(screen.queryByText("My Reports")).toBeNull();
  expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
  expect(screen.getByText("$200.00")).toBeTruthy();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/users/profile"]);
});
it("never presents a missing snapshot as $0", async () => {
  m.report.mockReturnValue({
    ...state(),
    data: { snapshot: null, refresh: null },
  });
  render(<ReportsPage />);
  await waitFor(() =>
    expect(screen.getByText(/No saved report yet/)).toBeTruthy(),
  );
  expect(screen.queryByLabelText("Report totals")).toBeNull();
  expect(screen.queryByText("$0.00")).toBeNull();
});
it("keeps complete figures visible alongside a paused refresh or network error", async () => {
  m.report.mockReturnValue({
    ...state(),
    error: "Network unavailable",
    data: {
      snapshot,
      refresh: {
        id: "job",
        status: "paused",
        stage: "giving",
        total: 100,
        checked: 5,
        message: "Blackbaud has paused requests.",
      },
    },
  });
  render(<ReportsPage />);
  expect(screen.getByText("$200.00")).toBeTruthy();
  expect(screen.getByText("Network unavailable")).toBeTruthy();
  expect(screen.getByText("Blackbaud has paused requests.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Resume refresh" })).toBeTruthy();
});
