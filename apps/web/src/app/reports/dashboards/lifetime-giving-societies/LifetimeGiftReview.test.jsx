import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  expect(screen.getByText(/Use Check linked history/)).toBeVisible();
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
  fireEvent.click(screen.getByText("Evidence needed for this gift")); expect(screen.getAllByText(reconciliation[0].evidence)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Export all unresolved gifts (CSV)" }));
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

const linkedResult = { ...exportResult, items: [{ ...exportResult.items[0], canCheckLinked: true }] };
const linkedProps = () => ({ ...props(), onCheckLinked: vi.fn(), onPauseLinked: vi.fn() });
it("offers explicit linked checks to managers without reading NXT or invoking a callback on mount", async () => {
  const value = linkedProps(); fetch.mockResolvedValue(json(linkedResult));
  render(<Review {...value} />); await screen.findByText("Gift 101");
  expect(value.onCheckLinked).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(screen.getByText(/This app saves evidence after each checkpoint/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Check linked history" }));
  expect(value.onCheckLinked).toHaveBeenCalledExactlyOnceWith("101", false);
});
it.each([
  ["running", "Continue saved check", false], ["paused", "Continue saved check", false],
  ["attention", "Start fresh linked check", true], ["complete", "Check again", true],
])("requires an explicit manager action for a saved %s check", async (status, label, restart) => {
  const value = linkedProps();
  fetch.mockResolvedValue(json({ ...linkedResult, linkedCheck: { seed: "101", status, reads: 10 } }));
  const mounted = render(<Review {...value} />); await screen.findByText("Gift 101");
  expect(value.onCheckLinked).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  if (["running", "paused"].includes(status)) {
    expect(screen.getByText(/This saved check is not running/)).toBeVisible();
    const start = screen.getByRole("button", { name: "Check linked history" });
    expect(start).toBeDisabled(); fireEvent.click(start); expect(value.onCheckLinked).not.toHaveBeenCalled();
  }
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(value.onCheckLinked).toHaveBeenCalledExactlyOnceWith("101", restart);
  value.onCheckLinked.mockClear();
  mounted.rerender(<Review {...value} busy />);
  expect(screen.getByRole("button", { name: label })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(value.onCheckLinked).not.toHaveBeenCalled();
  mounted.rerender(<Review {...value} row={{ ...row, archived: true }} />);
  expect(screen.getByRole("button", { name: label })).toBeDisabled();
  mounted.rerender(<Review {...value} canManage={false} />);
  expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Check linked history" })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("guards evidence navigation, close, check and confirmation callbacks while busy", async () => {
  const value = { ...linkedProps(), row: { ...row, status: "provisional", date: "2020-01-01", reasons: [] } };
  fetch.mockResolvedValue(json(linkedResult));
  const mounted = render(<Review {...value} />); await screen.findByText("Gift 101");
  mounted.rerender(<Review {...value} busy />);
  for (const name of ["Back to list", "Check linked history", "Review entry-date confirmation", "Next gifts", "Needs reconciliation 1"])
    fireEvent.click(screen.getByRole("button", { name }));
  expect(value.onClose).not.toHaveBeenCalled(); expect(value.onConfirm).not.toHaveBeenCalled(); expect(value.onCheckLinked).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("keeps the panel mounted, shows checkpoint progress and pauses once without racing intermediate evidence reads", async () => {
  const value = linkedProps(); fetch.mockResolvedValue(json(linkedResult));
  const mounted = render(<Review {...value} />); await screen.findByText("Gift 101");
  const panel = screen.getByRole("region", { name: "Gift history review" });
  const running = { ...value, busy: true, checkingLinked: true, linkedCheck: { seed: "101", status: "running", reads: 5 } };
  mounted.rerender(<Review {...running} revision="checkpoint-1" />);
  expect(screen.getByText(/5 reads saved/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Pause after current step" }));
  expect(value.onPauseLinked).toHaveBeenCalledTimes(1);
  mounted.rerender(<Review {...running} pauseRequested revision="checkpoint-2" linkedCheck={{ ...running.linkedCheck, reads: 10 }} />);
  expect(screen.getByText(/Pause requested/)).toBeVisible(); expect(screen.getByText(/10 reads saved/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Pause after current step" }));
  expect(value.onPauseLinked).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("region", { name: "Gift history review" })).toBe(panel);
  mounted.rerender(<Review {...value} revision="checkpoint-2" />); await screen.findByText("Gift 101");
  expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls[1][0]).toContain("revision=checkpoint-2");
  expect(screen.queryByRole("button", { name: "Pause after current step" })).not.toBeInTheDocument();
});
it.each(["pause", "completion", "error"])("restores panel focus and scroll once after %s, never for checkpoint revisions", async outcome => {
  const value = linkedProps(); fetch.mockResolvedValue(json(linkedResult));
  const mounted = render(<Review {...value} checkingLinked={false} />); await screen.findByText("Gift 101");
  const panel = screen.getByRole("region", { name: "Gift history review" });
  const focus = vi.spyOn(panel, "focus"), scroll = vi.fn(); panel.scrollIntoView = scroll;
  mounted.rerender(<Review {...value} checkingLinked={false} revision="idle-revision" />); await screen.findByText("Gift 101");
  expect(focus).not.toHaveBeenCalled(); expect(scroll).not.toHaveBeenCalled();
  mounted.rerender(<Review {...value} busy checkingLinked revision="checkpoint-1" />);
  screen.getByRole("button", { name: "Pause after current step" }).focus();
  for (const revision of ["checkpoint-2", "checkpoint-3"])
    mounted.rerender(<Review {...value} busy checkingLinked revision={revision} />);
  expect(focus).not.toHaveBeenCalled(); expect(scroll).not.toHaveBeenCalled(); expect(panel).not.toHaveFocus();
  let resolve;
  fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  mounted.rerender(<Review {...value} checkingLinked={false} revision="checkpoint-3" />);
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "start" }); expect(panel).toHaveFocus();
  await act(async () => resolve(outcome === "error" ? json({ error: "Saved evidence unavailable" }, 503)
    : json({ ...linkedResult, linkedCheck: { seed: "101", status: outcome === "pause" ? "running" : "complete", reads: 10 } })));
  if (outcome === "error") expect(screen.getByRole("alert")).toHaveTextContent("Saved evidence unavailable");
  else expect(screen.getByText("Gift 101")).toBeVisible();
  mounted.rerender(<Review {...value} checkingLinked={false} revision="later-idle-revision" />); await screen.findByText("Gift 101");
  expect(focus).toHaveBeenCalledTimes(1); expect(scroll).toHaveBeenCalledTimes(1);
});
it("does not offer pause or invoke writes for a viewer even when a check is marked active", () => {
  const value = linkedProps(); render(<Review {...value} canManage={false} busy checkingLinked />);
  expect(screen.queryByRole("button", { name: "Pause after current step" })).not.toBeInTheDocument();
  expect(value.onPauseLinked).not.toHaveBeenCalled(); expect(value.onCheckLinked).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("requires staff review after any unconfirmed drop below threshold while preserving a confirmed date", async () => {
  const reduced = { ...linkedResult, items: [{ ...gift, type: "Write-off", reconciledCents: -4000000 }] };
  fetch.mockResolvedValue(json(reduced));
  const value = linkedProps(), mounted = render(<Review {...value} row={{ ...row, date: null, reasons: ["A later reduction brought giving below this threshold."] }} />);
  await screen.findByText("Gift 101");
  expect(screen.getByText(/Net recognition change on this date: -\$40,000.00/)).toBeVisible();
  expect(screen.getByText(/even if giving later recovers/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review entry-date confirmation" })).not.toBeInTheDocument();
  mounted.rerender(<Review {...value} row={{ ...row, status: "confirmed", date: "2020-01-01" }} />);
  expect(screen.getByText(/Staff-confirmed entry date: Jan 1, 2020. This review does not change it/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review entry-date confirmation" })).not.toBeInTheDocument();
});
it("disables restart during export and resets aborted export state after a revision change", async () => {
  const value = linkedProps(), complete = { ...linkedResult, linkedCheck: { seed: "101", status: "complete", reads: 10 } };
  let resolve;
  fetch.mockResolvedValueOnce(json(complete)).mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(json(complete));
  const mounted = render(<Review {...value} />); await openChecklist();
  fireEvent.click(screen.getByRole("button", { name: "Export all unresolved gifts (CSV)" }));
  expect(screen.getByRole("button", { name: "Check again" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check again" })); expect(value.onCheckLinked).not.toHaveBeenCalled();
  const signal = fetch.mock.calls[1][1].signal;
  mounted.rerender(<Review {...value} revision="new-revision" />); await screen.findByText("Gift 101");
  expect(signal.aborted).toBe(true); expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  await act(async () => resolve(json({ error: "Late access failure" }, 403)));
  expect(value.onAccessDenied).not.toHaveBeenCalled();
});
