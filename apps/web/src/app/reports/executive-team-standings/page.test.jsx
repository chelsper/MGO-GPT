import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Page from "./page";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

vi.mock("@/utils/useUser", () => {
  const user = { id: 7, role: "executive" };
  return { default: () => ({ data: user, loading: false }) };
});
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, description, action, eyebrow }) => <header>{eyebrow ? <p>{eyebrow}</p> : null}<h1>{title}</h1><p>{description}</p>{action}</header> }));
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
  expect(screen.getByRole("heading", { name: "Team Standings", level: 1 })).toBeInTheDocument();
  expect(screen.queryByText(/executive/i)).not.toBeInTheDocument();
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
  expect(screen.getAllByRole("status").some((node) => node.textContent.includes("High-value actions: Refresh required"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "High-value actions" }));
  expect(within(screen.getByRole("table")).getAllByLabelText("Unranked")).toHaveLength(2);
  expect(within(screen.getByRole("table")).getAllByText("Refresh required")).toHaveLength(2);
});

it("compares matching YTD windows and switches metrics without refreshing NXT", async () => {
  const comparison = getStandingsPeriods(new Date("2026-09-04T15:00:00Z"));
  const payload = { ...report, fiscalYear: comparison.fiscalYear, comparison, standings: report.standings.map((entry) => ({ ...entry, priorYearToDate: { raised: 500, highValueActions: 5 }, lastCompletedWeek: { raised: 100, highValueActions: 1 } })) };
  const fetchMock = vi.fn(async (url) => Response.json(url.includes("/goals?") ? { canEdit: false, goals: [] } : payload));
  vi.stubGlobal("fetch", fetchMock); render(<Page />);
  const table = await screen.findByRole("table");
  expect(within(table).getByRole("columnheader", { name: "FY26 YTD" })).toBeInTheDocument();
  expect(within(table).getAllByText("+$500 (+100%)").length).toBeGreaterThan(0);
  expect(screen.getByText(/Jul 1, 2025 to Sep 4, 2025/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "High-value actions" }));
  expect(within(table).getAllByText("+10 (+200%)").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare with last FY to date" }));
  expect(within(table).queryByRole("columnheader", { name: "FY26 YTD" })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => !url.includes("/goals"))).toHaveLength(1);
  expect(screen.getByRole("region", { name: "Weekly spotlight" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit annual goals" })).not.toBeInTheDocument();
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
