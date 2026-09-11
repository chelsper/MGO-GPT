import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ sql: vi.fn(), nxt: vi.fn(), claim: vi.fn(), identity: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: "reviewer@example.test" } }) }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: async () => {} }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: async () => ({ sessionUser: { id: 7, email: "reviewer@example.test", role: "reviewer" } }) }));
vi.mock("@/app/api/utils/sql", () => ({ default: mock.sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: mock.nxt, getBlackbaudQuotaStatus: async () => ({ paused: false }) }));
vi.mock("@/app/api/utils/importRowApplyClaim", () => ({ claimImportRowForApply: mock.claim }));
vi.mock("@/app/api/utils/importTargetIdentity", () => ({ verifyImportTargetIdentity: mock.identity }));
import { POST } from "./route";
import { importWritePlanKey } from "@/utils/importWriteResults";

const add = { type: "address", action: "add", addressLine1: "100 Oak St", city: "Jacksonville", state: "FL", postalCode: "32211", country: "US", addressType: "Home", makePrimary: false };
const previous = { type: "address", action: "mark_previous", targetId: "old", addressType: "Previous Address", validTo: "2026-09-10", requiresSuccessfulAddressAdd: true };
let row, checkpoints, failCheckpoint;
const send = (retry = false) => POST(new Request(`https://example.test/api/constituency-import/runs/42/apply${retry ? "?retryRowId=9" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowIds: ["9"] }) }), { params: { id: "42" } });
const setWrites = (writes) => { row.requested_writes = writes; row.preview.writePlan = writes; };
const rejection = () => Object.assign(new Error("Invalid NXT value"), { httpStatus: 400 });

beforeEach(() => {
  checkpoints = []; failCheckpoint = false;
  row = { id: "9", run_id: "42", row_number: 1, status: "Ready", matched_blackbaud_constituent_id: "123", preview: { input: {}, match: { blackbaudConstituentId: "123" } } };
  setWrites([add, previous]);
  mock.nxt.mockReset().mockImplementation(async () => { throw new Error("Unexpected NXT call"); });
  mock.claim.mockReset().mockImplementation(async () => { row.status = "Applying"; return true; });
  mock.identity.mockReset().mockResolvedValue({ ok: true });
  mock.sql.mockReset().mockImplementation(async (strings, ...values) => {
    const query = strings.join(" ");
    if (query.includes("UPDATE constituency_import_rows") && query.includes("RETURNING id")) {
      if (failCheckpoint) throw new Error("Checkpoint unavailable");
      row.blackbaud_result = JSON.parse(values[0]);
      checkpoints.push(structuredClone(row.blackbaud_result));
      return [{ id: row.id }];
    }
    if (query.includes("UPDATE constituency_import_rows") && query.includes("blackbaud_result")) {
      row.status = values[0]; row.blackbaud_result = JSON.parse(values[1]); row.blackbaud_error = values[2];
      if (values[3]) row.applied_at ||= "2026-09-10T12:00:00Z";
      return [];
    }
    if (query.includes("UPDATE constituency_import_runs")) return [];
    if (query.includes("FROM constituency_import_runs")) return [{ id: "42", status: "previewed", summary: {}, warnings: [] }];
    if (query.includes("FROM constituency_import_rows")) return [structuredClone(row)];
    throw new Error(`Unexpected SQL: ${query}`);
  });
});

describe("standard import failure recovery", () => {
  it("checkpoints before writing and stops if the checkpoint cannot be saved", async () => {
    failCheckpoint = true;
    expect((await send()).status).toBe(500);
    expect(mock.nxt).not.toHaveBeenCalled();
  });
  it("retains the started checkpoint when NXT succeeds but saving the outcome fails", async () => {
    setWrites([add]);
    mock.nxt.mockResolvedValueOnce({ value: [] }).mockImplementationOnce(async () => {
      failCheckpoint = true;
      return { id: "new" };
    });
    expect((await send()).status).toBe(500);
    expect(row.status).toBe("Applying");
    expect(row.blackbaud_result.results[0].status).toBe("started");
    failCheckpoint = false;
    mock.nxt.mockClear();
    expect((await send(true)).status).toBe(409);
    expect(mock.nxt).not.toHaveBeenCalled();
  });
  it("retries a rejected address addition and then completes its deferred previous-address change", async () => {
    mock.nxt.mockResolvedValueOnce({ value: [] }).mockRejectedValueOnce(rejection());
    await send();
    expect(row.status).toBe("Failed");
    expect(row.blackbaud_result.results.map((r) => r.status)).toEqual(["failed", "blocked"]);
    mock.nxt.mockReset().mockResolvedValueOnce({ value: [] }).mockResolvedValueOnce({ id: "new" })
      .mockResolvedValueOnce({ value: [{ id: "old", address_lines: ["50 Old St"] }] }).mockResolvedValueOnce({ id: "old" });
    await send(true);
    expect(row.status).toBe("Applied");
    expect(row.blackbaud_result.results.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(row.blackbaud_result.attempts).toHaveLength(2);
    expect(mock.nxt.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    expect(checkpoints.some((audit) => audit.results[0]?.status === "started")).toBe(true);
  });
  it("uses an earlier successful address add when retrying only the previous-address change", async () => {
    row.status = "Failed";
    row.blackbaud_result = { results: [{ type: "address", action: "add", writeIndex: 0, status: "applied" }, { type: "address", action: "mark_previous", writeIndex: 1, status: "failed", retrySafe: true }] };
    const oldVerification = { verifiedAt: "2026-09-09", results: [{ writeIndex: 0, status: "confirmed" }] };
    row.blackbaud_result.reconciliation = oldVerification;
    mock.nxt.mockResolvedValueOnce({ value: [{ id: "old" }] }).mockResolvedValueOnce({ id: "old" });
    await send(true);
    expect(row.status).toBe("Applied");
    expect(row.blackbaud_result.results).toHaveLength(2);
    expect(row.blackbaud_result.reconciliation).toMatchObject({ verifiedAt: null, results: [], attempts: [oldVerification] });
    expect(mock.nxt.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
  });
  it("retains unrelated manual-required results instead of falsely completing a retry", async () => {
    setWrites([add, { type: "unsupported" }]);
    row.status = "Failed";
    row.blackbaud_result = { results: [{ type: "address", action: "add", writeIndex: 0, status: "failed", retrySafe: true }, { type: "unsupported", writeIndex: 1, status: "manual_required" }] };
    mock.nxt.mockResolvedValueOnce({ value: [] }).mockResolvedValueOnce({ id: "new" });
    const response = await send(true);
    expect(row.status).toBe("Needs Review");
    expect((await response.json()).applySummary.applied).toBe(0);
    expect(row.blackbaud_result.results[1].status).toBe("manual_required");
  });
  it.each([new Error("Blackbaud request timed out"), Object.assign(new Error("Server error"), { httpStatus: 503 })])("does not repeat an uncertain POST or continue the row", async (error) => {
    mock.nxt.mockResolvedValueOnce({ value: [] }).mockRejectedValueOnce(error);
    await send();
    expect(row.status).toBe("Needs Review");
    expect(row.blackbaud_result.results[0]).toMatchObject({ status: "unconfirmed", retrySafe: false });
    expect(mock.nxt.mock.calls[1][1].maxRetries).toBe(0);
    mock.nxt.mockClear();
    expect((await send(true)).status).toBe(409);
    expect(mock.nxt).not.toHaveBeenCalled();
  });
  it("refuses changed write plans after an attempt", async () => {
    row.status = "Failed";
    row.blackbaud_result = { writePlanKey: importWritePlanKey([{ ...add, city: "Other" }]), results: [] };
    expect((await send(true)).status).toBe(409);
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.nxt).not.toHaveBeenCalled();
  });
  it.each(["email_address", "phone", "address"])("preserves the previous primary when a new %s is rejected", async (type) => {
    const write = type === "address" ? { ...add } : type === "phone" ? { type, action: "add", number: "9045551111", phoneType: "Mobile" } : { type, action: "add", address: "new@example.test", emailType: "Email" };
    setWrites([{ ...write, makePrimary: true, demoteExistingPrimary: true, existingPrimaryId: "old" }]);
    mock.nxt.mockResolvedValueOnce({ value: [{ id: "old", address: "old@example.test", number: "9045552222", address_lines: ["50 Old St"], primary: true }] }).mockRejectedValueOnce(rejection());
    await send();
    expect(row.status).toBe("Failed");
    expect(mock.nxt.mock.calls.some(([, options]) => options.method === "PATCH")).toBe(false);
  });
  it("does not demote a primary when the replacement cannot be confirmed as primary", async () => {
    setWrites([{ type: "email_address", action: "add", address: "new@example.test", emailType: "Email", makePrimary: true, demoteExistingPrimary: true, existingPrimaryId: "old" }]);
    mock.nxt.mockResolvedValueOnce({ value: [{ id: "old", address: "old@example.test", primary: true }] }).mockResolvedValueOnce({ id: "new" })
      .mockResolvedValueOnce({ value: [{ id: "old", address: "old@example.test", primary: true }, { id: "new", address: "new@example.test", primary: false }] });
    await send();
    expect(row.status).toBe("Needs Review");
    expect(row.applied_at).toBeTruthy();
    expect(row.blackbaud_result.results[0].partialApplied).toBe(true);
    expect(mock.nxt.mock.calls.some(([, options]) => options.method === "PATCH")).toBe(false);
  });
  it.each([
    ["email_address", "emailaddresses", { address: "new@example.test", emailType: "Email" }, { address: "new@example.test" }],
    ["phone", "phones", { number: "9045551111", phoneType: "Mobile" }, { number: "9045551111" }],
    ["address", "addresses", add, { address_lines: [add.addressLine1], city: add.city, state: add.state, postal_code: add.postalCode, country: add.country }],
  ])("verifies a new primary %s using the correct endpoint before changing the previous contact", async (type, collection, fields, contact) => {
    setWrites([{ ...fields, type, action: "add", makePrimary: true, demoteExistingPrimary: true, existingPrimaryId: "old" }]);
    mock.nxt.mockResolvedValueOnce({ value: [{ id: "old", primary: true }] }).mockResolvedValueOnce({ id: "new" })
      .mockResolvedValueOnce({ value: [{ id: "old", primary: true }, { id: "new", ...contact, primary: true }] }).mockResolvedValueOnce({});
    await send();
    expect(row.status).toBe("Applied");
    expect(mock.nxt.mock.calls.map(([path]) => path)).toEqual([
      `/constituent/v1/constituents/123/${collection}`,
      `/constituent/v1/${collection}`,
      `/constituent/v1/constituents/123/${collection}`,
      `/constituent/v1/${collection}/old`,
    ]);
    expect(mock.nxt.mock.calls[3][1]).toMatchObject({ method: "PATCH", body: { primary: false }, maxRetries: 0 });
  });
  it("does not repeat a saved primary email while retrying a rejected old-contact cleanup", async () => {
    setWrites([{ type: "email_address", action: "add", address: "new@example.test", emailType: "Email", makePrimary: true, demoteExistingPrimary: true, existingPrimaryId: "old", demotedPrimaryType: "Other" }]);
    const contacts = [{ id: "old", address: "old@example.test", primary: true }, { id: "new", address: "new@example.test", primary: true }];
    mock.nxt.mockResolvedValueOnce({ value: [contacts[0]] }).mockResolvedValueOnce({ id: "new" })
      .mockResolvedValueOnce({ value: contacts }).mockRejectedValueOnce(rejection());
    await send();
    expect(row.status).toBe("Failed");
    expect(row.blackbaud_result.results[0]).toMatchObject({ partialApplied: true, retrySafe: true });
    mock.nxt.mockReset().mockResolvedValueOnce({ value: contacts }).mockResolvedValueOnce({ value: contacts })
      .mockResolvedValueOnce({ value: contacts }).mockResolvedValueOnce({});
    await send(true);
    expect(row.status).toBe("Applied");
    expect(mock.nxt.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
  });
  it("does not restore or replay a constituent code after a lost replacement response", async () => {
    setWrites([{ type: "constituent_code", action: "replace", sourceConstituency: "Student", targetConstituency: "Alumni", sourceCodeId: "old" }]);
    mock.nxt.mockResolvedValueOnce({ value: [{ id: "old", description: "Student" }] }).mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Blackbaud request timed out"));
    await send();
    expect(row.status).toBe("Needs Review");
    expect(row.blackbaud_result.results[0]).toMatchObject({ status: "unconfirmed", partialApplied: true, retrySafe: false });
    expect(mock.nxt).toHaveBeenCalledTimes(3);
  });
  it.each([false, true])("preserves a manual-recovery hold when code restoration has uncertain outcome: %s", async (uncertain) => {
    setWrites([{ type: "constituent_code", action: "replace", sourceConstituency: "Student", targetConstituency: "Alumni", sourceCodeId: "old" }]);
    mock.nxt.mockResolvedValueOnce({ value: [{ id: "old", description: "Student" }] }).mockResolvedValueOnce({})
      .mockRejectedValueOnce(rejection());
    if (uncertain) mock.nxt.mockRejectedValueOnce(new Error("Blackbaud request timed out"));
    else mock.nxt.mockResolvedValueOnce({ id: "restored" });
    await send();
    expect(row.blackbaud_result.results[0]).toMatchObject({ status: uncertain ? "unconfirmed" : "failed", partialApplied: true, retrySafe: false });
    mock.nxt.mockClear();
    expect((await send(true)).status).toBe(409);
    expect(mock.nxt).not.toHaveBeenCalled();
  });
  it("adds an address rather than skipping the same street in a different city", async () => {
    setWrites([add]);
    mock.nxt.mockResolvedValueOnce({ value: [{ address_lines: ["100 Oak St"], city: "Tampa", state: "FL", postal_code: "33602", country: "US" }] }).mockResolvedValueOnce({ id: "new" });
    await send();
    expect(row.status).toBe("Applied");
    expect(mock.nxt.mock.calls[1][1].method).toBe("POST");
  });
});
