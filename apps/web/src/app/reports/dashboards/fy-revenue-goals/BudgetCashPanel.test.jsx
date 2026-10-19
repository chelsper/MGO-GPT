import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BUDGET_CASH_GROUPS, defaultBudgetFundNames } from "@/utils/fyBudgetCash";
import BudgetCashPanel from "./BudgetCashPanel";
const source = { queryId: "31075", queryName: "Budget Cash", mode: "gift", confirmed: true, fundNames: defaultBudgetFundNames(),
  columns: { giftId: "System Record ID", amount: "Gift Amount", fundId: "Fund System Record ID", fundName: "Fund Description" } };
const saved = { revision: "one", canManage: true, source, snapshot: { receivedCents: 100000, giftCount: 12, rawRows: 13, duplicateRows: 1, refreshedAt: "2026-10-19T12:00:00Z",
  groups: BUDGET_CASH_GROUPS.map((group, i) => ({ ...group, receivedCents: i === 0 ? 75000 : i === 5 ? 25000 : 0, fundCount: i === 0 || i === 5 ? 1 : 0 })),
  funds: [{ id: "101", name: "JU's Greatest Needs", groupKey: "greatest_needs", receivedCents: 75000, giftCount: 10 }, { id: "102", name: "Named Scholarship", groupKey: "other", receivedCents: 25000, giftCount: 2 }] } };
const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(saved))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reads only saved cash data and displays all six fund rows and the reconciled total", async () => {
  render(<BudgetCashPanel />);
  await screen.findAllByText("$1,000.00");
  const table = screen.getByRole("table", { name: "Budget-relieving cash received by fund" });
  expect(within(table).getAllByRole("row")).toHaveLength(8);
  for (const group of BUDGET_CASH_GROUPS) expect(within(table).getByRole("rowheader", { name: new RegExp(group.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeInTheDocument();
  expect(screen.getByText(/the two totals may overlap/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe("/api/reports/fy-revenue-goals/budget-cash");
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
  fireEvent.click(screen.getByText("View included funds and calculation details"));
  expect(screen.getByText("Named Scholarship")).toBeVisible();
  expect(screen.getByText("System ID 102")).toBeVisible();
});
it("keeps the last successful total when refreshing fails and uses saved cash settings", async () => {
  render(<BudgetCashPanel />); await screen.findAllByText("$1,000.00");
  fetch.mockResolvedValueOnce(json({ error: "Query unavailable; previous totals are unchanged." }, false, 503));
  fireEvent.click(screen.getByRole("button", { name: "Refresh cash totals" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("previous totals");
  expect(screen.getAllByText("$1,000.00")).toHaveLength(2);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "refresh", input: source, revision: "one" });
});
it("connects the cash query with suggested fields and one explicit confirmation", async () => {
  fetch.mockResolvedValueOnce(json({ revision: null, source: null, snapshot: null, canManage: true }));
  render(<BudgetCashPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect cash query" }));
  expect(screen.getAllByText("Not refreshed")).toHaveLength(8);
  expect(screen.getByRole("button", { name: "Save cash source and refresh" })).toBeDisabled();
  fetch.mockResolvedValueOnce(json({ fields: Object.values(source.columns), queryName: source.queryName }));
  fireEvent.click(screen.getByRole("button", { name: "Load cash query fields" }));
  await waitFor(() => expect(screen.getByLabelText("Fund system record ID")).toHaveValue("Fund System Record ID"));
  expect(screen.getByLabelText("Whole-gift amount")).toHaveValue("Gift Amount");
  fireEvent.click(screen.getByRole("checkbox"));
  fetch.mockResolvedValueOnce(json(saved));
  fireEvent.click(screen.getByRole("button", { name: "Save cash source and refresh" }));
  await screen.findAllByText("$1,000.00");
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ operation: "refresh", input: { ...source, columns: { ...source.columns, splitId: "" } }, revision: null });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("requires a fresh confirmation when fund names or amount basis change", async () => {
  render(<BudgetCashPanel />); fireEvent.click(await screen.findByRole("button", { name: "Manage cash source" }));
  fetch.mockResolvedValueOnce(json({ fields: [...Object.values(source.columns), "Gift Split Amount", "Gift Split System Record ID"], queryName: source.queryName }));
  fireEvent.click(screen.getByRole("button", { name: "Load cash query fields" }));
  await waitFor(() => expect(screen.getByLabelText("Whole-gift amount")).not.toBeDisabled());
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByText("Match the five named funds"));
  fireEvent.change(screen.getByLabelText("NXT fund name for JU Parent Fund"), { target: { value: "Parents Fund" } });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Amount basis"), { target: { value: "split" } });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByLabelText("Fund-split amount")).toHaveValue("Gift Split Amount");
  expect(screen.getByLabelText("Gift split system record ID")).toHaveValue("Gift Split System Record ID");
});
it("hides management from viewers and removes cash data after access is revoked", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, canManage: false }));
  const view = render(<BudgetCashPanel />); await screen.findAllByText("$1,000.00");
  expect(screen.queryByRole("button")).not.toBeInTheDocument(); view.unmount();
  render(<BudgetCashPanel />); await screen.findByRole("button", { name: "Refresh cash totals" });
  fetch.mockResolvedValueOnce(json({ error: "No longer shared." }, false, 403));
  fireEvent.click(screen.getByRole("button", { name: "Refresh cash totals" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("$1,000.00")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Manage cash source" })).not.toBeInTheDocument();
});
it("recovers initial loading failures with the saved source, not blank defaults", async () => {
  fetch.mockResolvedValueOnce(json({ error: "Temporarily unavailable" }, false, 503));
  render(<BudgetCashPanel />); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reload saved cash totals" }));
  fireEvent.click(await screen.findByRole("button", { name: "Manage cash source" }));
  expect(screen.getByLabelText("Gift system record ID")).toHaveValue(source.columns.giftId);
});
