import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Family from "./LifetimeFamilyGroups";
import { lifetimeFamilyPreviewFixture } from "../../../../../test/lifetimeFamilyPreviewFixture";

const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async url => json(lifetimeFamilyPreviewFixture(Object.fromEntries(new URL(url, "https://test.invalid").searchParams))))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const ready = () => waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
const person = { id: "1", lookupId: "D-1", name: "Morgan Example", constituentType: "individual" };
const spouse = { ...person, id: "2", lookupId: "D-2", name: "Taylor Example" };
const org = { id: "9", lookupId: "F-9", name: "Example Family Foundation", recordKey: "o".repeat(64), constituentType: "organization" };
const household = { id: "base", automatic: true, members: [person, spouse], rows: [{ recordKey: "h".repeat(64), name: "Morgan & Taylor Example", archived: false }] };
const snapshot = { rows: [org, { ...org, societyKey: "other" }], sharedGroups: [household], giftReviewAvailable: true };
const link = { key: "l".repeat(64), householdKey: household.rows[0].recordKey, organizationKey: org.recordKey, householdName: household.rows[0].name, organizationName: org.name, matched: true };
const props = () => ({ snapshot, links: [], canManage: true, busy: false, revision: "one", request: {}, onOpen: vi.fn(), onClose: vi.fn(), onCommand: vi.fn().mockResolvedValue(true) });
function choose() {
  fireEvent.change(screen.getByLabelText("Household"), { target: { value: household.rows[0].recordKey } });
  fireEvent.change(screen.getByLabelText("Foundation or organization"), { target: { value: org.recordKey } });
}

