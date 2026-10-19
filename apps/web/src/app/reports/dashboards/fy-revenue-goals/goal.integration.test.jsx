import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, action }) => <header><h1>{title}</h1>{action}</header> }));
import Page from "./page";
import { BUDGET_CASH_GROUPS } from "@/utils/fyBudgetCash";
import { UNRESTRICTED_GOAL_CONFIG } from "@/app/api/utils/fyUnrestrictedGoal";
const API = "/api/reports/fy-revenue-goals", CASH_API = `${API}/budget-cash`, PLEDGE_API = `${API}/budget-pledges`;
const initialPledges = { revision: "pledge-one", source: { queryName: "Pledges", columns: {} }, canManage: true, job: null, rows: [], page: 1, pages: 1, matchedCount: 0,
  snapshot: { outstandingCents: 10000000, installmentCount: 10, pledgeCount: 5, checkedPledges: 5, settledCount: 0, duplicateRows: 0, outsidePeriodRows: 0,
    refreshedAt: "2026-10-19T12:00:00Z", period: { label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30" } } };
const initialRevenue = { revision: "revenue-one", canManage: true, goal: UNRESTRICTED_GOAL_CONFIG, source: { projection: "remaining", queryName: "Eligible gifts" },
  snapshot: { receivedCents: 100000000, projectedCents: 90000000, giftCount: 100, rawRows: 100, duplicateRows: 0, refreshedAt: "2026-10-19T12:00:00Z" } };
const initialCash = { revision: "cash-one", canManage: true, source: { mode: "gift" }, snapshot: { receivedCents: 50000000, giftCount: 50, rawRows: 50, duplicateRows: 0, refreshedAt: "2026-10-18T12:00:00Z",
  groups: BUDGET_CASH_GROUPS.map((group, i) => ({ ...group, receivedCents: i === 5 ? 50000000 : 0, fundCount: i === 5 ? 1 : 0 })), funds: [] } };
const json = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
const goal = () => within(screen.getByRole("region", { name: "Unrestricted revenue goal" }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async url => json(url === PLEDGE_API ? initialPledges : url === CASH_API ? initialCash : initialRevenue)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("combines cached snapshots, keeping expected receipts separate without running NXT queries", async () => {
  render(<Page />);
  await waitFor(() => expect(goal().getByText("$3,630,000.00")).toBeVisible());
  expect(goal().getByText("$2,870,000.00")).toBeVisible();
  expect(goal().getByText("$3,730,000.00")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([API, CASH_API, PLEDGE_API]);
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("automatically updates the roll-up after either source refresh, without reloading the other query", async () => {
  render(<Page />); await waitFor(() => expect(goal().getByText("$3,630,000.00")).toBeVisible());
  fetch.mockResolvedValueOnce(json({ ...initialCash, revision: "cash-two", snapshot: { ...initialCash.snapshot, receivedCents: 60000000 } }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh cash totals" }));
  await waitFor(() => expect(goal().getByText("$3,730,000.00")).toBeVisible());
  expect(fetch.mock.calls[3][0]).toBe(CASH_API);
  fetch.mockResolvedValueOnce(json({ ...initialRevenue, revision: "revenue-two", snapshot: { ...initialRevenue.snapshot, receivedCents: 200000000, projectedCents: 180000000 } }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh totals", exact: true }));
  await waitFor(() => expect(goal().getByText("$3,830,000.00")).toBeVisible());
  expect(fetch.mock.calls[4][0]).toBe(API); expect(fetch).toHaveBeenCalledTimes(5);
});
it("preserves the last roll-up on a failed refresh but removes it on lost access", async () => {
  render(<Page />); await waitFor(() => expect(goal().getByText("$3,630,000.00")).toBeVisible());
  fetch.mockResolvedValueOnce(json({ error: "Previous totals unchanged." }, 503));
  fireEvent.click(screen.getByRole("button", { name: "Refresh cash totals" }));
  await screen.findByRole("alert"); expect(goal().getByText("$3,630,000.00")).toBeVisible();
  fetch.mockResolvedValueOnce(json({ error: "Please sign in." }, 401));
  fireEvent.click(screen.getByRole("button", { name: "Refresh cash totals" }));
  await waitFor(() => expect(goal().queryByText("$3,630,000.00")).not.toBeInTheDocument());
  expect(goal().getByRole("status")).toHaveTextContent("Waiting for saved budget-relieving cash");
  fetch.mockResolvedValueOnce(json({ error: "Please sign in." }, 401));
  fireEvent.click(screen.getByRole("button", { name: "Refresh totals", exact: true }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Unrestricted revenue goal" })).not.toBeInTheDocument());
});
it("shows no full total if cash has not been initialized", async () => {
  fetch.mockImplementation(async url => json(url === PLEDGE_API ? initialPledges : url === CASH_API ? { revision: null, source: null, snapshot: null, canManage: true } : initialRevenue));
  render(<Page />); await screen.findByRole("button", { name: "Connect cash query" });
  expect(goal().queryByRole("progressbar")).not.toBeInTheDocument();
  expect(goal().getByRole("status")).toHaveTextContent("budget-relieving cash");
});
it("refreshes expected installments without modifying cash received or its progress bar", async () => {
  render(<Page />); await waitFor(() => expect(goal().getByText("$3,730,000.00")).toBeVisible());
  const cashProgress = goal().getByRole("progressbar").getAttribute("aria-valuetext");
  fetch.mockResolvedValueOnce(json({ ...initialPledges, snapshot: { ...initialPledges.snapshot, outstandingCents: 20000000 } }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh pledge installments" }));
  await waitFor(() => expect(goal().getByText("$3,830,000.00")).toBeVisible());
  expect(goal().getByText("$3,630,000.00")).toBeVisible(); expect(goal().getByRole("progressbar")).toHaveAttribute("aria-valuetext", cashProgress);
  expect(fetch.mock.calls[3][0]).toBe(PLEDGE_API);
});
