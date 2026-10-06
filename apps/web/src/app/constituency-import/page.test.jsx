import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: { email: "reviewer@example.test", role: "reviewer" }, loading: false }) }));
import ConstituencyImportPage from "./page";
import { IMPORT_MATCH_CRITERIA_VERSION } from "@/utils/importMatchEvidence";

let rows, matches;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const json = (payload) => ({ ok: true, json: async () => structuredClone(payload) });
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
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
    if (url === "/api/users/profile") return json({ user: { id: 7, email: "reviewer@example.test", role: "reviewer", active: true } });
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); HTMLElement.prototype.scrollIntoView = originalScrollIntoView; window.history.replaceState({}, "", "/"); });
async function openRun() {
  render(<ConstituencyImportPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Run #42/ }));
  return screen.findByRole("button", { name: "Verify in NXT and finish" });
}

describe("standard import completion flow", () => {
  it("opens a contact correction from saved history without re-uploading, creating constituents, or sending updates", async () => {
    const baseFetch = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, options) => {
      if (url === "/api/constituency-import/runs/42/contact-recovery") return json(options?.method === "POST" ? { runId: "77" } : {
        rows: [{ sourceRowId: "9", rowNumber: 1, targetId: "123", name: "Jane Dolphin", hasOmittedContacts: true, blockers: [], stagedKinds: [],
          emailUpdates: [{ address: "jane@example.test", type: "Personal", makePrimary: true }], phoneUpdates: [] }],
      });
      if (url === "/api/constituency-import/runs?id=77") return json({ savedRun: { id: "77", contactRecoverySourceRunId: "42" }, warnings: [], summary: { total: 1, ready: 1 }, rows: [{
        id: "19", rowNumber: 1, status: "Ready", importIntent: "updates", match: rows[0].match,
        input: { firstName: "Jane", lastName: "Dolphin", constituentName: "Jane Dolphin", blackbaudConstituentId: "123", emailUpdates: [{ address: "jane@example.test", type: "Personal", makePrimary: true }] },
        contactRecovery: { sourceRunId: "42", sourceRowId: "9", targetId: "123" },
        contactSnapshotStatus: { emails: true, phones: true, addresses: true }, contactsSnapshotLoaded: true,
        currentContacts: { emails: [], phones: [], addresses: [] },
        contactReviewDecisions: { email: { 0: { mode: "add", makePrimary: true } } },
        writePlan: [{ type: "email_address", action: "add", address: "jane@example.test", emailType: "Personal", makePrimary: true }], reasons: [],
      }] });
      return baseFetch(url, options);
    });
    await openRun();
    fireEvent.click(screen.getByRole("button", { name: "Complete missing contact information" }));
    fireEvent.click(await screen.findByRole("button", { name: "Prepare contact correction (1)" }));
    expect(await screen.findByRole("button", { name: "Back to original import" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Confirm as new constituent/ })).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST").map(([url]) => url)).toEqual(["/api/constituency-import/runs/42/contact-recovery"]);
    fireEvent.click(screen.getByRole("button", { name: "Back to original import" }));
    expect(await screen.findByRole("button", { name: "Complete missing contact information" })).toBeEnabled();
  });

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
    expect(within(screen.getByRole("region", { name: "Import overview" })).getByText("Verified: 0 of 0 completed")).toBeInTheDocument();
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

describe("filterable import review", () => {
  async function openMixedRun() {
    const ready = { id: "11", rowNumber: 1, status: "Ready", importIntent: "mixed", confidence: 100,
      input: { constituentName: "Ready Person", firstName: "Ready", lastName: "Person", blackbaudConstituentId: "201",
        addressUpdates: [{ addressLine1: "1 Example St", city: "Jacksonville", state: "FL", postalCode: "32211", type: "Home", makePrimary: false }] },
      match: { blackbaudConstituentId: "201", name: "Ready Person" }, intentDisposition: { key: "ready_update", allowApply: true },
      matchCriteriaVersion: IMPORT_MATCH_CRITERIA_VERSION, matchSuggestionsCheckedAt: "2026-10-06T12:00:00Z",
      contactsSnapshotLoaded: true, contactSnapshotStatus: { emails: true, phones: true, addresses: true },
      currentContacts: { emails: [], phones: [], addresses: [] }, reasons: [],
      writePlan: [{ type: "phone", action: "add", number: "9045551212", phoneType: "Mobile", makePrimary: true }] };
    rows = [ready,
      { id: "12", rowNumber: 2, status: "Needs Review", importIntent: "new", input: { firstName: "New", lastName: "Person" },
        intentDisposition: { key: "potential_new" }, match: null, writePlan: [], reasons: [] },
      { ...rows[0], id: "9", rowNumber: 3 },
      { ...ready, id: "14", rowNumber: 4, status: "Applied", appliedAt: "2026-10-06", match: { blackbaudConstituentId: "204", name: "Finished Person" }, input: { constituentName: "Finished Person" } },
      { ...ready, id: "15", rowNumber: 5, status: "Skipped", blackbaudResult: { type: "import_row_skipped" }, input: { constituentName: "Skipped Person" } },
    ];
    render(<ConstituencyImportPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Run #42/ }));
    await screen.findByRole("region", { name: "Import overview" });
    return within(screen.getByRole("region", { name: "Import overview" }));
  }
  it("starts at exceptions, shows separate counts, and filters without sending", async () => {
    const overview = await openMixedRun();
    for (const label of ["New records", "Ready updates", "Needs attention", "Completed", "Skipped"]) {
      expect(overview.getByRole("button", { name: `${label} 1` })).toBeEnabled();
    }
    expect(overview.getByRole("button", { name: "Needs attention 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Verify in NXT and finish" })).toBeEnabled();
    fireEvent.click(overview.getByRole("button", { name: "Completed 1" }));
    expect(screen.getByRole("region", { name: "Record change summary" })).toHaveTextContent("Imported; not yet verified");
    expect(screen.queryByRole("button", { name: "Verify in NXT and finish" })).not.toBeInTheDocument();
    fireEvent.click(overview.getByRole("button", { name: "Skipped 1" }));
    expect(screen.getByRole("region", { name: "Record change summary" })).toHaveTextContent("Skipped");
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
  });
  it("requires explicit selection and confirmation and sends only eligible existing-record updates", async () => {
    const overview = await openMixedRun();
    const baseFetch = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, options) => url === "/api/constituency-import/runs/42/apply"
      ? json({ savedRun: { id: "42", defaults: {} }, rows: rows.map((row) => row.id === "11" ? { ...row, status: "Applied" } : row),
        summary: {}, warnings: [], applySummary: { applied: 1, manualRequired: 0, failed: 0 } }) : baseFetch(url, options));
    fireEvent.click(overview.getByRole("button", { name: "Review ready updates together (1)" }));
    expect(screen.getAllByRole("region", { name: "Record change summary" })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Record change summary" })).toHaveTextContent("Add phone: 9045551212 (Mobile); set as primary");
    expect(screen.getByRole("button", { name: "Import selected rows to NXT" })).toBeDisabled();
    expect(screen.getAllByRole("checkbox", { name: "Include in NXT batch" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Select all ready" }));
    window.confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Import 1 row to NXT" }));
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    window.confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Import 1 row to NXT" }));
    await screen.findByText("Applied import run #42.");
    const writes = fetch.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe("/api/constituency-import/runs/42/apply");
    expect(JSON.parse(writes[0][1].body)).toEqual({ rowIds: ["11"] });
    expect(screen.getByText("No records in this group. Choose another group above.")).toBeInTheDocument();
  });
  it("does not navigate away from unsaved row corrections or offer bulk approval", async () => {
    const overview = await openMixedRun();
    fireEvent.click(overview.getByRole("button", { name: "Ready updates 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Correct staged CSV values" }));
    expect(overview.getAllByRole("button").every((button) => button.disabled)).toBe(true);
    expect(screen.getByText("Save or cancel your current edits before changing groups or approving a batch.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use batch actions" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel correction" }));
    expect(overview.getByRole("button", { name: "Needs attention 1" })).toBeEnabled();
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });
});

describe("contact preparation from an uploaded file", () => {
  const file = { name: "contacts.csv", text: async () => "First Name,Last Name,Email Address,Email Make Primary?,Phone Number,Phone Make Primary?,New Constituent Code\nAvery,Newcomer,avery@example.test,Yes,9045551212,Yes,Friend" };
  async function upload() {
    render(<ConstituencyImportPage />);
    await screen.findByRole("button", { name: /Run #42/ });
    fireEvent.change(document.getElementById("constituency-import-file"), { target: { files: [file] } });
    await screen.findByText("Loaded contacts.csv.");
    return within(screen.getByRole("region", { name: "Contact import plan" }));
  }
  it("holds omitted contacts, allows one-click inclusion and sends the intended fields/defaults only for preview", async () => {
    const baseFetch = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, options) => url === "/api/constituency-import/preview"
      ? json({ previewOnly: true, rows: [{ id: "preview-1", rowNumber: 1, status: "Needs Review", match: null,
        input: { firstName: "Avery", lastName: "Newcomer", emailUpdates: [{ address: "avery@example.test", type: "Personal", makePrimary: true }],
          phoneUpdates: [{ number: "9045551212", type: "Mobile", makePrimary: true }] }, reasons: [], writePlan: [] }], summary: {}, warnings: [] }) : baseFetch(url, options));
    const plan = await upload();
    expect(screen.queryByRole("button", { name: "Review uploaded CSV" })).not.toBeInTheDocument();
    expect(plan.getAllByRole("radio").every((input) => !input.checked)).toBe(true);
    fireEvent.click(plan.getByRole("button", { name: "Include all mapped emails and phones" }));
    fireEvent.change(plan.getByRole("textbox", { name: /Default email type/ }), { target: { value: "Personal" } });
    fireEvent.change(plan.getByRole("textbox", { name: /Default phone type/ }), { target: { value: "Mobile" } });
    fireEvent.click(screen.getByRole("button", { name: "Review uploaded CSV" }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url === "/api/constituency-import/preview")).toBe(true));
    const [, options] = fetch.mock.calls.find(([url]) => url === "/api/constituency-import/preview");
    const body = JSON.parse(options.body);
    expect(body.defaults).toMatchObject({ importIntent: "updates", updateEmailFields: true, updatePhoneFields: true, defaultEmailType: "Personal", defaultPhoneType: "Mobile" });
    expect(body.mappings).toMatchObject({ email: "Email Address", emailMakePrimary: "Email Make Primary?", phoneNumber: "Phone Number", phoneMakePrimary: "Phone Make Primary?" });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => url)).toEqual(["/api/constituency-import/preview"]);
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled());
  });
  it("permits explicit matching-only use but asks again for a new upload", async () => {
    const plan = await upload();
    fireEvent.click(plan.getByRole("radio", { name: "Use email addresses for matching only" }));
    fireEvent.click(plan.getByRole("radio", { name: "Do not import phone numbers" }));
    expect(plan.getAllByText(/will not be added or changed/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Review uploaded CSV" })).toBeEnabled();
    fireEvent.change(document.getElementById("constituency-import-file"), { target: { files: [{ ...file, name: "next.csv" }] } });
    await screen.findByText("Loaded next.csv.");
    expect(plan.getAllByRole("radio").every((input) => !input.checked)).toBe(true);
    expect(screen.queryByRole("button", { name: "Review uploaded CSV" })).not.toBeInTheDocument();
  });
  it("does not inherit contact-write approval when a replacement file has direct NXT IDs", async () => {
    const plan = await upload();
    fireEvent.click(plan.getByRole("button", { name: "Include all mapped emails and phones" }));
    fireEvent.change(document.getElementById("constituency-import-file"), { target: { files: [{ name: "identified.csv", text: async () => "NXT System ID,Email Address\n123,avery@example.test" }] } });
    await screen.findByText("Loaded identified.csv.");
    expect(plan.getAllByRole("radio").every((input) => !input.checked)).toBe(true);
  });
});
