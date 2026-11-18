import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title }) => <h1>{title}</h1> }));
import Page from "./page";
import { lifetimeRules } from "../../../../../test/lifetimeQueryFixture";
import { lifetimeFamilyPreviewFixture } from "../../../../../test/lifetimeFamilyPreviewFixture";
const familyPreview = () => lifetimeFamilyPreviewFixture({ revision: "saved", householdKey: "b".repeat(64), recordKey: "9".repeat(64) });
const inspection = { ready: true, checks: [{ key: "id", label: "Constituent system record ID", required: true, column: "Person ID" }], warnings: ["Calculated dates are provisional."] };
const row = { id: '["system","1"]', systemId: "1", lookupId: "D-1", name: "Fictional Donor", constituentType: "individual", societyKey: "1934_club", societyName: "1934 Club", thresholdCents: 10000000,
  totalCents: 10000000, date: "2020-07-01", status: "provisional", reasons: [], crossingGiftIds: ["101"] };
const snapshot = { refreshedAt: "2026-11-16T12:00:00Z", source: inspection, rows: [row, { ...row, id: "2", name: "Fictional Review Donor", date: null,
  totalCents: null, status: "review", reasons: ["Pledge history needs reconciliation."], crossingGiftIds: [] }], peopleCount: 2, rawRows: 3, repeatedRows: 1, provisionalCount: 1, reviewCount: 1 };
