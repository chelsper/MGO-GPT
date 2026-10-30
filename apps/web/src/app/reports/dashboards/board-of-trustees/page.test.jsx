import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, action }) => <header><h1>{title}</h1>{action}</header> }));
import Page from "./page";
import { BOARD_DEFAULT_SOURCES, BOARD_MEMBERSHIP_RULE, BOARD_SERVICE_COLUMNS, BOARD_INITIAL_SOURCE as source } from "@/utils/boardTrustees";
const previousSource = BOARD_DEFAULT_SOURCES[1];
const snapshot = { cashCents: 100000, commitmentCents: 400000, trusteeCount: 2, rawRows: 3, duplicateRows: 1, missingAmountCount: 0,
  eligibility: { rule: BOARD_MEMBERSHIP_RULE, candidateCount: 2, includedCount: 2, excludedCount: 0, reviewCount: 0, openAndFormerCount: 0, excluded: [], needsReview: [] },
  refreshedAt: "2026-10-29T12:00:00Z", warnings: ["Review membership dates in the query."], credit: { soft: "Both", matching: "Both" },
  trustees: [{ id: "1", name: "Example Trustee", cashCents: 100000, commitmentCents: 400000 }, { id: "2", name: "Zero Giving Trustee", cashCents: 0, commitmentCents: 0 }] };
