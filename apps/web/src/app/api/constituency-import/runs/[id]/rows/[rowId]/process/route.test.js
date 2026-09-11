import { beforeEach, describe, expect, it, vi } from "vitest";
import { quickImportInputKey } from "@/utils/quickImportWorkflow";

const authMock = vi.fn();
const userMock = vi.fn();
const sqlMock = vi.fn();
const createMock = vi.fn();
const detailsMock = vi.fn();
const applyMock = vi.fn();
const reconcileMock = vi.fn();
const identityMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: userMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/importTargetIdentity", () => ({ verifyImportTargetIdentity: identityMock }));
vi.mock("../create/route", () => ({ POST: createMock }));
vi.mock("../details/route", () => ({ POST: detailsMock }));
vi.mock("../../../apply/route", () => ({ POST: applyMock }));
vi.mock("../../../reconcile/route", () => ({ POST: reconcileMock }));

let row;
const input = { firstName: "Jane", lastName: "Dolphin", email: "jane@example.com" };
const request = () => new Request("https://example.com/api/constituency-import/runs/42/rows/9/process", { method: "POST" });
const run = async () => (await import("./route")).POST(request(), { params: { id: "42", rowId: "9" } });
beforeEach(() => {
  vi.resetAllMocks();
  authMock.mockResolvedValue({ user: { email: "admin@example.com" } });
  userMock.mockResolvedValue({ sessionUser: { id: "7", role: "admin" } });
  identityMock.mockResolvedValue({ ok: true });
  row = { id: "9", run_id: "42", status: "Needs Review", created_blackbaud_constituent_id: "44", matched_blackbaud_constituent_id: "44",
    preview: { input, quickImportWorkflow: { phase: "details", scopes: ["contacts"], inputKey: quickImportInputKey(input), constituentId: "44", approvedByUserId: "7" } },
    requested_writes: [{ type: "email_address", action: "add", address: "jane@example.com", makePrimary: true }],
  };
  sqlMock.mockImplementation(async (strings, ...values) => {
    if (strings.join(" ").includes("SELECT *")) return [structuredClone(row)];
    const workflow = values.map((value) => {
      try { return JSON.parse(value); } catch { return null; }
    }).find((value) => value?.phase);
    if (workflow) row.preview.quickImportWorkflow = workflow;
    return [{ id: "9" }];
  });
  detailsMock.mockImplementation(async () => { row.status = "Ready"; return Response.json({ complete: true }); });
  applyMock.mockImplementation(async () => { row.status = "Applied"; row.applied_at = "now"; row.blackbaud_result = { results: [{ writeIndex: 0, status: "applied" }] }; return Response.json({ applySummary: { applied: 1 } }); });
  reconcileMock.mockResolvedValue(Response.json({ rows: [{ reconciliation: { verifiedAt: "2026-09-11T12:00:00Z", results: [] } }], reconciliationSummary: { needsReview: 0, verifiedRows: 1, completedRows: 1 } }));
});

