import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Review from "./LifetimeGiftReview";
const row = { name: "Fictional Donor", societyName: "1934 Club", thresholdCents: 10000000, milestoneKey: "a".repeat(64),
  status: "review", reasons: ["Pledges, payments, write-offs or other complex gifts need linked history reconciliation."] };
const gift = { giftId: "101", day: "2020-01-01", cents: 10000000, type: "Cash", outcome: "counted", crossingGift: false,
  reasons: [], notes: [], credits: [{ kind: "Soft credit", flag: "Soft Credit Recipient", recipients: ["Fictional Donor"], treatment: "Full gift recognition considered once, not additional revenue." }] };
const result = { available: true, counts: { all: 26, counted: 25, review: 1, excluded: 0 }, items: [gift], page: 0, pages: 2, total: 26, asOf: "2026-11-17" };
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(result))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const props = () => ({ row, revision: "b".repeat(36), onClose: vi.fn(), onReload: vi.fn(), onAccessDenied: vi.fn(), canManage: true, onConfirm: vi.fn(), busy: false });
it("reads details only, explains direct versus soft credit and provides actionable linked-history guidance", async () => {
  render(<Review {...props()} />); await screen.findByText("Gift 101");
  expect(screen.getByText(/cannot yet reconcile/)).toBeVisible();
  expect(screen.getByText(/not a live NXT check/)).toBeVisible();
  fireEvent.click(screen.getByText("Credit and counting explanation"));
  expect(screen.getByText("Soft credit")).toBeVisible(); expect(screen.getByText(/not additional revenue/)).toBeVisible();
  expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" }); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(screen.queryByRole("button", { name: "Review entry-date confirmation" })).not.toBeInTheDocument();
});
it("uses saved-data pages and resets to page one when changing evidence category", async () => {
  fetch.mockResolvedValueOnce(json(result)).mockResolvedValueOnce(json({ ...result, page: 1, items: [{ ...gift, giftId: "126" }] }))
    .mockResolvedValueOnce(json({ ...result, page: 0, pages: 1, total: 0, items: [] }));
  render(<Review {...props()} />); await screen.findByText("Gift 101");
  fireEvent.click(screen.getByRole("button", { name: "Next gifts" })); await screen.findByText("Gift 126");
  expect(fetch.mock.calls[1][0]).toContain("page=1");
  expect(screen.getByRole("button", { name: "Next gifts" })).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("button", { name: "Next gifts" })); expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Excluded credits 0" })); await screen.findByText(/No gifts in this evidence category/);
  expect(fetch.mock.calls[2][0]).toContain("view=excluded&page=0"); expect(screen.queryByText("Gift 126")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous gifts" })); expect(fetch).toHaveBeenCalledTimes(3);
});
it("retains the evidence filter control and hides old-page gifts during a pending read", async () => {
  let resolve;
  fetch.mockResolvedValueOnce(json(result)).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  render(<Review {...props()} />); await screen.findByText("Gift 101");
  const filter = screen.getByRole("button", { name: "Needs reconciliation 1" }); filter.focus(); fireEvent.click(filter);
  expect(screen.getByRole("button", { name: "Needs reconciliation 1" })).toBe(filter);
  expect(filter).toHaveFocus(); expect(filter).toHaveAttribute("aria-disabled", "true"); expect(filter).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "All gifts 26" }));
  fireEvent.click(screen.getByRole("button", { name: "Next gifts" }));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Gift 101")).not.toBeInTheDocument();
  resolve(json({ ...result, items: [], total: 0 }));
  await screen.findByText(/No gifts in this evidence category/); expect(filter).toHaveFocus(); expect(filter).toHaveAttribute("aria-disabled", "false");
});
it("keeps legacy snapshots usable without automatically refreshing their history", async () => {
  fetch.mockResolvedValue(json({ available: false, message: "Refresh gift history once to capture details; saved decisions remain." }));
  render(<Review {...props()} />); await screen.findByText(/capture details/);
  expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByRole("button", { name: "Refresh gift history" })).not.toBeInTheDocument();
});
it("offers saved-report reload on stale revision without re-running the query", async () => {
  const value = props(); fetch.mockResolvedValue(json({ error: "Saved history changed." }, 409));
  render(<Review {...value} />); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reload saved report" })); expect(value.onReload).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("retries a failed read only on request and never displays previous page details as current", async () => {
  fetch.mockResolvedValueOnce(json({ error: "Try later" }, 503)).mockResolvedValueOnce(json(result));
  render(<Review {...props()} />); await screen.findByRole("alert"); expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry saved details" })); await screen.findByText("Gift 101");
  expect(fetch).toHaveBeenCalledTimes(2); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("discards late responses after the panel closes", async () => {
  let resolve; fetch.mockImplementation(() => new Promise(r => { resolve = r; }));
  const mounted = render(<Review {...props()} />); const signal = fetch.mock.calls[0][1].signal;
  mounted.unmount(); expect(signal.aborted).toBe(true); resolve(json(result));
  await waitFor(() => expect(screen.queryByText("Gift 101")).not.toBeInTheDocument());
});
it.each([401, 403])("reports revoked evidence access to its parent: %s", async status => {
  const value = props(); fetch.mockResolvedValue(json({ error: "Access removed" }, status));
  render(<Review {...value} />); await waitFor(() => expect(value.onAccessDenied).toHaveBeenCalledWith("Access removed"));
});
it("does not offer confirmation for viewers, archived records or already-confirmed dates", async () => {
  for (const changes of [{ canManage: false }, { row: { ...row, status: "provisional", archived: true, reasons: [] } }, { row: { ...row, status: "confirmed", date: "2020-01-01", reasons: [] } }]) {
    render(<Review {...props()} {...changes} />); await screen.findByText("Gift 101");
    expect(screen.queryByRole("button", { name: "Review entry-date confirmation" })).not.toBeInTheDocument(); cleanup();
  }
});
const reconciliation = [{ code: "pledge", label: "Pledges", gifts: 1, evidence: "Verify linked payments and dated write-offs; do not count a pledge and payment twice." }];
const exportResult = { ...result, reconciliation, items: [{ ...gift, type: "Pledge", outcome: "review", reconciliation }] };
async function openChecklist() {
  await screen.findByText("Gift 101");
  fireEvent.click(screen.getByText("Reconciliation checklist / 1 unresolved gifts"));
}
it("shows gift-specific evidence and exports all unresolved gifts independent of the visible page", async () => {
  const create = vi.fn(() => "blob:fictional"), click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
  fetch.mockResolvedValueOnce(json(exportResult)).mockResolvedValueOnce({ ok: true, headers: new Headers({ "content-type": "text/csv; charset=utf-8" }), blob: async () => new Blob(["fictional csv"]) });
  render(<Review {...props()} canManage={false} />); await openChecklist();
  expect(screen.getByText(/not a completed reconciliation/)).toBeVisible();
  fireEvent.click(screen.getByText("Evidence needed for this gift")); expect(screen.getAllByText(/dated write-offs/)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Export all unresolved gifts (CSV)" }));
  await screen.findByRole("status", { name: "" });
  await screen.findByText(/CSV download prepared/);
  expect(fetch.mock.calls[1][0]).toContain("format=reconciliation-csv");
  expect(fetch.mock.calls[1][0]).not.toContain("page="); expect(fetch.mock.calls[1][0]).not.toContain("view=");
  expect(fetch.mock.calls[1][1].method).toBeUndefined(); expect(create).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1);
});
it.each([409, 503, 403])("keeps the review usable after an export failure and does not download an error response: %s", async status => {
  const value = props(), click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fetch.mockResolvedValueOnce(json(exportResult)).mockResolvedValueOnce(json({ error: "Export unavailable" }, status));
  render(<Review {...value} />); await openChecklist();
  fireEvent.click(screen.getByRole("button", { name: "Export all unresolved gifts (CSV)" })); await screen.findByRole("alert");
  expect(screen.getByText("Gift 101")).toBeVisible(); expect(click).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Export all unresolved gifts (CSV)" })).not.toBeDisabled();
  if (status === 409) { fireEvent.click(screen.getByRole("button", { name: "Reload saved report" })); expect(value.onReload).toHaveBeenCalledTimes(1); }
  if (status === 403) expect(value.onAccessDenied).toHaveBeenCalledWith("Export unavailable");
});
it("blocks repeated export clicks, aborts on close and does not download late responses", async () => {
  let resolve;
  const create = vi.fn(); vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
  fetch.mockResolvedValueOnce(json(exportResult)).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const mounted = render(<Review {...props()} />); await openChecklist();
  fireEvent.click(screen.getByRole("button", { name: "Export all unresolved gifts (CSV)" }));
  const pending = screen.getByRole("button", { name: "Preparing reconciliation CSV..." }); expect(pending).toBeDisabled(); fireEvent.click(pending);
  expect(fetch).toHaveBeenCalledTimes(2);
  const signal = fetch.mock.calls[1][1].signal; mounted.unmount(); expect(signal.aborted).toBe(true);
  resolve({ ok: true, headers: new Headers({ "content-type": "text/csv" }), blob: async () => new Blob(["fictional csv"]) });
  await waitFor(() => expect(create).not.toHaveBeenCalled());
});
it("rejects non-CSV success responses instead of downloading a login or error page", async () => {
  fetch.mockResolvedValueOnce(json(exportResult)).mockResolvedValueOnce({ ok: true, headers: new Headers({ "content-type": "text/html" }) });
  render(<Review {...props()} />); await openChecklist();
  fireEvent.click(screen.getByRole("button", { name: "Export all unresolved gifts (CSV)" }));
  await screen.findByText(/did not return a CSV/); expect(screen.queryByText(/CSV download prepared/)).not.toBeInTheDocument();
});