const saved = { revision: "one", canManage: true, title: "Board of Trustees", years: [{ source, snapshot }] };
const json = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(saved))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens saved credit totals and a searchable roster without executing NXT", async () => {
  render(<Page />); await screen.findByText("Example Trustee");
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(screen.getByText("Zero Giving Trustee")).toBeVisible();
  fireEvent.click(screen.getByText("Source and counting rules"));
  expect(screen.getByText(/not unduplicated campaign revenue/)).toBeVisible();
  fireEvent.click(screen.getByText(/Check roster criteria:/));
  expect(screen.getByText("Review membership dates in the query.")).toBeVisible();
  const totals = within(screen.getByRole("region", { name: "FY27 giving totals" }));
  expect(totals.getByText("50%")).toBeVisible();
  expect(totals.getByText("1 of 2 included trustees with positive cash giving")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Find a trustee"), { target: { value: "Zero" } });
  expect(screen.queryByText("Example Trustee")).not.toBeInTheDocument();
  expect(totals.getByText("$1,000.00")).toBeVisible();
  expect(totals.getByText("50%")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("switches rosters by fiscal year without applying the present roster to the past", async () => {
  fetch.mockResolvedValue(json({ ...saved, years: [...saved.years, { source: previousSource,
    snapshot: { ...snapshot, trustees: [{ id: "3", name: "Former Trustee", cashCents: 100, commitmentCents: 0 }], trusteeCount: 1 } }] }));
  render(<Page />); await screen.findByText("Example Trustee");
  expect(screen.getByText("-50 percentage points vs FY26")).toBeVisible();
  const history = within(screen.getByRole("region", { name: "Fiscal-year comparison table" }));
  expect(history.getByText("Year to date")).toBeVisible();
  expect(history.getByText("Completed fiscal year")).toBeVisible();
  expect(history.getByText("1 / 1")).toBeVisible();
  expect(screen.getByText(/not a same-period comparison/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Fiscal year"), { target: { value: "2026" } });
  expect(screen.getByText("Former Trustee")).toBeVisible(); expect(screen.queryByText("Example Trustee")).not.toBeInTheDocument();
  expect(screen.getByText("July 1, 2025 through June 30, 2026")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(BOARD_DEFAULT_SOURCES.slice(1))("preconfigures $fiscalYear query $queryId without refreshing FY27", async preset => {
  const year = String(preset.fiscalYear), label = `FY${year.slice(-2)}`;
  render(<Page />); await screen.findByText("Example Trustee");
  fireEvent.change(screen.getByLabelText("Fiscal year"), { target: { value: year } });
  expect(screen.getByText(new RegExp(`${preset.queryName}, query ${preset.queryId}`))).toBeVisible();
  expect(screen.queryByText("Example Trustee")).not.toBeInTheDocument();
  expect(screen.queryByText("0%")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Manage fiscal years" }));
  expect(screen.getByLabelText("NXT query system record ID")).toHaveValue(preset.queryId);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByLabelText("Fiscal year")).toHaveValue(year);
  fetch.mockResolvedValueOnce(json({ ...saved, years: [...saved.years, { source: preset, snapshot }] }));
  fireEvent.click(screen.getByRole("button", { name: `Refresh ${label}` }));
  await screen.findByText("Example Trustee");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "refresh", input: preset, revision: "one" });
});
it("offers all eleven years before refresh without running queries or showing false zeroes", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, revision: null, years: [] }));
  render(<Page />); await screen.findByRole("button", { name: "Refresh FY27" });
  expect(within(screen.getByLabelText("Fiscal year")).getAllByRole("option").map(option => option.value))
    .toEqual(["2027", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017"]);
  const history = within(screen.getByRole("region", { name: "Fiscal-year comparison table" }));
  expect(history.getAllByRole("button")).toHaveLength(11);
  fireEvent.click(history.getByRole("button", { name: "FY17", exact: true }));
  expect(screen.getByLabelText("Fiscal year")).toHaveValue("2017");
  expect(screen.getByText("July 1, 2016 through June 30, 2017")).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh FY17" })).toBeEnabled();
  expect(screen.queryByText("0%")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves a saved source override rather than replacing it with a newly added default", async () => {
  const custom = { ...BOARD_DEFAULT_SOURCES.at(-1), queryId: "30000", queryName: "Custom FY17 trustees" };
  fetch.mockResolvedValueOnce(json({ ...saved, years: [...saved.years, { source: custom, snapshot }] }));
  render(<Page />); await screen.findByText("Example Trustee");
  fireEvent.change(screen.getByLabelText("Fiscal year"), { target: { value: "2017" } });
  expect(screen.getByText("2 eligible trustees / Custom FY17 trustees / Query 30000")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Manage fiscal years" }));
  expect(screen.getByLabelText("NXT query system record ID")).toHaveValue("30000");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh FY17" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body).input).toEqual(custom);
});
it("shows pledge-only trustees by name without counting them as cash participants", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, years: [{ source, snapshot: { ...snapshot, cashCents: 0, trustees: snapshot.trustees.map(row => ({ ...row, cashCents: 0 })) } }] }));
  render(<Page />); await screen.findByText("Example Trustee");
  expect(within(screen.getByRole("region", { name: "FY27 giving totals" })).getByText("0%")).toBeVisible();
  const row = screen.getByText("Example Trustee").closest("tr");
  expect(within(row).getByText("$4,000.00")).toBeVisible();
  expect(within(row).getByText("No positive cash")).toBeVisible();
});
it("starts with FY27 query 31092, distinguishing unrefreshed from zero", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, revision: null, years: [] }));
  render(<Page />); await screen.findByRole("button", { name: "Refresh FY27" });
  expect(screen.getAllByText("Not refreshed")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Refresh FY27" }));
  await screen.findByText("Example Trustee");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "refresh", input: source, revision: null });
});
it("preserves approved saved results on refresh failures and reloads conflicts without losing drafts", async () => {
  render(<Page />); await screen.findByText("Example Trustee");
  fetch.mockResolvedValueOnce(json({ error: "The query changed. Previous results are unchanged." }, 409));
  fireEvent.click(screen.getByRole("button", { name: "Refresh FY27" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Previous results");
  expect(screen.getByText("Example Trustee")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Manage fiscal years" }));
  fireEvent.change(screen.getByLabelText("Fiscal year ending"), { target: { value: "2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Reload saved results" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Fiscal year ending")).toHaveValue(2026);
});
it("loads aliases and saves a different fiscal year without reusing the FY27 query", async () => {
  render(<Page />); await screen.findByText("Example Trustee");
  fireEvent.click(screen.getByRole("button", { name: "Manage fiscal years" }));
  fireEvent.change(screen.getByLabelText("Fiscal year ending"), { target: { value: "2026" } });
  fireEvent.change(screen.getByLabelText("NXT query system record ID"), { target: { value: "30000" } });
  expect(screen.getByRole("button", { name: "Save year and refresh" })).toBeDisabled();
  const previousSource = { fiscalYear: 2026, queryId: "30000", queryName: "FY26 trustees", columns: { name: "Name", cash: "FY26 Cash", commitments: "FY26 Pledges Planned Gifts", ...BOARD_SERVICE_COLUMNS } };
  fetch.mockResolvedValueOnce(json({ ...previousSource, fields: Object.values(previousSource.columns), suggested: previousSource.columns, warnings: [] }));
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" }));
  await screen.findByText("FY26 trustees");
  fetch.mockResolvedValueOnce(json({ ...saved, years: [...saved.years, { source: previousSource, snapshot }] }));
  fireEvent.click(screen.getByRole("button", { name: "Save year and refresh" }));
  await waitFor(() => expect(screen.getByLabelText("Fiscal year")).toHaveValue("2026"));
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ operation: "refresh", input: previousSource, revision: "one" });
  expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
});
it("Cancel returns to the same year's dashboard without saving or querying", async () => {
  render(<Page />); await screen.findByText("Example Trustee");
  fireEvent.click(screen.getByRole("button", { name: "Manage fiscal years" }));
  fireEvent.change(screen.getByLabelText("Fiscal year ending"), { target: { value: "2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByLabelText("Fiscal year")).toHaveValue("2027");
  expect(screen.getByText("Example Trustee")).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("hides edits from viewers and clears donor data when access is revoked", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, canManage: false }));
  render(<Page />); await screen.findByText("Example Trustee");
  expect(screen.queryByRole("button", { name: "Manage fiscal years" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh FY27" })).not.toBeInTheDocument();
  cleanup(); render(<Page />); await screen.findByText("Example Trustee");
  fetch.mockResolvedValueOnce(json({ error: "Access revoked" }, 403));
  fireEvent.click(screen.getByRole("button", { name: "Refresh FY27" }));
  await screen.findByRole("alert"); expect(screen.queryByText("Example Trustee")).not.toBeInTheDocument();
});
it("paginates a long list without truncating totals and preserves unknown amounts", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, years: [{ source, snapshot: { ...snapshot, trusteeCount: 51, missingAmountCount: 1, cashCents: null,
    trustees: Array.from({ length: 51 }, (_, index) => ({ id: String(index + 1), name: `Trustee ${String(index).padStart(2, "0")}`, cashCents: index === 50 ? null : 0, commitmentCents: 0 })) } }] }));
  render(<Page />); await screen.findByText("Trustee 00");
  expect(screen.getByText("1-50 of 51 trustees")).toBeVisible();
  const totals = within(screen.getByRole("region", { name: "FY27 giving totals" }));
  expect(totals.getByText("Unavailable")).toBeVisible();
  expect(totals.getByText(/1 cash amounts not reported/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Trustee 50")).toBeVisible(); expect(screen.getAllByText("Not reported")).toHaveLength(2);
  expect(screen.getByText("Cash not reported")).toBeVisible();
});
it("shows service decisions and the blank Trustee / Former exception without silently changing eligibility", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, years: [{ source, snapshot: { ...snapshot, cashCents: null, commitmentCents: null,
    eligibility: { ...snapshot.eligibility, candidateCount: 4, openAndFormerCount: 1, excludedCount: 1, reviewCount: 1,
      excluded: [{ id: "3", name: "Ended Earlier", status: "excluded", reason: "Trustee service ended before this fiscal year", serviceRecords: [{ code: "Trustee", start: "2000", end: "2020" }] }],
      needsReview: [{ id: "4", name: "Missing Start", status: "review", reason: "Complete Trustee service dates are needed", serviceRecords: [{ code: "Trustee", start: "", end: "1/31/2027" }] }] } } }] }));
  render(<Page />); await screen.findByText("Example Trustee");
  expect(screen.getByText(/1 included trustees also have a Trustee-Former/)).toBeVisible();
  expect(screen.getByText(/1 service-date decisions need review/)).toBeVisible();
  expect(within(screen.getByRole("region", { name: "FY27 giving totals" })).getByText("Unavailable")).toBeVisible();
  expect(screen.getByText("Missing Start")).toBeVisible();
  expect(screen.getByText("Ended Earlier")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Find an eligibility decision"), { target: { value: "Missing" } });
  expect(screen.queryByText("Ended Earlier")).not.toBeInTheDocument();
  expect(screen.getByText("Example Trustee")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([undefined, "trustee-service-six-months-v1"])("requires a refresh before showing snapshots using outdated rule %s", async rule => {
  const oldSnapshot = { ...snapshot, eligibility: rule ? { ...snapshot.eligibility, rule } : undefined };
  fetch.mockResolvedValueOnce(json({ ...saved, years: [{ source, snapshot: oldSnapshot }] }));
  render(<Page />); await screen.findByText(/Previous-rule figures are not shown/);
  expect(screen.getByText(/including the start-date check/)).toBeVisible();
  expect(screen.queryByText("Example Trustee")).not.toBeInTheDocument();
  expect(screen.queryByText("50%")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh FY27" })).toBeEnabled();
});