describe("checkpointed new-record processing", () => {
  it("loads, applies and verifies in separate steps using the existing guarded handlers", async () => {
    expect(await (await run()).json()).toMatchObject({ next: "apply" });
    expect(detailsMock).toHaveBeenCalledOnce();
    expect(applyMock).not.toHaveBeenCalled();
    expect(await (await run()).json()).toMatchObject({ next: "verify" });
    expect(await applyMock.mock.calls[0][0].json()).toEqual({ rowIds: ["9"], quickImport: true });
    expect(await (await run()).json()).toMatchObject({ done: true });
    expect(row.preview.quickImportWorkflow.phase).toBe("complete");
    expect(createMock).not.toHaveBeenCalled();
    expect(await (await run()).json()).toMatchObject({ done: true });
    expect(applyMock).toHaveBeenCalledOnce();
    expect(reconcileMock).toHaveBeenCalledOnce();
  });
  it("delegates new creation only to the full duplicate-checked endpoint", async () => {
    row.created_blackbaud_constituent_id = null;
    createMock.mockResolvedValue(Response.json({ next: "details" }));
    await run();
    expect(createMock.mock.calls[0][0].url).toMatch(/create\?mode=clear_nonmatches&complete=1$/);
    expect(applyMock).not.toHaveBeenCalled();
  });
  it("never resends an interrupted apply or rehydrates its write plan", async () => {
    row.preview.quickImportWorkflow.phase = "apply";
    row.blackbaud_result = { results: [{ status: "unconfirmed", writeIndex: 0 }] };
    await run();
    expect(detailsMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
    expect(await reconcileMock.mock.calls[0][0].json()).toEqual({ rowIds: ["9"], completeIfMatches: true });
  });
  it("holds incomplete verification instead of reporting success or replaying", async () => {
    row.preview.quickImportWorkflow.phase = "verify";
    row.status = "Applied";
    reconcileMock.mockResolvedValue(Response.json({ reconciliationSummary: { verifiedRows: 1, needsReview: 1, message: "Primary phone not confirmed" } }));
    expect(await (await run()).json()).toMatchObject({ held: true, error: "Primary phone not confirmed" });
    expect(row.preview.quickImportWorkflow.phase).toBe("review");
    expect(applyMock).not.toHaveBeenCalled();
  });
  it("checks live identity even when no additional writes are needed", async () => {
    row.preview.quickImportWorkflow.phase = "verify"; row.status = "Applied"; row.requested_writes = [];
    identityMock.mockResolvedValue({ ok: false, message: "Lookup ID changed" });
    expect(await (await run()).json()).toMatchObject({ held: true, error: "Lookup ID changed" });
    expect(reconcileMock).not.toHaveBeenCalled();
  });
  it("does not complete without the saved verification checkpoint", async () => {
    row.preview.quickImportWorkflow.phase = "verify"; row.status = "Applied";
    reconcileMock.mockResolvedValue(Response.json({ reconciliationSummary: { needsReview: 0, verifiedRows: 1 } }));
    expect(await (await run()).json()).toMatchObject({ paused: true });
    expect(row.preview.quickImportWorkflow.phase).toBe("verify");
  });
  it("can resume an unavailable identity read without a new write", async () => {
    row.preview.quickImportWorkflow.phase = "verify"; row.status = "Applied";
    identityMock.mockResolvedValue({ ok: false, diagnostic: { code: "identity_read_failed", httpStatus: 429 } });
    expect(await (await run()).json()).toMatchObject({ paused: true });
    expect(row.preview.quickImportWorkflow.phase).toBe("verify");
    expect(applyMock).not.toHaveBeenCalled();
  });
  it("pauses a failed read and retains that exact read-only step for resume", async () => {
    detailsMock.mockResolvedValue(Response.json({ complete: false, message: "NXT contacts unavailable" }));
    expect(await (await run()).json()).toMatchObject({ paused: true });
    expect(row.preview.quickImportWorkflow.phase).toBe("details");
    expect(applyMock).not.toHaveBeenCalled();
  });
  it("holds unsafe additions without sending them", async () => {
    row.preview.quickImportWorkflow.phase = "apply";
    row.requested_writes[0].action = "replace";
    expect(await (await run()).json()).toMatchObject({ held: true });
    expect(applyMock).not.toHaveBeenCalled();
  });
  it("rejects changed source identity, changed targets and unapproved old creations", async () => {
    row.preview.input = { ...input, lastName: "Different" };
    expect((await run()).status).toBe(409);
    row.preview.input = input;
    row.matched_blackbaud_constituent_id = "99";
    expect((await run()).status).toBe(409);
    row.matched_blackbaud_constituent_id = "44";
    delete row.preview.quickImportWorkflow;
    expect((await run()).status).toBe(409);
    expect(detailsMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });
  it("fails closed when saving progress races another request", async () => {
    sqlMock.mockResolvedValueOnce([structuredClone(row)]).mockResolvedValueOnce([]);
    expect(await (await run()).json()).toMatchObject({ paused: true });
    expect(applyMock).not.toHaveBeenCalled();
  });
  it.each(["mgo", "executive"])("does not permit %s access", async (role) => {
    userMock.mockResolvedValue({ sessionUser: { id: "7", role } });
    expect((await run()).status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    authMock.mockResolvedValue(null);
    expect((await run()).status).toBe(401);
  });
});
