import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, action }) => <header><h1>{title}</h1>{action}</header> }));
vi.mock("./BudgetCashPanel", () => ({ default: () => <section aria-label="Independent budget cash panel" /> }));
vi.mock("./UnrestrictedGoalSummary", () => ({ default: () => <section aria-label="Unrestricted revenue goal" /> }));
import Page from "./page";
const source = { queryId: "31074", queryName: "Eligible gifts", columns: { giftId: "System Record ID", amount: "Gift Amount" }, projection: "remaining", confirmed: true };
const saved = { revision: "one", title: "FY Revenue Goals", canManage: true, source,
  snapshot: { receivedCents: 100000, projectedCents: 90000, giftCount: 12, rawRows: 13, duplicateRows: 1, refreshedAt: "2026-10-19T12:00:00Z" } };
const json = (data, ok = true) => ({ ok, json: async () => data });
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(saved))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("opens saved totals without querying NXT and labels the formula", async () => {
  render(<Page />);
  expect(await screen.findByText("$1,000.00")).toBeVisible(); expect(screen.getByText("$900.00")).toBeVisible();
  expect(screen.getByRole("region", { name: "Independent budget cash panel" })).toBeInTheDocument();
  expect(screen.getByText("Eligible gifts received minus 10% (90% remaining).")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(screen.queryByRole("button", { name: "Load query fields" })).not.toBeInTheDocument();
});
it("uses a single explicit refresh with saved settings and preserves totals on failure", async () => {
  render(<Page />); await screen.findByText("$900.00");
  fetch.mockResolvedValueOnce(json({ error: "Query unavailable; previous totals are unchanged." }, false));
  fireEvent.click(screen.getByRole("button", { name: "Refresh totals" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("previous totals");
  expect(screen.getByText("$900.00")).toBeVisible();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "refresh", revision: "one", input: source });
});
it("keeps unknown totals distinct from zero, loads mappings, and saves only on confirmation", async () => {
  fetch.mockResolvedValueOnce(json({ revision: null, source: null, snapshot: null, canManage: true }));
  render(<Page />); await screen.findByRole("button", { name: "Load query fields" });
  expect(screen.getAllByText("Not refreshed")).toHaveLength(2);
  expect(screen.getByLabelText("Projected re-investment calculation")).toHaveValue("set_aside");
  expect(screen.getByRole("button", { name: "Save source and refresh totals" })).toBeDisabled();
  fetch.mockResolvedValueOnce(json({ fields: ["System Record ID", "Gift Amount"], queryName: source.queryName, suggested: source.columns }));
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" }));
  await waitFor(() => expect(screen.getByLabelText("Gift system record ID")).toHaveValue("System Record ID"));
  fireEvent.click(screen.getByRole("checkbox"));
  fetch.mockResolvedValueOnce(json({ ...saved, source: { ...source, projection: "set_aside" }, snapshot: { ...saved.snapshot, projectedCents: 10000 } }));
  fireEvent.click(screen.getByRole("button", { name: "Save source and refresh totals" }));
  expect(await screen.findByText("$100.00")).toBeVisible();
  expect(JSON.parse(fetch.mock.calls[2][1].body).input).toMatchObject({ ...source, projection: "set_aside" });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("hides configuration and refresh from shared viewers", async () => {
  fetch.mockResolvedValue(json({ ...saved, canManage: false }));
  render(<Page />); await screen.findByText("$900.00");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("removes saved figures if access is revoked", async () => {
  render(<Page />); await screen.findByText("$900.00");
  fetch.mockResolvedValueOnce({ ...json({ error: "No longer shared." }, false), status: 403 });
  fireEvent.click(screen.getByRole("button", { name: "Refresh totals" }));
  await screen.findByRole("alert"); expect(screen.queryByText("$900.00")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Manage source" })).not.toBeInTheDocument();
});
it("retains a setup draft and recovers the latest revision after a conflict", async () => {
  render(<Page />); await screen.findByText("$900.00");
  fireEvent.click(screen.getByRole("button", { name: "Manage source" }));
  fireEvent.change(screen.getByLabelText("Projected re-investment calculation"), { target: { value: "set_aside" } });
  fetch.mockResolvedValueOnce(json({ error: "Another refresh finished first. Reload saved totals." }, false));
  fireEvent.click(screen.getByRole("button", { name: "Refresh totals" }));
  await screen.findByRole("alert");
  fetch.mockResolvedValueOnce(json({ ...saved, revision: "newer" }));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved totals" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Projected re-investment calculation")).toHaveValue("set_aside");
});
