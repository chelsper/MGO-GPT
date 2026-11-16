import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title }) => <h1>{title}</h1> }));
import Page from "./page";
import { lifetimeRules } from "../../../../../test/lifetimeQueryFixture";
const inspection = { ready: true, checks: [{ key: "id", label: "Constituent system record ID", required: true, column: "Person ID" }], warnings: ["Calculated dates are provisional."] };
const row = { id: '["system","1"]', systemId: "1", lookupId: "D-1", name: "Fictional Donor", constituentType: "individual", societyKey: "1934_club", societyName: "1934 Club", thresholdCents: 10000000,
  totalCents: 10000000, date: "2020-07-01", status: "provisional", reasons: [], crossingGiftIds: ["101"] };
const snapshot = { refreshedAt: "2026-11-16T12:00:00Z", source: inspection, rows: [row, { ...row, id: "2", name: "Fictional Review Donor", date: null,
  totalCents: null, status: "review", reasons: ["Pledge history needs reconciliation."], crossingGiftIds: [] }], peopleCount: 2, rawRows: 3, repeatedRows: 1, provisionalCount: 1, reviewCount: 1 };
const saved = { revision: "saved", title: "Lifetime Giving Societies", canManage: true, societies: lifetimeRules, snapshot };
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(saved))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("opens saved history and filters without NXT execution", async () => {
  render(<Page />); await screen.findByText("Fictional Donor");
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(screen.getByText("Fictional Review Donor")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Review status"), { target: { value: "review" } });
  expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not mistake an unconfigured source for zero members and offers one-step validated refresh", async () => {
  fetch.mockResolvedValue(json({ ...saved, snapshot: null })); render(<Page />); await screen.findByText("Not imported");
  expect(screen.getByRole("button", { name: "Refresh gift history" })).toBeEnabled();
  expect(screen.getByText(/No gift history imported yet/)).toBeVisible();
});
it("distinguishes imported history from unresolved dates and outdated calculations from an empty import", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, snapshot: null, staleRules: true, previousImport: { peopleCount: 2 } }));
  render(<Page />);
  expect(await screen.findByText(/Saved history is available/)).toBeVisible();
  expect(screen.queryByText("No gift history imported yet.")).not.toBeInTheDocument();
  cleanup(); fetch.mockResolvedValue(json(saved)); render(<Page />);
  expect(await screen.findByText("History imported: 2 constituents")).toBeVisible();
  expect(screen.getByText(/this is not an import failure/)).toBeVisible();
});
it("requires explicit group confirmation, can cancel without writing, and does not hide unconfirmed members", async () => {
  const members = [{ id: row.id, name: row.name, lookupId: row.lookupId, constituentType: "individual" },
    { id: "2", name: "Fictional Review Donor", lookupId: "D-2", constituentType: "individual" }];
  const group = { id: "a".repeat(64), sharedGiftCount: 3, members, rows: [{ ...row, id: "group:demo", name: "Fictional household", members }] };
  const withGroups = { ...saved, snapshot: { ...snapshot, sharedGroups: [group], confirmedGroupIds: [] } };
  fetch.mockResolvedValueOnce(json(withGroups)).mockResolvedValueOnce(json({ ...withGroups, revision: "new", snapshot: { ...withGroups.snapshot, confirmedGroupIds: [group.id] } }));
  render(<Page />); await screen.findByText("Fictional Donor");
  fireEvent.click(screen.getByText("Households"));
  fireEvent.click(screen.getByRole("button", { name: "Review and confirm group" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep separate" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Review and confirm group" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm household" }));
  await screen.findByText("Fictional household");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "confirm-group", revision: "saved", groupId: group.id });
  expect(screen.getByRole("status")).toHaveTextContent("1 recipients / groups");
  fireEvent.click(screen.getByLabelText("Show households instead of separate individuals"));
  expect(screen.getByText("Fictional Donor")).toBeVisible();
  expect(screen.queryByText("Fictional household")).not.toBeInTheDocument();
});
it("opens automatic spouses as a household without a write and supports an explicit keep-separate action", async () => {
  const members = [{ id: row.id, name: row.name, lookupId: row.lookupId, constituentType: "individual" },
    { id: "2", name: "Fictional Review Donor", lookupId: "D-2", constituentType: "individual" }];
  const group = { id: "a".repeat(64), automatic: true, sharedGiftCount: 0, members,
    rows: [{ ...row, id: "group:demo", name: "Fictional spouses", members, groupBasis: "spouse" }] };
  const value = { ...saved, snapshot: { ...snapshot, sharedGroups: [group], confirmedGroupIds: [] } };
  fetch.mockResolvedValueOnce(json(value)).mockResolvedValueOnce(json({ ...value, snapshot: { ...value.snapshot, separateGroupIds: [group.id] } }));
  render(<Page />); await screen.findByText("Fictional spouses");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText("NXT-linked married household / Individual")).toBeVisible();
  fireEvent.click(screen.getByText("Households"));
  expect(screen.getByText(/0 shared gifts \/ NXT-linked married spouses/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review and confirm group" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Keep spouses separate" }));
  await screen.findByText("Fictional Donor");
  expect(screen.queryByText("Fictional spouses")).not.toBeInTheDocument();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "remove-group", revision: "saved", groupId: group.id });
});
it("shows automatic grouping to viewers without offering write controls and keeps spouse-link issues distinct from gift errors", async () => {
  fetch.mockResolvedValue(json({ ...saved, canManage: false, snapshot: { ...snapshot, rows: [{ ...row, householdNote: "Spouse missing from query; kept separate." }] } }));
  render(<Page />); await screen.findByText("Fictional Donor");
  fireEvent.click(screen.getByText("Households"));
  expect(screen.getByText("1 records need spouse-link review")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Keep spouses separate" })).not.toBeInTheDocument();
  expect(screen.getByText(/Companies, foundations and other organizations stay separate/)).toBeVisible();
});
it("shows actionable missing outputs without enabling an unsafe import", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, snapshot: null })).mockResolvedValueOnce(json({ ...inspection, ready: false,
    checks: [{ key: "lookupId", label: "Constituent ID", required: true, column: "", help: "Choose Constituent > Constituent ID in NXT." }] }));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Check query outputs" }));
  expect(await screen.findByText("Choose Constituent > Constituent ID in NXT.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh gift history" })).toBeDisabled();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "fields" });
});
it("enables import using an existing lookup ID without demanding another output", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, snapshot: null })).mockResolvedValueOnce(json({ ...inspection, identityMode: "lookup",
    checks: [{ key: "constituentId", label: "Constituent system record ID (optional)", required: false, column: "" },
      { key: "lookupId", label: "Constituent ID", required: true, column: "Constituent ID" }] }));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Check query outputs" }));
  expect(await screen.findByText(/You do not need to add a constituent system record ID/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh gift history" })).toBeEnabled();
  expect(screen.queryByText("Add to NXT query output")).not.toBeInTheDocument();
});
it("labels lookup-scoped recipients correctly without exposing a fake system ID", async () => {
  fetch.mockResolvedValue(json({ ...saved, snapshot: { ...snapshot, source: { ...inspection, identityMode: "lookup" },
    rows: [{ ...row, id: '["lookup","00123"]', systemId: null, lookupId: "00123" }] } }));
  render(<Page />); expect(await screen.findByText("Constituent ID 00123")).toBeVisible();
  expect(screen.queryByText(/System ID/)).not.toBeInTheDocument();
  expect(screen.queryByText('["lookup","00123"]')).not.toBeInTheDocument();
});
it("keeps saved results visible during failures and submits only one refresh", async () => {
  let resolve; fetch.mockResolvedValueOnce(json(saved)).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Refresh gift history" }));
  const pending = screen.getByRole("button", { name: "Importing history..." }); fireEvent.click(pending); expect(pending).toBeDisabled();
  expect(screen.getByText("Fictional Donor")).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(2);
  resolve(json({ error: "NXT is temporarily unavailable." }, 503));
  expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable"); expect(screen.getByText("Fictional Donor")).toBeVisible();
});
it("clears donor data when access is revoked", async () => {
  fetch.mockResolvedValueOnce(json(saved)).mockResolvedValueOnce(json({ error: "Not shared" }, 403));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Check query outputs" }));
  await screen.findByRole("alert"); await waitFor(() => expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument());
});
it("does not expose refresh actions to read-only viewers", async () => {
  fetch.mockResolvedValue(json({ ...saved, canManage: false })); render(<Page />); await screen.findByText("Fictional Donor");
  expect(screen.queryByRole("button", { name: "Check query outputs" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh gift history" })).not.toBeInTheDocument();
});
it("switches society and constituent views locally with accurate distinct counts and a clear reset", async () => {
  fetch.mockResolvedValue(json({ ...saved, snapshot: { ...snapshot, rows: [row,
    { ...row, societyKey: lifetimeRules[1].key, societyName: lifetimeRules[1].name },
    { ...row, id: "2", name: "Fictional Organization", constituentType: "organization" },
    { ...row, id: "3", name: "Fictional Unclassified", constituentType: "unknown" }] } }));
  render(<Page />); await screen.findByText("Fictional Organization");
  expect(screen.getByRole("status")).toHaveTextContent("4 threshold checks for 3 constituents");
  fireEvent.click(screen.getByRole("button", { name: /Frances Bartlett Kinne Society/ }));
  expect(screen.getByRole("button", { name: /Frances Bartlett Kinne Society/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("1 threshold check for 1 constituent");
  expect(screen.queryByText("Fictional Organization")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /1934 Club/ }));
  fireEvent.change(screen.getByLabelText("Constituent type"), { target: { value: "organization" } });
  expect(screen.getByText("Fictional Organization")).toBeVisible();
  expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View unclassified" }));
  expect(screen.getByText("Fictional Unclassified")).toBeVisible();
  expect(screen.queryByText("Fictional Organization")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("status")).toHaveTextContent("4 threshold checks for 3 constituents");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("shows missing type guidance without presenting unknowns as individuals", async () => {
  fetch.mockResolvedValue(json({ ...saved, snapshot: { ...snapshot, rows: [{ ...row, constituentType: undefined }] } }));
  render(<Page />); await screen.findByText("Fictional Donor");
  expect(screen.getByText(/no confirmed type/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Constituent type"), { target: { value: "individual" } });
  expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument();
  expect(screen.getByText("No history matches these filters.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Export filtered history (CSV)" })).toBeDisabled();
});
it("resets pagination on filters and exports the entire selected view, not just the current page", async () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ ...row, id: String(i), name: `Fictional Donor ${i}`, constituentType: i < 60 ? "individual" : "organization" }));
  fetch.mockResolvedValue(json({ ...saved, snapshot: { ...snapshot, rows } }));
  const create = vi.fn().mockReturnValue("blob:fictional"), revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  const contents = [];
  vi.stubGlobal("Blob", class { constructor(parts) { contents.push(parts.join("")); } });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    render(<Page />); await screen.findByText("Fictional Donor 0");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Fictional Donor 50")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Constituent type"), { target: { value: "individual" } });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    const coverage = screen.getByRole("region", { name: "Filtered history coverage" });
    expect(within(coverage).getAllByText("60")).toHaveLength(2);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Export filtered history (CSV)" }));
    vi.runAllTimers();
    expect(contents[0].split("\r\n")).toHaveLength(61);
    expect(contents[0]).toContain("Fictional Donor 59"); expect(contents[0]).not.toContain("Fictional Donor 60");
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); click.mockRestore(); }
});
