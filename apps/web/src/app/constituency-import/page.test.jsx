import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: { email: "reviewer@example.test", role: "reviewer" }, loading: false }) }));
vi.mock("@/utils/useWorkspaceView", () => ({ default: () => ({ effectiveRole: "reviewer" }) }));
import ConstituencyImportPage from "./page";

let rows, matches;
const json = (payload) => ({ ok: true, json: async () => structuredClone(payload) });
beforeEach(() => {
  matches = true;
  rows = [{ id: "9", rowNumber: 1, status: "Needs Review", appliedAt: "2026-09-11T15:00:00Z",
    createdBlackbaudConstituentId: "123", createdBlackbaudLookupId: "702300", confidence: 100,
    input: { firstName: "Jane", lastName: "Dolphin", targetConstituency: "Student" },
    match: { blackbaudConstituentId: "123", name: "Jane Dolphin", lookupId: "702300" },
    writePlan: [{ type: "phone", action: "add", number: "9045551212", makePrimary: true, phoneType: "Cell Phone" }],
    blackbaudResult: { results: [{ writeIndex: 0, type: "phone", action: "add", status: "manual_required", partialApplied: true }],
      reconciliation: { verifiedAt: "2026-09-11", results: [{ writeIndex: 0, status: "needs_review", message: "Primary not confirmed" }] } },
    reasons: ["Review and apply staged updates separately."],
  }];
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (url === "/api/users/profile") return json({ user: { role: "reviewer" } });
    if (url.startsWith("/api/blackbaud/status")) return json({ quota: { paused: false } });
    if (url === "/api/constituency-import/runs?limit=8") return json({ runs: [{ id: "42", sourceFilename: "test.csv", readyCount: 0, appliedCount: 0, needsReviewCount: rows.filter((r) => r.status !== "Applied").length, failedCount: 0 }] });
    if (url === "/api/constituency-import/runs?id=42") return json({ savedRun: { id: "42", defaults: {} }, rows, summary: { total: rows.length, applied: rows.filter((r) => r.status === "Applied").length, needsReview: rows.filter((r) => r.status !== "Applied").length }, warnings: [] });
    if (url === "/api/constituency-import/runs/42/reconcile") {
      expect(JSON.parse(options.body)).toEqual({ rowIds: ["9"], completeIfMatches: true });
      rows[0].blackbaudResult.reconciliation = { verifiedAt: "2026-09-11T16:00:00Z", results: [{ writeIndex: 0, type: "phone", status: matches ? "confirmed" : "needs_review", message: matches ? "Primary phone confirmed" : "Phone is not primary in NXT" }] };
      if (matches) rows[0].status = "Applied";
      return json({ rows: [{ id: "9", completed: matches }], reconciliationSummary: { message: matches ? "Verified in NXT and marked complete. No changes were sent to NXT." : "The record stays in review. No changes were sent to NXT." } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
async function openRun() {
  render(<ConstituencyImportPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Run #42/ }));
  return screen.findByRole("button", { name: "Verify in NXT and finish" });
}

describe("standard import completion flow", () => {
  it("opens the exact requested saved row only after a click, preserving the no-preload handoff", async () => {
    rows.push({ ...structuredClone(rows[0]), id: "10", rowNumber: 2, input: { firstName: "Requested", lastName: "Person" }, match: { blackbaudConstituentId: "124", name: "Requested Person" } });
    window.history.replaceState({}, "", "/constituency-import?queueRun=42&queueRow=10");
    render(<ConstituencyImportPage />);
    const open = await screen.findByRole("button", { name: "Open saved row #10" });
    expect(fetch.mock.calls.some(([url]) => url === "/api/constituency-import/runs?id=42")).toBe(false);
    fireEvent.click(open);
    await screen.findAllByText("Requested Person");
    expect(screen.queryByText("Jane Dolphin")).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes("/details"))).toBe(false);
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
    const results = new URL(screen.getByRole("link", { name: "Back to Import History" }).href);
    expect(results.searchParams.get("returnTo")).toBe("/constituency-import?queueRun=42&queueRow=10");
  });
  it("opens a held attempted row with a read-only finish control, not stale send/review forms", async () => {
    await openRun();
    expect(screen.getByText("Saved import run #42")).toBeInTheDocument();
    expect(screen.queryByText("Import run ready for NXT actions")).not.toBeInTheDocument();
    expect(screen.getByText(/Only explicit create or send controls write to NXT/)).toBeInTheDocument();
    expect(screen.getByText("Original import plan (history)")).toBeInTheDocument();
    expect(screen.getByText("Original send results (history)")).toBeInTheDocument();
    expect(screen.getByText("Original send results (history)").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Needs verification")).toBeVisible();
    expect(screen.queryByText("Current NXT constituencies")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact change review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open required review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm and send to NXT/ })).not.toBeInTheDocument();
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
    expect(fetch.mock.calls.some(([url]) => url.includes("/details"))).toBe(false);
  });
  it("finishes without calling apply, reloads the saved run, and focuses the next unresolved row", async () => {
    rows.push({ ...structuredClone(rows[0]), id: "10", rowNumber: 2, input: { firstName: "Next", lastName: "Person" }, match: { blackbaudConstituentId: "124", name: "Next Person" } });
    const finish = await openRun();
    fireEvent.click(finish);
    await screen.findByText("Verified in NXT and marked complete. No changes were sent to NXT.");
    await waitFor(() => expect(screen.getAllByText("Next Person").length).toBeGreaterThan(0));
    expect(screen.queryByText("Jane Dolphin")).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST").map(([url]) => url)).toEqual(["/api/constituency-import/runs/42/reconcile"]);
  });
  it("keeps unresolved verification on screen and permits another check", async () => {
    matches = false;
    fireEvent.click(await openRun());
    await screen.findByText("The record stays in review. No changes were sent to NXT.");
    expect(screen.getByText("Needs review: Phone is not primary in NXT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify in NXT and finish" })).toBeEnabled();
    const verifiedLabel = screen.getByText("Verified", { exact: true });
    expect(within(verifiedLabel.parentElement).getByText("0", { exact: true })).toBeInTheDocument();
    matches = true;
    fireEvent.click(screen.getByRole("button", { name: "Verify in NXT and finish" }));
    await screen.findByRole("heading", { name: "Import complete" });
    expect(screen.getByText("The requested details were verified in NXT. Nothing more needs to be sent for this row.")).toBeInTheDocument();
  });
});

it("warns before replacing, clearing, or leaving an unsaved CSV, including native input events", async () => {
  render(<ConstituencyImportPage />);
  await screen.findByRole("button", { name: /Run #42/ });
  const input = document.getElementById("constituency-import-file");
  const file = { name: "first.csv", text: async () => "First Name,Last Name\nTest,Person" };
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Loaded first.csv.");
  window.confirm.mockReturnValue(false);
  const before = fetch.mock.calls.length;
  fireEvent.input(input, { target: { files: [{ name: "second.csv", text: async () => "First Name,Last Name\nOther,Person" }] } });
  expect(screen.getByText("first.csv")).toBeInTheDocument();
  expect(screen.queryByText("second.csv")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear file" }));
  expect(screen.getByText("first.csv")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Run #42/ }));
  expect(fetch).toHaveBeenCalledTimes(before);
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(window.confirm).toHaveBeenCalledTimes(3);
  window.confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear file" }));
  expect(screen.getByText("No CSV selected")).toBeInTheDocument();
  const clearUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(clearUnload);
  expect(clearUnload.defaultPrevented).toBe(false);
});

it("renders quick creation controls for a potential new row without an undefined review flag", async () => {
  rows = [{ id: "9", rowNumber: 1, status: "Needs Review", confidence: 0, input: { firstName: "New", lastName: "Person" },
    intentDisposition: { key: "potential_new" }, importIntent: "new", writePlan: [], reasons: [], match: null }];
  render(<ConstituencyImportPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Run #42/ }));
  await screen.findByText(/Create clear nonmatches/);
});