it("requires exact choices and explicit full-giving consent before submitting only saved keys", async () => {
  const p = props(); render(<Family {...p} />);
  expect(screen.getByRole("region", { name: "Link foundation to household" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
  choose();
  expect(screen.getByText(/even those not soft credited/)).toBeVisible();
  expect(screen.getByText(/not copied to the new group/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
  await ready();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm family link" }));
  await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce());
  expect(p.onCommand).toHaveBeenCalledExactlyOnceWith("link-family", { householdKey: household.rows[0].recordKey, recordKey: org.recordKey });
});

it("cancel never submits and changing records or revision clears the full-giving consent", async () => {
  const p = props(); const { rerender } = render(<Family {...p} />); choose(); await ready(); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Household"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Household"), { target: { value: household.rows[0].recordKey } });
  await ready(); expect(screen.getByRole("checkbox")).not.toBeChecked(); fireEvent.click(screen.getByRole("checkbox"));
  rerender(<Family {...p} revision="two" />); expect(screen.getByRole("checkbox")).not.toBeChecked();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(p.onClose).toHaveBeenCalledOnce(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("preselects a row shortcut but never consents automatically", async () => {
  const p = props(); render(<Family {...p} request={{ recordKey: org.recordKey, householdKey: household.rows[0].recordKey }} />);
  expect(screen.getByLabelText("Foundation or organization")).toHaveValue(org.recordKey);
  await ready();
  expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("does not close or discard the form after a failed save", async () => {
  const p = props(); p.onCommand.mockResolvedValue(false); render(<Family {...p} />); choose();
  await ready();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm family link" }));
  await waitFor(() => expect(p.onCommand).toHaveBeenCalledOnce()); expect(p.onClose).not.toHaveBeenCalled();
});

it("prevents reassigning an already linked foundation, even when the link needs review", () => {
  const p = props(); render(<Family {...p} links={[{ ...link, matched: false }]} />); choose();
  expect(screen.getByText(/already linked to/)).toBeVisible(); expect(screen.getByText(/This family group is not combined/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled(); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("shows viewers saved family links but no mutation controls", () => {
  const p = props(); render(<Family {...p} links={[link]} canManage={false} />);
  expect(screen.getByRole("heading", { name: `${link.householdName} + ${link.organizationName}` })).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("requires confirmation to unlink, allows cancellation, and preserves unrelated links", async () => {
  const p = props(); render(<Family {...p} request={null} links={[link]} />);
  fireEvent.click(screen.getByRole("button", { name: "Unlink organization" }));
  expect(screen.getByText(/Other links and all gift credit remain/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep linked" })); expect(p.onCommand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Unlink organization" })); fireEvent.click(screen.getByRole("button", { name: "Confirm unlink" }));
  await waitFor(() => expect(p.onCommand).toHaveBeenCalledExactlyOnceWith("unlink-family", { familyLinkKey: link.key }));
});

it("disables mutation and scope controls while another operation is running", () => {
  const p = props(); render(<Family {...p} busy links={[link]} />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
});

it("blocks missing evidence and targets missing from the saved report", () => {
  const p = props(); render(<Family {...p} snapshot={{ ...snapshot, giftReviewAvailable: false, sharedGroups: [] }} />);
  expect(screen.getByText(/First confirm an individual household/)).toBeVisible(); expect(screen.getByText(/Refresh gift history once/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
});

it("paginates saved links and resets page and pending unlink when searching", () => {
  const p = props(), links = Array.from({ length: 11 }, (_, i) => ({ ...link, key: String(i), organizationName: `Foundation ${i}` }));
  render(<Family {...p} links={links} request={null} />);
  expect(screen.getAllByRole("button", { name: "Unlink organization" })).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Next family links" }));
  expect(screen.getAllByRole("button", { name: "Unlink organization" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Unlink organization" }));
  fireEvent.change(screen.getByLabelText("Find a family link"), { target: { value: "Foundation 0" } });
  expect(screen.queryByRole("button", { name: "Confirm unlink" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Foundation 0$/ })).toBeVisible(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("shows the recognition equation, not revenue, and an expandable shared gift ledger before saving", async () => {
  const p = props(); render(<Family {...p} />); choose(); await ready();
  for (const amount of ["$80,000.00", "$110,000.00", "$60,000.00", "$130,000.00"]) expect(screen.getByText(amount, { exact: true })).toBeVisible();
  expect(screen.getByText(/Recognition is not cash received/)).toBeVisible();
  expect(screen.getByText(/provisional, not confirmed/)).toBeVisible();
  fireEvent.click(screen.getByText("Shared gift records: 1"));
  expect(screen.getByText("Gift 101")).toBeVisible(); expect(screen.getByText(/counted once$/)).toBeVisible();
  expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  expect(fetch.mock.calls[0][1].method).toBeUndefined(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("shows supported partial amounts without a false zero or overlap deduction", async () => {
  const value = lifetimeFamilyPreviewFixture(); value.existingOrganizations = [{ name: "Previously linked foundation" }];
  value.societies[0].combined = { totalCents: null, supportedCents: 8000000, date: null, status: "review", reasons: ["Pledge needs reconciliation"] };
  value.societies[0].organization = { totalCents: null, supportedCents: null }; value.societies[0].overlapCents = null;
  fetch.mockResolvedValue(json(value)); const p = props(); render(<Family {...p} />); choose(); await ready();
  expect(screen.getByText(/Already linked and still included: Previously linked foundation/)).toBeVisible();
  expect(screen.getByText(/supported so far; not a complete total/)).toBeVisible(); expect(screen.getByText("Not yet fully reconciled")).toBeVisible();
  expect(screen.queryByText("$0.00")).not.toBeInTheDocument(); expect(screen.getByText(/Not ready to confirm/)).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox")); expect(screen.getByRole("button", { name: "Confirm family link" })).toBeEnabled();
  expect(p.onCommand).not.toHaveBeenCalled();
});

it("gates consent during loading and ignores a late response for a different selection", async () => {
  let finish; fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const p = props(); render(<Family {...p} />); choose();
  expect(screen.getByRole("checkbox")).toBeDisabled(); expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
  const signal = fetch.mock.calls[0][1].signal;
  fireEvent.change(screen.getByLabelText("Foundation or organization"), { target: { value: "" } });
  expect(signal.aborted).toBe(true);
  await act(async () => finish(json(lifetimeFamilyPreviewFixture())));
  expect(screen.queryByText("$130,000.00")).not.toBeInTheDocument(); expect(p.onCommand).not.toHaveBeenCalled();
});

it.each([401, 403, 409, 503])("keeps save blocked after a preview error and provides a safe next action (%s)", async status => {
  fetch.mockResolvedValueOnce(json({ error: "Preview unavailable" }, status));
  const p = { ...props(), onAccessDenied: vi.fn(), onReload: vi.fn() }; render(<Family {...p} />); choose();
  await screen.findByRole("alert"); expect(screen.getByRole("checkbox")).toBeDisabled(); expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
  if ([401, 403].includes(status)) expect(p.onAccessDenied).toHaveBeenCalledWith("Preview unavailable");
  else if (status === 409) { fireEvent.click(screen.getByRole("button", { name: "Reload saved report" })); expect(p.onReload).toHaveBeenCalledOnce(); }
  else { fireEvent.click(screen.getByRole("button", { name: "Retry saved preview" })); await ready(); expect(screen.getByRole("checkbox")).not.toBeChecked(); }
  expect(p.onCommand).not.toHaveBeenCalled();
});

it("rejects a mismatched successful preview response", async () => {
  fetch.mockResolvedValue(json(lifetimeFamilyPreviewFixture({ revision: "wrong" })));
  const p = props(); render(<Family {...p} />); choose();
  expect(await screen.findByRole("alert")).toHaveTextContent("did not match this selection");
  expect(screen.queryByText("$130,000.00")).not.toBeInTheDocument(); expect(screen.getByRole("checkbox")).toBeDisabled(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("times out a hung preview, aborts it and allows a read-only retry", async () => {
  vi.useFakeTimers(); fetch.mockImplementationOnce(() => new Promise(() => {}));
  const p = props(); render(<Family {...p} />); choose();
  await act(async () => vi.advanceTimersByTime(20000));
  expect(screen.getByRole("alert")).toHaveTextContent("took too long"); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(screen.getByRole("button", { name: "Retry saved preview" })).toBeEnabled(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("paginates shared records with consent blocked until the matching saved page returns", async () => {
  const value = lifetimeFamilyPreviewFixture(); value.sharedGifts = { ...value.sharedGifts, total: 21, pages: 2 };
  fetch.mockResolvedValueOnce(json(value)).mockResolvedValueOnce(json({ ...value, sharedGifts: { ...value.sharedGifts, page: 1, items: [{ giftId: "121", recognition: [] }] } }));
  const p = props(); render(<Family {...p} />); choose(); await ready();
  fireEvent.click(screen.getByText("Shared gift records: 21")); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Next shared gifts" })); expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
  await ready(); expect(screen.getByText("Gift 121")).toBeVisible(); expect(screen.getByRole("checkbox")).toBeChecked();
  expect(new URL(fetch.mock.calls[1][0], "https://test.invalid").searchParams.get("page")).toBe("1"); expect(p.onCommand).not.toHaveBeenCalled();
});