const saved = { revision: "saved", title: "Lifetime Giving Societies", canManage: true, societies: lifetimeRules, snapshot };
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
function familyFixture(linked = false) {
  const members = [{ ...row, recordKey: "1".repeat(64) }, { ...row, id: "2", name: "Fictional Spouse", lookupId: "D-2", recordKey: "2".repeat(64) }];
  const org = { ...row, id: "9", name: "Fictional Foundation", lookupId: "F-9", recordKey: "9".repeat(64), constituentType: "organization" };
  const base = { id: "a".repeat(64), automatic: true, sharedGiftCount: 1, members, rows: [{ ...row, id: "household", name: "Fictional spouses",
    recordKey: "b".repeat(64), milestoneKey: "c".repeat(64), members, groupBasis: "spouse" }] };
  const group = { id: "f".repeat(64), family: true, baseGroupId: base.id, members: [...members, org], rows: [{ ...base.rows[0], id: "family", name: "Fictional spouses + Fictional Foundation",
    recordKey: "d".repeat(64), milestoneKey: "e".repeat(64), members: [...members, org], groupBasis: "family", constituentType: "mixed" }] };
  return { ...saved, revision: linked ? "linked" : "saved", familyLinks: linked ? [{ key: "7".repeat(64), householdKey: base.rows[0].recordKey, organizationKey: org.recordKey,
    householdName: base.rows[0].name, organizationName: org.name, matched: true }] : [], snapshot: { ...snapshot, rows: [...members, org],
      sharedGroups: linked ? [base, group] : [base], giftReviewAvailable: true } };
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(saved))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("opens from the exact household or organization and cancel returns focus without saving", async () => {
  fetch.mockResolvedValue(json(familyFixture())); render(<Page />); await screen.findByText("Fictional spouses");
  const shortcut = screen.getByRole("button", { name: "Link foundation" }); shortcut.focus(); fireEvent.click(shortcut);
  expect(screen.getByLabelText("Household")).toHaveValue("b".repeat(64));
  expect(screen.getByLabelText("Foundation or organization")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(shortcut).toHaveFocus();
  const orgButton = screen.getByRole("button", { name: "Link to household" }); orgButton.focus(); fireEvent.click(orgButton);
  expect(screen.getByLabelText("Foundation or organization")).toHaveValue("9".repeat(64));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(orgButton).toHaveFocus();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("submits a family link once with exact saved keys, shows the combined group and preserves the separate-record view", async () => {
  let finish;
  fetch.mockResolvedValueOnce(json(familyFixture())).mockResolvedValueOnce(json(familyPreview())).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<Page />); const shortcut = await screen.findByRole("button", { name: "Link foundation" }); shortcut.focus(); fireEvent.click(shortcut);
  fireEvent.change(screen.getByLabelText("Foundation or organization"), { target: { value: "9".repeat(64) } });
  await waitFor(() => expect(screen.getByLabelText(/Include all imported qualifying gifts/)).toBeEnabled());
  fireEvent.click(screen.getByLabelText(/Include all imported qualifying gifts/));
  const save = screen.getByRole("button", { name: "Confirm family link" }); fireEvent.click(save); fireEvent.click(save);
  expect(save).toBeDisabled(); expect(fetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ operation: "link-family", revision: "saved", householdKey: "b".repeat(64), recordKey: "9".repeat(64) });
  await act(async () => finish(json(familyFixture(true))));
  expect(screen.queryByRole("region", { name: "Link foundation to household" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Family giving groups" }).parentElement).toHaveFocus();
  expect(within(screen.getByRole("table")).getByText("Fictional spouses + Fictional Foundation")).toBeVisible();
  expect(within(screen.getByRole("table")).queryByText("Fictional Foundation")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Show households and family groups instead of separate records"));
  expect(within(screen.getByRole("table")).getByText("Fictional Foundation")).toBeVisible();
  expect(within(screen.getByRole("table")).getByText("Fictional Donor")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(3);
});
it.each([409, 403])("does not retry a rejected family link and handles access appropriately (%s)", async status => {
  fetch.mockResolvedValueOnce(json(familyFixture())).mockResolvedValueOnce(json(familyPreview())).mockResolvedValueOnce(json({ error: status === 409 ? "Saved history changed" : "Access removed" }, status));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Link foundation" }));
  fireEvent.change(screen.getByLabelText("Foundation or organization"), { target: { value: "9".repeat(64) } });
  await waitFor(() => expect(screen.getByLabelText(/Include all imported qualifying gifts/)).toBeEnabled());
  fireEvent.click(screen.getByLabelText(/Include all imported qualifying gifts/)); fireEvent.click(screen.getByRole("button", { name: "Confirm family link" }));
  await screen.findByRole("alert"); expect(fetch).toHaveBeenCalledTimes(3);
  if (status === 409) expect(screen.getByRole("region", { name: "Link foundation to household" })).toBeVisible();
  else { expect(screen.queryByRole("region", { name: "Family giving groups" })).not.toBeInTheDocument(); expect(screen.queryByText("Fictional spouses")).not.toBeInTheDocument(); }
});
it("opens saved history and filters without NXT execution", async () => {
  render(<Page />); await screen.findByText("Fictional Donor");
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(screen.getByText("Fictional Review Donor")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Needs investigation 1" }));
  expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("requires explicit confirmation, permits cancel, and posts only the saved milestone key", async () => {
  const value = { ...saved, snapshot: { ...snapshot, rows: [{ ...row, milestoneKey: "a".repeat(64), recordKey: "b".repeat(64) }] } };
  fetch.mockResolvedValueOnce(json(value)).mockResolvedValueOnce(json({ ...value, snapshot: { ...value.snapshot,
    rows: [{ ...value.snapshot.rows[0], status: "confirmed", confirmationNote: "Staff-confirmed entry date." }] } }));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Confirm entry date" }));
  const confirmation = screen.getByRole("region", { name: "Confirm report change" });
  expect(confirmation).toHaveTextContent("1934 Club / Jul 1, 2020");
  expect(confirmation).toHaveFocus();
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Confirm entry date" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm and keep date" }));
  await screen.findByText(/Entry date confirmed and saved/);
  expect(screen.queryByText("FY21 / Staff-confirmed")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirmed 1" }));
  expect(await screen.findByText("FY21 / Staff-confirmed")).toBeVisible();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "confirm-date", revision: "saved", milestoneKey: "a".repeat(64) });
});
it("defaults to attention, includes confirmed warnings and keeps queue counts scoped to the chosen society", async () => {
  const confirmed = { ...row, id: "3", name: "Fictional Confirmed", status: "confirmed" };
  const flagged = { ...confirmed, id: "4", name: "Fictional Changed History", reasons: ["Pledge history needs reconciliation."] };
  fetch.mockResolvedValue(json({ ...saved, snapshot: { ...snapshot, rows: [...snapshot.rows, confirmed, flagged,
    { ...confirmed, id: "5", societyKey: lifetimeRules[1].key, societyName: lifetimeRules[1].name, name: "Fictional Kinne" }] } }));
  render(<Page />); await screen.findByText("Fictional Changed History");
  expect(screen.queryByText("Fictional Confirmed")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Needs attention 3" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Ready to confirm 1" }));
  expect(screen.getByText("Fictional Donor")).toBeVisible(); expect(screen.queryByText("Fictional Changed History")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirmed 3" }));
  expect(screen.getByText("Fictional Changed History")).toBeVisible(); expect(screen.getByText("Fictional Confirmed")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Frances Bartlett Kinne Society/ }));
  expect(screen.getByRole("button", { name: "Confirmed 1" })).toBeVisible();
  expect(screen.getByText("Fictional Kinne")).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("opens saved gift details on demand and returns to the same filtered list with focus restored", async () => {
  const value = { ...saved, snapshot: { ...snapshot, rows: [{ ...row, milestoneKey: "a".repeat(64) }] } };
  fetch.mockResolvedValueOnce(json(value)).mockResolvedValueOnce(json({ available: false, message: "Refresh once to add gift details." }));
  render(<Page />); await screen.findByText(row.name);
  fireEvent.change(screen.getByLabelText("Find a constituent"), { target: { value: "Fictional Donor" } });
  const opener = screen.getByRole("button", { name: "Review gift details" }); opener.focus(); fireEvent.click(opener);
  const review = screen.getByRole("region", { name: "Gift history review" }); expect(review).toHaveFocus();
  await screen.findByText("Refresh once to add gift details.");
  expect(fetch.mock.calls[1][0]).toContain("milestoneKey=" + "a".repeat(64));
  expect(fetch.mock.calls[1][1].method).toBeUndefined();
  fireEvent.click(within(review).getByRole("button", { name: "Back to list" }));
  expect(screen.queryByRole("region", { name: "Gift history review" })).not.toBeInTheDocument();
  expect(opener).toHaveFocus(); expect(screen.getByLabelText("Find a constituent")).toHaveValue("Fictional Donor");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("removes report and evidence if gift-detail access has been revoked", async () => {
  fetch.mockResolvedValueOnce(json(saved)).mockResolvedValueOnce(json({ error: "Report access removed" }, 403));
  render(<Page />); await screen.findByText(row.name);
  fireEvent.click(within(screen.getByText(row.name).closest("tr")).getByRole("button", { name: "Review gift details" }));
  await screen.findByText("Report access removed");
  expect(screen.queryByText(row.name)).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Gift history review" })).not.toBeInTheDocument();
});
it("archives an organization only after confirmation, preserves kept credit, and exposes local archive/restore views", async () => {
  const company = { ...row, id: "3", name: "Example Matching Company", constituentType: "organization", recordKey: "c".repeat(64) };
  const value = { ...saved, snapshot: { ...snapshot, rows: [row, company] } };
  fetch.mockResolvedValueOnce(json(value)).mockResolvedValueOnce(json({ ...value, snapshot: { ...value.snapshot, rows: [row, { ...company, archived: true }] } }));
  render(<Page />); await screen.findByText(company.name);
  const companyRow = screen.getByText(company.name).closest("tr");
  fireEvent.click(within(companyRow).getByRole("button", { name: "Archive record" }));
  expect(screen.getByRole("region", { name: "Confirm report change" })).toHaveTextContent("All gifts and soft credits remain available");
  fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
  await waitFor(() => expect(screen.queryByText(company.name)).not.toBeInTheDocument());
  expect(screen.getByText(row.name)).toBeVisible(); expect(within(screen.getByText(row.name).closest("tr")).getByText("$100,000.00")).toBeVisible();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "archive-record", revision: "saved", recordKey: company.recordKey });
  fireEvent.change(screen.getByLabelText("Report visibility"), { target: { value: "archived" } });
  expect(screen.getByText(company.name)).toBeVisible(); expect(screen.getByRole("button", { name: "Restore record" })).toBeVisible();
  expect(screen.queryByText(row.name)).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledTimes(2);
});
it("shows durable decisions without a current snapshot and allows a manager to restore an absent record", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, snapshot: null, staleRules: true, savedDecisions: {
    archives: [{ key: "a".repeat(64), name: "Archived Fictional Company", matched: false }],
    milestones: [{ key: "b".repeat(64), name: "Fictional Prior Household", societyName: "1934 Club", date: "2020-01-01", matched: false }],
  } }));
  render(<Page />); fireEvent.click(await screen.findByText("Saved dates & archived records"));
  expect(screen.getAllByText(/No exact match in the current report/)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Restore record" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "restore-record", recordKey: "a".repeat(64), revision: "saved" });
});
it("does not offer date confirmation for unresolved history or any write actions to viewers", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, canManage: false }));
  render(<Page />); await screen.findByText(row.name);
  expect(screen.queryByRole("button", { name: "Confirm entry date" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Archive record" })).not.toBeInTheDocument();
  cleanup(); fetch.mockResolvedValue(json(saved)); render(<Page />);
  const review = await screen.findByText("Fictional Review Donor");
  expect(within(review.closest("tr")).queryByRole("button", { name: "Confirm entry date" })).not.toBeInTheDocument();
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
  expect(screen.getByText(/Foundations and other organizations are linked separately under Family giving groups/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Link foundation to household" })).not.toBeInTheDocument();
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

const linkedRow = { ...row, milestoneKey: "a".repeat(64), recordKey: "b".repeat(64), date: null,
  status: "review", totalCents: null, reasons: ["Pledge history needs reconciliation."], crossingGiftIds: [] };
const linkedEvidence = { available: true, counts: { all: 1, counted: 0, review: 1, excluded: 0 }, page: 0, pages: 1, total: 1,
  asOf: "2026-11-17", items: [{ giftId: "101", day: "2020-01-01", cents: 10000000, type: "Pledge", outcome: "review",
    canCheckLinked: true, reasons: ["Pledge history needs reconciliation."], notes: [], credits: [] }] };
function deferred() {
  let resolve; const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function linkedSession({ status, canManage = true, rows = [linkedRow], sharedGroups = [] } = {}) {
  let current = { ...saved, revision: "r0", canManage, snapshot: { ...snapshot, rows, sharedGroups },
    linkedCheck: status ? { seed: "101", status, reads: 5 } : null };
  const post = vi.fn();
  fetch.mockImplementation((url, options) => options.method === "POST" ? post(JSON.parse(options.body), options)
    : Promise.resolve(json(String(url).includes("?") ? { ...linkedEvidence, linkedCheck: current.linkedCheck } : current)));
  return { post, checkpoint(revision, status, changes = {}) {
    current = { ...current, revision, linkedCheck: { seed: "101", status, reads: status === "complete" ? 10 : 5 }, ...changes };
    return json(current);
  } };
}
async function openLinkedReview() {
  const mounted = render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Review gift details" }));
  await screen.findByText("Gift 101");
  return mounted;
}
it.each(["running", "paused", "attention", "complete"])("opens a saved %s check without automatically resuming or making NXT requests", async status => {
  const session = linkedSession({ status }); await openLinkedReview();
  expect(session.post).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url, options]) => url.startsWith("/api/reports/lifetime-giving-societies") && !options.method)).toBe(true);
});
it.each([
  [undefined, "Check linked history", "check-linked"], ["paused", "Continue saved check", "check-linked"],
  ["attention", "Start fresh linked check", "restart-linked"], ["complete", "Check again", "restart-linked"],
])("uses each returned revision and does not repeat restart for %s checkpoints", async (status, action, operation) => {
  const session = linkedSession({ status }), first = deferred(), second = deferred();
  session.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await openLinkedReview(); const panel = screen.getByRole("region", { name: "Gift history review" });
  fireEvent.click(screen.getByRole("button", { name: action }));
  expect(session.post.mock.calls[0][0]).toEqual({ operation, revision: "r0", giftId: "101", milestoneKey: linkedRow.milestoneKey });
  expect(screen.getByText(/Reading connected records in NXT and saving evidence in this app/)).toBeVisible();
  await act(async () => first.resolve(session.checkpoint("r1", "running")));
  expect(session.post).toHaveBeenCalledTimes(2);
  expect(session.post.mock.calls[1][0]).toEqual({ operation: "check-linked", revision: "r1", giftId: "101", milestoneKey: linkedRow.milestoneKey });
  expect(screen.getByRole("region", { name: "Gift history review" })).toBe(panel);
  expect(fetch.mock.calls.filter(([, options]) => !options.method)).toHaveLength(2);
  await act(async () => second.resolve(session.checkpoint("r2", "complete")));
  await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled());
  expect(session.post).toHaveBeenCalledTimes(2); expect(screen.getByRole("region", { name: "Gift history review" })).toBe(panel);
  expect(fetch.mock.calls.at(-1)[0]).toContain("revision=r2");
  expect(screen.queryByRole("button", { name: "Pause after current step" })).not.toBeInTheDocument();
});
it("pauses after the current checkpoint saves and continues only on request using the saved revision", async () => {
  const session = linkedSession(), first = deferred(), second = deferred();
  session.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  fireEvent.click(screen.getByRole("button", { name: "Pause after current step" }));
  expect(screen.getByRole("button", { name: "Pause after current step" })).toBeDisabled();
  expect(session.post.mock.calls[0][1].signal.aborted).toBe(false);
  await act(async () => first.resolve(session.checkpoint("paused-revision", "running")));
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue saved check" })).toBeEnabled());
  expect(session.post).toHaveBeenCalledTimes(1); expect(screen.getByText(/This saved check is not running/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Continue saved check" }));
  expect(session.post.mock.calls[1][0]).toMatchObject({ operation: "check-linked", revision: "paused-revision" });
  await act(async () => second.resolve(session.checkpoint("finished", "complete")));
  await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled());
});
it("freezes filters, queues, visibility and household controls without closing or remounting the active detail panel", async () => {
  const member = { id: row.id, name: row.name, constituentType: "individual", lookupId: "D-1" };
  const group = { id: "household", automatic: true, members: [member], sharedGiftCount: 1,
    rows: [{ ...linkedRow, name: "Fictional household", id: "group:household", members: [member], groupBasis: "spouse" }] };
  const session = linkedSession({ rows: [{ ...linkedRow, constituentType: "unknown" }], sharedGroups: [group] }), pending = deferred();
  session.post.mockReturnValue(pending.promise);
  render(<Page />); await screen.findByText("Fictional household");
  fireEvent.click(screen.getByLabelText("Show households instead of separate individuals"));
  fireEvent.change(screen.getByLabelText("Find a constituent"), { target: { value: "Fictional" } });
  fireEvent.click(screen.getByRole("button", { name: "Review gift details" })); await screen.findByText("Gift 101");
  const panel = screen.getByRole("region", { name: "Gift history review" });
  fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  for (const name of ["Find a constituent", "Constituent type", "Entry fiscal year", "Report visibility", "Show households instead of separate individuals"])
    expect(screen.getByLabelText(name)).toBeDisabled();
  for (const name of [/Both societies/, /1934 Club/, /Frances Bartlett Kinne Society/, "Needs investigation 1", "All history 1", "View unclassified", "Clear filters", "Back to list", "Review gift details", "Next", "Previous"]) {
    const button = screen.getByRole("button", { name }); expect(button).toBeDisabled(); fireEvent.click(button);
  }
  fireEvent.change(screen.getByLabelText("Find a constituent"), { target: { value: "No donor" } });
  fireEvent.change(screen.getByLabelText("Constituent type"), { target: { value: "organization" } });
  fireEvent.change(screen.getByLabelText("Report visibility"), { target: { value: "archived" } });
  fireEvent.click(screen.getByLabelText("Show households instead of separate individuals"));
  expect(screen.getByRole("region", { name: "Gift history review" })).toBe(panel);
  expect(session.post).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(session.checkpoint("r1", "complete")));
  await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled());
  expect(screen.getByRole("region", { name: "Gift history review" })).toBe(panel);
  expect(screen.getByLabelText("Find a constituent")).toHaveValue("Fictional");
  expect(screen.getByLabelText("Constituent type")).toHaveValue(""); expect(screen.getByLabelText("Report visibility")).toHaveValue("active");
  expect(screen.getByLabelText("Show households instead of separate individuals")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.queryByRole("region", { name: "Gift history review" })).not.toBeInTheDocument();
});
it.each([409, 503, "network"])("stops checkpoint writes on %s errors, keeps evidence, and never retries automatically", async status => {
  const session = linkedSession({ status: "paused" });
  if (status === "network") session.post.mockRejectedValue(new Error("Connection interrupted"));
  else session.post.mockResolvedValue(json({ error: "Checkpoint unavailable" }, status));
  await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Continue saved check" }));
  await screen.findByRole("alert"); await screen.findByText("Gift 101");
  expect(screen.getByRole("region", { name: "Gift history review" })).toBeVisible();
  expect(session.post).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Reload saved report" })).toBeEnabled();
});
it.each([401, 403])("clears report data and stops the checkpoint loop when write access fails: %s", async status => {
  const session = linkedSession(); session.post.mockResolvedValue(json({ error: "Report access removed" }, status));
  await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Gift history review" })).not.toBeInTheDocument();
  expect(screen.queryByText(row.name)).not.toBeInTheDocument(); expect(session.post).toHaveBeenCalledTimes(1);
});
it("stops a running loop if the checkpoint response removes manager permission", async () => {
  const session = linkedSession(); session.post.mockImplementation(() => Promise.resolve(session.checkpoint("r1", "running", { canManage: false })));
  await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  await screen.findByText("Gift 101");
  await waitFor(() => expect(screen.queryByRole("button", { name: "Pause after current step" })).not.toBeInTheDocument());
  expect(session.post).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Continue saved check" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Check linked history" })).not.toBeInTheDocument();
});
it("aborts a checkpoint on unmount and ignores a late running response instead of resuming", async () => {
  const session = linkedSession(), pending = deferred(); session.post.mockReturnValue(pending.promise);
  const mounted = await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  const signal = session.post.mock.calls[0][1].signal; mounted.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(session.checkpoint("r1", "running")));
  expect(session.post).toHaveBeenCalledTimes(1); expect(screen.queryByRole("region", { name: "Gift history review" })).not.toBeInTheDocument();
});
it.each(["running", "attention", "complete"])("never offers linked write actions to viewers of a %s check", async status => {
  const session = linkedSession({ status, canManage: false }); await openLinkedReview();
  for (const name of ["Check linked history", "Continue saved check", "Start fresh linked check", "Check again", "Pause after current step"])
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  expect(session.post).not.toHaveBeenCalled();
});
it.each(["paused", "attention"])("stops on a saved %s checkpoint and offers only explicit continuation", async status => {
  const session = linkedSession(); session.post.mockImplementation(() => Promise.resolve(session.checkpoint("r1", status)));
  await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  const action = status === "paused" ? "Continue saved check" : "Start fresh linked check";
  await waitFor(() => expect(screen.getByRole("button", { name: action })).toBeEnabled());
  expect(session.post).toHaveBeenCalledTimes(1); expect(fetch.mock.calls.at(-1)[0]).toContain("revision=r1");
});
it("stops at the client checkpoint limit with saved progress rather than automatically resuming", async () => {
  const session = linkedSession(); let turn = 0;
  session.post.mockImplementation(() => Promise.resolve(session.checkpoint(`r${++turn}`, "running")));
  await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue saved check" })).toBeEnabled());
  expect(session.post).toHaveBeenCalledTimes(60);
  expect(session.post.mock.calls.map(([body]) => body.revision)).toEqual(Array.from({ length: 60 }, (_, i) => `r${i}`));
  expect(fetch.mock.calls.at(-1)[0]).toContain("revision=r60");
});
it("discards a pending confirmation when rechecking and displays below-threshold review without an old date", async () => {
  const provisional = { ...linkedRow, status: "provisional", date: "2020-01-01", reasons: [] };
  const session = linkedSession({ status: "complete", rows: [provisional] }), pending = deferred();
  session.post.mockReturnValue(pending.promise);
  await openLinkedReview(); fireEvent.click(screen.getByRole("button", { name: "Review entry-date confirmation" }));
  expect(screen.getByRole("region", { name: "Confirm report change" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(screen.queryByRole("region", { name: "Confirm report change" })).not.toBeInTheDocument();
  await act(async () => pending.resolve(session.checkpoint("r1", "complete", { snapshot: { ...snapshot, rows: [{ ...linkedRow,
    reasons: ["A later reduction brought giving below this threshold. Staff must review the unconfirmed entry date."] }] } })));
  await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled());
  expect(screen.getByText(/No supported entry date yet/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Confirm entry date" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Review entry-date confirmation" })).not.toBeInTheDocument();
  expect(session.post.mock.calls[0][0].operation).toBe("restart-linked");
});
