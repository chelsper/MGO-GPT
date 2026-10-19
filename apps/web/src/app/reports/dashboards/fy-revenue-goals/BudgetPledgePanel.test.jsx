import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BudgetPledgePanel from "./BudgetPledgePanel";
import { suggestPledgeColumns } from "@/utils/fyBudgetPledges";
const API = "/api/reports/fy-revenue-goals/budget-pledges";
const fields = ["System Record ID", "Name", "Installment Amount Due", "Installment Date Due", "Fund Description"];
const source = { queryId: "31076", queryName: "FY27 Budget Relieving Payments Due - JUMGOGPT", columns: suggestPledgeColumns(fields), confirmed: true };
const snapshot = { outstandingCents: 45000, installmentCount: 2, pledgeCount: 2, checkedPledges: 3, settledCount: 1, duplicateRows: 2, outsidePeriodRows: 1,
  refreshedAt: "2026-10-19T12:00:00Z", period: { label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30" } };
const rows = [{ key: "1:11", giftId: "1", name: "Fictional Donor", fundName: "Fictional Scholarship", dueDate: "2026-12-01", outstandingCents: 40000, scheduledCents: 50000 },
  { key: "2:22", giftId: "2", name: "Example Foundation", fundName: "Fictional Impact Fund", dueDate: "2027-01-01", outstandingCents: 5000, scheduledCents: 5000 }];
const saved = { revision: "one", source, snapshot, canManage: true, job: null, rows, page: 1, pages: 2, matchedCount: 51 };
const empty = { revision: null, source: null, snapshot: null, canManage: true, job: null, rows: [], page: 1, pages: 1, matchedCount: 0 };
const job = { status: "running", completed: 0, total: 4, source, error: null, resumeAfter: null };
const json = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-19T15:00:00Z")); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(saved))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("loads saved totals and the donor list without automatically calling NXT", async () => {
  const onDataChange = vi.fn(); render(<BudgetPledgePanel onDataChange={onDataChange} />);
  await screen.findByText("$450.00");
  fireEvent.click(screen.getByText("View names, amounts, funds, and due dates"));
  expect(screen.getByText("Fictional Donor")).toBeVisible(); expect(screen.getByText("Fictional Scholarship")).toBeVisible();
  expect(screen.getByText("$400.00")).toBeVisible(); expect(screen.getByText("Dec 1, 2026")).toBeVisible();
  expect(screen.getByText("Scheduled: $500.00")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  await waitFor(() => expect(onDataChange).toHaveBeenLastCalledWith(saved));
});
it("loads and suggests all five fields on Connect, then saves only after confirmation", async () => {
  fetch.mockResolvedValueOnce(json(empty)); render(<BudgetPledgePanel />);
  await screen.findByRole("button", { name: "Connect pledge query" });
  fetch.mockResolvedValueOnce(json({ queryName: source.queryName, fields, suggested: source.columns }));
  fireEvent.click(screen.getByRole("button", { name: "Connect pledge query" }));
  await waitFor(() => expect(screen.getByLabelText("Scheduled installment amount")).toHaveValue("Installment Amount Due"));
  expect(screen.getByRole("button", { name: "Save and refresh pledge installments" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox")); fetch.mockResolvedValueOnce(json(saved));
  fireEvent.click(screen.getByRole("button", { name: "Save and refresh pledge installments" }));
  await screen.findByText("$450.00");
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ operation: "refresh", revision: null, input: source });
});
it("continues small batches automatically after an explicit refresh", async () => {
  render(<BudgetPledgePanel />); await screen.findByText("$450.00");
  fetch.mockResolvedValueOnce(json({ ...saved, revision: "two", job })).mockResolvedValueOnce(json({ ...saved, revision: "three", job: { ...job, completed: 3 } })).mockResolvedValueOnce(json({ ...saved, revision: "four", snapshot: { ...snapshot, outstandingCents: 60000 } }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh pledge installments" }));
  await screen.findByText("$600.00", {}, { timeout: 3000 });
  expect(fetch.mock.calls.slice(1).map(([, options]) => JSON.parse(options.body).operation)).toEqual(["refresh", "continue", "continue"]);
  expect(fetch.mock.calls.slice(1).map(([, options]) => JSON.parse(options.body).revision)).toEqual(["one", "two", "three"]);
});
it("does not resume a saved job merely by viewing the dashboard", async () => {
  fetch.mockResolvedValue(json({ ...saved, job })); render(<BudgetPledgePanel />);
  await screen.findByRole("button", { name: "Resume balance checks" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves a user's pause even if an in-flight read subsequently finishes", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, job })); render(<BudgetPledgePanel />);
  await screen.findByRole("button", { name: "Resume balance checks" });
  let finish; fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Resume balance checks" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Pause balance checks" }));
  await act(async () => finish(json({ ...saved, revision: "two", job: { ...job, completed: 3 } })));
  expect(screen.getByRole("button", { name: "Resume balance checks" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Pause balance checks" })).not.toBeInTheDocument();
});
it("does not loop after a failed check, and retains the last successful totals", async () => {
  render(<BudgetPledgePanel />); await screen.findByText("$450.00");
  fetch.mockResolvedValueOnce(json({ error: "NXT unavailable; previous totals are unchanged." }, 503));
  fireEvent.click(screen.getByRole("button", { name: "Refresh pledge installments" }));
  await screen.findByRole("alert"); expect(screen.getByText("$450.00")).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(2);
});
it("shows blocking guidance without offering an unsafe continuation", async () => {
  fetch.mockResolvedValue(json({ ...saved, job: { ...job, status: "blocked", error: "Pledge 1 has multiple funds." } }));
  render(<BudgetPledgePanel />); await screen.findByText("Pledge 1 has multiple funds.");
  expect(screen.queryByRole("button", { name: "Resume balance checks" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start a new pledge refresh" })).toBeEnabled();
});
it("pages and searches without refreshing NXT or changing the overall total", async () => {
  render(<BudgetPledgePanel />); await screen.findByText("$450.00");
  fireEvent.click(screen.getByText("View names, amounts, funds, and due dates"));
  fetch.mockResolvedValueOnce(json({ ...saved, page: 2, rows: [rows[1]] }));
  fireEvent.click(screen.getByRole("button", { name: "Next installments" }));
  await screen.findByText("Page 2 of 2"); expect(fetch.mock.calls[1][0]).toBe(`${API}?page=2&search=`);
  fireEvent.change(screen.getByLabelText("Find a donor, fund, or pledge ID"), { target: { value: "Example" } });
  fetch.mockResolvedValueOnce(json({ ...saved, page: 1, pages: 1, rows: [rows[1]], matchedCount: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Search installments" }));
  await screen.findByText("1 installments match your search. Searching does not change the dashboard totals.");
  expect(fetch.mock.calls[2][0]).toBe(`${API}?page=1&search=Example`); expect(screen.getByText("$450.00")).toBeVisible();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("hides manager controls from viewers and removes donor data on lost access", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, canManage: false })); render(<BudgetPledgePanel />); await screen.findByText("$450.00");
  expect(screen.queryByRole("button", { name: "Refresh pledge installments" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Manage pledge source" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("View names, amounts, funds, and due dates"));
  fetch.mockResolvedValueOnce(json({ error: "Please sign in." }, 401));
  fireEvent.click(screen.getByRole("button", { name: "Next installments" }));
  await screen.findByRole("alert"); expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument(); expect(screen.queryByText("$450.00")).not.toBeInTheDocument();
});
it("labels a prior-year snapshot rather than presenting it as current", async () => {
  vi.setSystemTime(new Date("2027-07-01T12:00:00Z")); render(<BudgetPledgePanel />);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("belong to FY27, not FY28"));
});
