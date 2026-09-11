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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function openRun() {
  render(<ConstituencyImportPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Run #42/ }));
  return screen.findByRole("button", { name: "Verify in NXT and finish" });
}

describe("standard import completion flow", () => {
  it("opens a held attempted row with a read-only finish control, not stale send/review forms", async () => {
    await openRun();
    expect(screen.getByText("Original import plan (history)")).toBeInTheDocument();
    expect(screen.getByText("Original send results (history)")).toBeInTheDocument();
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
