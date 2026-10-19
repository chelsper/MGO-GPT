import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BUDGET_CASH_GROUPS, budgetFundGroup, defaultBudgetFundNames } from "@/utils/fyBudgetCash";
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
  expect(screen.getByText(/only the 10% re-investment amount/)).toBeVisible();
  expect(screen.getByText(/Changing a name cannot add gifts/)).toHaveTextContent("query 31075's criteria");
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
  fireEvent.change(screen.getByLabelText("NXT fund name for JU Parents Fund"), { target: { value: "Parents Fund" } });
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

it("saves corrected fund names without loading metadata and shows persisted labels and regrouped totals", async () => {
  const funds = [
    { id: "101", name: "JU Parents Fund", receivedCents: 75000, giftCount: 10 },
    { id: "102", name: "Future. Rising. Scholarship Fund", receivedCents: 25000, giftCount: 2 },
  ];
  const regroup = (fundNames, revision) => {
    const assigned = funds.map(fund => ({ ...fund, groupKey: budgetFundGroup(fund.name, fundNames) }));
    return { ...saved, revision, source: { ...source, fundNames }, snapshot: { ...saved.snapshot, funds: assigned,
      groups: BUDGET_CASH_GROUPS.map(group => ({ ...group, fundCount: assigned.filter(fund => fund.groupKey === group.key).length,
        receivedCents: assigned.filter(fund => fund.groupKey === group.key).reduce((sum, fund) => sum + fund.receivedCents, 0) })) } };
  };
  let persisted = regroup({ ...source.fundNames, parent: "JU Parent Fund", future_rising: "Future Rising Scholarship Fund" }, "one");
  fetch.mockImplementation(async (_url, options) => {
    if (options?.method === "POST") {
      const body = JSON.parse(options.body);
      expect(body.operation).toBe("refresh");
      expect(body.input.fundNames).toEqual(defaultBudgetFundNames());
      persisted = regroup(body.input.fundNames, "two");
    }
    return json(structuredClone(persisted));
  });
  const view = render(<BudgetCashPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage cash source" }));
  expect(screen.getByLabelText("Gift system record ID")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save cash source and refresh" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("NXT fund name for JU Parents Fund"), { target: { value: "JU Parents Fund" } });
  fireEvent.change(screen.getByLabelText("NXT fund name for Future. Rising. Scholarship Fund"), { target: { value: "Future. Rising. Scholarship Fund" } });
  expect(screen.getByText("Matches 1 saved fund: JU Parents Fund (ID 101).")).toBeVisible();
  expect(screen.getByText("Matches 1 saved fund: Future. Rising. Scholarship Fund (ID 102).")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("unsaved cash-source changes");
  expect(screen.getByRole("button", { name: "Refresh cash totals" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save cash source and refresh" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save cash source and refresh" }));
  await screen.findByText(/Cash source saved and totals refreshed/);
  const table = screen.getByRole("table", { name: "Budget-relieving cash received by fund" });
  expect(within(table).getByRole("row", { name: "JU Parents Fund $750.00" })).toBeVisible();
  expect(within(table).getByRole("row", { name: "Future. Rising. Scholarship Fund $250.00" })).toBeVisible();
  expect(within(table).getByRole("row", { name: "Other Scholarships $0.00" })).toBeVisible();
  expect(within(table).getByRole("row", { name: "Total budget-relieving cash received $1,000.00" })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
  view.unmount(); render(<BudgetCashPanel />);
  expect(await screen.findByRole("row", { name: "JU Parents Fund $750.00" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Manage cash source" }));
  expect(screen.getByLabelText("NXT fund name for Future. Rising. Scholarship Fund")).toHaveValue("Future. Rising. Scholarship Fund");
});

it("offers the exact legacy-name correction without silently changing saved data or custom names", async () => {
  fetch.mockResolvedValue(json({ ...saved, source: { ...source, fundNames: { ...source.fundNames,
    parent: "JU Parent Fund", future_rising: "Future Rising Scholarship Fund", impact: "Custom Impact Fund" } } }));
  render(<BudgetCashPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage cash source" }));
  fireEvent.click(screen.getByRole("button", { name: "Use corrected standard names" }));
  expect(screen.getByLabelText("NXT fund name for JU Parents Fund")).toHaveValue("JU Parents Fund");
  expect(screen.getByLabelText("NXT fund name for Future. Rising. Scholarship Fund")).toHaveValue("Future. Rising. Scholarship Fund");
  expect(screen.getByLabelText("NXT fund name for Future. Made. Impact Fund")).toHaveValue("Custom Impact Fund");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Manage cash source" }));
  expect(screen.getByRole("button", { name: "Refresh cash totals" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Continue editing cash source" }));
  expect(screen.getByLabelText("NXT fund name for JU Parents Fund")).toHaveValue("JU Parents Fund");
});

it("displays already-saved corrected names but explains when neither fund was returned", async () => {
  render(<BudgetCashPanel />); await screen.findAllByText("$1,000.00");
  expect(screen.getByRole("row", { name: "JU Parents Fund No matching fund returned in the last refresh $0.00" })).toBeVisible();
  expect(screen.getByRole("row", { name: "Future. Rising. Scholarship Fund No matching fund returned in the last refresh $0.00" })).toBeVisible();
  expect(screen.queryByText("JU Parent Fund", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("Future Rising Scholarship Fund", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText(/Changing a name cannot add gifts/)).toHaveTextContent("JU Parents Fund");
  fireEvent.click(screen.getByRole("button", { name: "Manage cash source" }));
  expect(screen.queryByRole("button", { name: "Use corrected standard names" })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps draft name corrections after a refresh failure and never relabels old amounts as newly saved", async () => {
  render(<BudgetCashPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage cash source" }));
  fireEvent.change(screen.getByLabelText("NXT fund name for JU Parents Fund"), { target: { value: "Named Scholarship" } });
  expect(screen.getByText("Matches 1 saved fund: Named Scholarship (ID 102).")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox"));
  fetch.mockResolvedValueOnce(json({ error: "NXT unavailable; previous totals are unchanged." }, false, 503));
  fireEvent.click(screen.getByRole("button", { name: "Save cash source and refresh" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("NXT fund name for JU Parents Fund")).toHaveValue("Named Scholarship");
  expect(screen.getByRole("row", { name: /JU Parents Fund No matching fund/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "Save cash source and refresh" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});
