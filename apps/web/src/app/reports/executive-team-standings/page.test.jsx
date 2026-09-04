import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Page from "./page";

vi.mock("@/utils/useUser", () => {
  const user = { id: 7, role: "executive" };
  return { default: () => ({ data: user, loading: false }) };
});
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, description, action }) => <header><h1>{title}</h1><p>{description}</p>{action}</header> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const report = {
  fiscalYear: { label: "FY27" }, generatedAt: "2026-09-04T23:00:00Z",
  standings: [
    { userId: 1, name: "Alex MGO", activeProspects: 10, prospectsWithNextSteps: 3, fundedThisFiscalYear: 1000, highValueActionsThisFiscalYear: 15, nxtActionsThisFiscalYear: 20, drilldown: { nxtActions: [{ actionId: "a1", summary: "Campaign conversation", type: "Solicitation", category: "Meeting", highValue: true, date: "2026-09-01" }] } },
    { userId: 2, name: "Blake MGO", activeProspects: 5, prospectsWithNextSteps: 4, fundedThisFiscalYear: 5000, highValueActionsThisFiscalYear: 3, nxtActionsThisFiscalYear: 10 },
  ],
};
function mount(payload = report) {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);
  render(<Page />);
  return fetchMock;
}
function tableNames() {
  return within(screen.getByRole("table")).getAllByRole("rowheader").map((node) => node.textContent);
}
it("sorts leaderboard and scorecards by FY raised, then high-value actions without another NXT request", async () => {
  const fetchMock = mount();
  await screen.findByRole("table");
  expect(tableNames()).toEqual(["Blake MGO", "Alex MGO"]);
  fireEvent.click(screen.getByRole("button", { name: "High-value actions" }));
  expect(tableNames()).toEqual(["Alex MGO", "Blake MGO"]);
  expect(screen.getAllByRole("article", { name: /scorecard/ }).map((node) => node.id)).toEqual(["scorecard-1", "scorecard-2"]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const card = within(screen.getByRole("article", { name: "Alex MGO scorecard" }));
  expect(card.getByText("FY27 high-value actions")).toBeInTheDocument();
  expect(card.getByText("15")).toBeInTheDocument();
  fireEvent.click(card.getByRole("button", { name: "Show breakout details" }));
  expect(card.getByText("High value")).toBeInTheDocument();
  expect(card.getByText(/Action date/)).toBeInTheDocument();
});
it("keeps the coverage explanation visible on demand and out of ranking", async () => {
  mount(); await screen.findByRole("table");
  expect(screen.getByText("Scoring rules & data sources")).toBeInTheDocument();
  expect(screen.getByText(/No due date is required/)).toBeInTheDocument();
  const card = screen.getByRole("article", { name: "Alex MGO scorecard" });
  const local = within(card).getByText("Local workflow (JUMGOGPT only)").closest("details");
  expect(local).not.toHaveAttribute("open");
  expect(within(local).getByText("30% coverage")).toBeInTheDocument();
});
it("does not guess high-value actions from an older snapshot", async () => {
  mount({ ...report, standings: report.standings.map(({ highValueActionsThisFiscalYear, ...entry }) => entry) });
  await screen.findByRole("table");
  expect(screen.getByRole("status")).toHaveTextContent("High-value actions: Refresh required");
  fireEvent.click(screen.getByRole("button", { name: "High-value actions" }));
  expect(within(screen.getByRole("table")).getAllByLabelText("Unranked")).toHaveLength(2);
  expect(within(screen.getByRole("table")).getAllByText("Refresh required")).toHaveLength(2);
});
it("shows shared leaders for ties but no champion for all-zero or partial scores", async () => {
  mount({ ...report, standings: report.standings.map((entry) => ({ ...entry, fundedThisFiscalYear: 1000, highValueActionsThisFiscalYear: 0 })) });
  await screen.findByRole("table");
  expect(screen.getByText("Alex MGO / Blake MGO")).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getAllByLabelText("Rank 1")).toHaveLength(2);
  expect(screen.getByText("No positive scores recorded yet.")).toBeInTheDocument();
});
it("does not present missing data as last-place zero", async () => {
  mount({ ...report, standings: [report.standings[0], { ...report.standings[1], fundedThisFiscalYear: null }] });
  await screen.findByRole("table");
  expect(tableNames()).toEqual(["Alex MGO", "Blake MGO"]);
  expect(within(screen.getByRole("table")).getByLabelText("Unranked")).toBeInTheDocument();
  expect(screen.getByText("Waiting for a complete team snapshot.")).toBeInTheDocument();
});
