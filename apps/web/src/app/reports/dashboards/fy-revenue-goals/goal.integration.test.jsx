import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, action }) => <header><h1>{title}</h1>{action}</header> }));
import Page from "./page";
import { BUDGET_CASH_GROUPS, defaultBudgetFundNames } from "@/utils/fyBudgetCash";
import { UNRESTRICTED_GOAL_CONFIG } from "@/app/api/utils/fyUnrestrictedGoal";
const API = "/api/reports/fy-revenue-goals", CASH_API = `${API}/budget-cash`, PLEDGE_API = `${API}/budget-pledges`;
const initialPledges = { revision: "pledge-one", source: { queryName: "Pledges", columns: {} }, canManage: true, job: null, rows: [], page: 1, pages: 1, matchedCount: 0,
  snapshot: { outstandingCents: 10000000, installmentCount: 10, pledgeCount: 5, checkedPledges: 5, settledCount: 0, duplicateRows: 0, outsidePeriodRows: 0,
    refreshedAt: "2026-10-19T12:00:00Z", period: { label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30" } } };
const initialRevenue = { revision: "revenue-one", canManage: true, goal: UNRESTRICTED_GOAL_CONFIG, source: { projection: "remaining", queryName: "Eligible gifts" },
  snapshot: { receivedCents: 100000000, projectedCents: 90000000, giftCount: 100, rawRows: 100, duplicateRows: 0, refreshedAt: "2026-10-19T12:00:00Z" } };
const initialCash = { revision: "cash-one", canManage: true, source: { mode: "gift", confirmed: true, columns: {}, fundNames: defaultBudgetFundNames() }, snapshot: { receivedCents: 50000000, giftCount: 50, rawRows: 50, duplicateRows: 0, refreshedAt: "2026-10-18T12:00:00Z",
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
  fireEvent.click(screen.getByRole("button", { name: "Refresh re-investment totals", exact: true }));
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
  fireEvent.click(screen.getByRole("button", { name: "Refresh re-investment totals", exact: true }));
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
it("uses the adjusted installment total instead of the NXT balance without changing cash", async () => {
  fetch.mockImplementation(async url => json(url === PLEDGE_API ? { ...initialPledges, snapshot: { ...initialPledges.snapshot, countableCents: 7500000 } } : url === CASH_API ? initialCash : initialRevenue));
  render(<Page />); await waitFor(() => expect(goal().getByText("$3,705,000.00")).toBeVisible());
  expect(goal().getByText("$3,630,000.00")).toBeVisible(); expect(goal().getByText("$75,000.00")).toBeVisible();
});
it("rolls a manual receipt immediately into both projections without refreshing either NXT query", async () => {
  const config = { ...UNRESTRICTED_GOAL_CONFIG, manual: { revision: null, entries: UNRESTRICTED_GOAL_CONFIG.fixedContributions.map(item => ({ ...item, archived: false, origin: "initial", receivedDate: null, reason: "Existing" })), history: [], historyCount: 0 } };
  fetch.mockImplementation(async url => json(url === PLEDGE_API ? initialPledges : url === CASH_API ? initialCash : { ...initialRevenue, goal: config }));
  render(<Page />); await waitFor(() => expect(goal().getByText("$3,630,000.00")).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "Add cash received" }));
  expect(screen.getByRole("button", { name: "Refresh all dashboard sources" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Description or receipt reference"), { target: { value: "Additional receipt" } });
  fireEvent.change(screen.getByLabelText("Cash received amount"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Receipt date"), { target: { value: "2026-10-18" } });
  fireEvent.change(screen.getByLabelText("Reason or source note"), { target: { value: "Separate receipt" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fetch.mockResolvedValueOnce(json({ goal: { ...config, fixedContributions: [...config.fixedContributions, { key: "extra", label: "Additional receipt", cents: 100000 }] } }));
  fireEvent.click(screen.getByRole("button", { name: "Save cash entry" }));
  await waitFor(() => expect(goal().getByText("$3,631,000.00")).toBeVisible());
  expect(goal().getByText("$3,731,000.00")).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls[3][0]).toBe(`${API}/manual-cash`);
});

const allButton = () => screen.getByRole("button", { name: "Refresh all dashboard sources" });
it("refreshes all three sources and updates the panels and roll-up without changing manual entries", async () => {
  const posts = [];
  fetch.mockImplementation(async (url, options) => {
    const state = url === CASH_API ? initialCash : url === PLEDGE_API ? initialPledges : initialRevenue;
    if (!options.method) return json(state);
    posts.push({ url, body: JSON.parse(options.body) });
    const snapshot = url === CASH_API ? { ...state.snapshot, receivedCents: 60000000 }
      : url === PLEDGE_API ? { ...state.snapshot, outstandingCents: 20000000 }
        : { ...state.snapshot, receivedCents: 200000000, projectedCents: 180000000 };
    return json({ ...state, revision: "updated", snapshot });
  });
  render(<Page />); await waitFor(() => expect(allButton()).toBeEnabled());
  fireEvent.click(allButton());
  await screen.findByText("All three dashboard sources updated.");
  expect(posts.map(post => post.url)).toEqual([API, CASH_API, PLEDGE_API]);
  expect(posts.map(post => post.body.revision)).toEqual(["revenue-one", "cash-one", "pledge-one"]);
  expect(goal().getByText("$3,830,000.00")).toBeVisible();
  expect(goal().getByText("$4,030,000.00")).toBeVisible();
  expect(within(screen.getByRole("region", { name: "Budget-relieving cash received" })).getAllByText("$600,000.00")).not.toHaveLength(0);
  expect(within(screen.getByRole("region", { name: "Budget-relieving pledge installments" })).getByText("$200,000.00")).toBeVisible();
  expect(allButton()).toBeEnabled();
});

it("locks source actions during refresh and prevents double clicks", async () => {
  let finish;
  render(<Page />); await waitFor(() => expect(allButton()).toBeEnabled());
  fetch.mockImplementation(async (url, options) => {
    if (options.method && url === API) return new Promise(resolve => { finish = () => resolve(json(initialRevenue)); });
    return json(url === CASH_API ? initialCash : url === PLEDGE_API ? initialPledges : initialRevenue);
  });
  fireEvent.click(allButton());
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(screen.getByRole("button", { name: "Refreshing dashboard sources..." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh cash totals" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh pledge installments" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Manage source" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Refreshing dashboard sources..." }));
  finish();
  await screen.findByText("All three dashboard sources updated.");
  expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(3);
});

it("preserves unsaved cash settings rather than discarding them on refresh all", async () => {
  render(<Page />); await waitFor(() => expect(allButton()).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Manage cash source" }));
  expect(allButton()).toBeDisabled();
  fireEvent.change(screen.getByLabelText("NXT fund name for JU Parents Fund"), { target: { value: "Custom parents fund" } });
  fireEvent.click(screen.getByRole("button", { name: "Manage cash source" }));
  expect(allButton()).toBeDisabled();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Continue editing cash source" }));
  expect(screen.getByLabelText("NXT fund name for JU Parents Fund")).toHaveValue("Custom parents fund");
});

it("shows partial failure and keeps the previous cash result while other sources finish", async () => {
  render(<Page />); await waitFor(() => expect(allButton()).toBeEnabled());
  fetch.mockImplementation(async (url, options) => url === CASH_API && options.method
    ? json({ error: "Cash query unavailable. Previous totals are unchanged." }, 503)
    : json(url === CASH_API ? initialCash : url === PLEDGE_API ? initialPledges : initialRevenue));
  fireEvent.click(allButton());
  await screen.findByText("2 of 3 sources updated. Review the details below.");
  expect(screen.getByText(/Cash query unavailable/)).toBeVisible();
  expect(screen.getByText(/Sources may have different refresh dates/)).toBeVisible();
  expect(goal().getByText("$3,630,000.00")).toBeVisible();
});

it("waits for pledge continuations and does not run the panel's automatic loop at the same time", async () => {
  const operations = [];
  fetch.mockImplementation(async (url, options) => {
    if (url !== PLEDGE_API || !options.method) return json(url === CASH_API ? initialCash : url === PLEDGE_API ? initialPledges : initialRevenue);
    const body = JSON.parse(options.body); operations.push(body.operation);
    return json(body.operation === "refresh" ? { ...initialPledges, revision: "job-started", job: { status: "running", source: initialPledges.source, completed: 0, total: 5 } } : { ...initialPledges, revision: "job-done" });
  });
  render(<Page />); await waitFor(() => expect(allButton()).toBeEnabled());
  fireEvent.click(allButton());
  await screen.findByText(/Checking pledge balances: 0 of 5/);
  expect(screen.queryByText("All three dashboard sources updated.")).not.toBeInTheDocument();
  await screen.findByText("All three dashboard sources updated.");
  expect(operations).toEqual(["refresh", "continue"]);
});

it("removes all dashboard totals and stops further refreshes on lost access", async () => {
  render(<Page />); await waitFor(() => expect(allButton()).toBeEnabled());
  fetch.mockImplementation(async url => url === CASH_API ? json({ error: "Please sign in." }, 401) : json(initialRevenue));
  fireEvent.click(allButton());
  await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Unrestricted revenue goal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh all dashboard sources" })).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([url, options]) => url === PLEDGE_API && options.method)).toHaveLength(0);
});
