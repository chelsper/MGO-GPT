import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ provider: vi.fn(), load: vi.fn(), claim: vi.fn(), complete: vi.fn(), reject: vi.fn(), receipt: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: mocks.provider }));
vi.mock("./pipelineOpportunityStore", async (original) => ({ ...(await original()), loadPipelineCopies: mocks.load, claimPipelineChange: mocks.claim,
  completePipelineChange: mocks.complete, rejectPipelineChange: mocks.reject, getPipelineReceipt: mocks.receipt }));
vi.mock("./sql", () => ({ default: vi.fn() }));
import { getPipelineEditor, savePipelineChange, verifyPipelineChange } from "./pipelineOpportunityChange";
import { buildPipelinePatch, pipelineVersion, remoteOpportunityValues } from "./pipelineOpportunityValues";

const copy = (id, user) => ({ id, user_id: user, blackbaud_opportunity_id: "900", blackbaud_constituent_id: "100", revision: "2026-09-01 10:00:00+00", checked_revision: null,
  current_stage: "Cultivation", opportunity_status: "Active", closed_amount: null, close_date: null });
const copies = [copy(1, 10), copy(2, 20)];
const remote = { id: "900", constituent_id: "100", name: "Scholarship", status: "Cultivation", purpose: "Campaign", ask_amount: { value: 1000 }, expected_date: "2027-05-01" };
const identity = { nxtId: "900", constituentId: "100" };
const values = () => remoteOpportunityValues(remote, identity);
const input = (extra = {}) => ({ id: "1", actor: { id: 10, role: "mgo" }, origin: "https://example.test",
  body: { operation: "edit", version: pipelineVersion(copies, values()), fields: { name: "Updated" } }, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(copies); mocks.provider.mockReset().mockResolvedValue(remote);
  mocks.claim.mockResolvedValue(); mocks.complete.mockResolvedValue(); mocks.reject.mockResolvedValue();
});

describe("pipeline role and edit validation", () => {
  it.each(["executive", "advancement_services", "unknown"])("denies %s writes before any NXT call", async role => {
    await expect(getPipelineEditor(input({ actor: { id: 10, role } }))).rejects.toMatchObject({ status: 403 });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("denies nonowners and MGO archives, but allows an actual joint owner", async () => {
    await expect(savePipelineChange(input({ actor: { id: 99, role: "mgo" } }))).rejects.toMatchObject({ status: 403 });
    const archive = input(); archive.body.operation = "archive";
    await expect(savePipelineChange(archive)).rejects.toMatchObject({ status: 403 });
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(await getPipelineEditor(input({ actor: { id: 20, role: "mgo" } }))).toMatchObject({ state: "ready", copyCount: 2 });
  });
  it("rejects unlinked or conflicting copies, never creates an opportunity", async () => {
    mocks.load.mockResolvedValue([{ ...copies[0], blackbaud_opportunity_id: null }]);
    await expect(getPipelineEditor(input())).rejects.toMatchObject({ status: 409 });
    mocks.load.mockResolvedValue([copies[0], { ...copies[1], blackbaud_constituent_id: "200" }]);
    await expect(getPipelineEditor(input())).rejects.toMatchObject({ status: 409 });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects changed NXT values and never makes a write", async () => {
    mocks.provider.mockResolvedValue({ ...remote, name: "Someone else's new name" });
    await expect(savePipelineChange(input())).rejects.toMatchObject({ status: 409 });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it.each([{ ask_amount: -1 }, { ask_amount: "1,000" }, { expected_date: "2027-02-30" }, { expected_date: "" }, { user_id: 99 }, { name: "" }])("rejects invalid edit %j", fields => {
    expect(() => buildPipelinePatch({ ...input().body, fields }, values())).toThrow();
  });
  it("keeps zero, normalizes dates, and sends only changed fields", () => {
    expect(buildPipelinePatch({ ...input().body, fields: { name: remote.name, ask_amount: "0", expected_date: "2028-01-01" } }, values()))
      .toEqual({ ask_amount: { value: 0 }, expected_date: "2028-01-01T00:00:00Z" });
  });
});

describe("durable NXT update and reconciliation", () => {
  it("claims before one non-retrying PATCH, verifies then fans out", async () => {
    mocks.provider.mockResolvedValueOnce(remote).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...remote, name: "Updated" });
    expect(await savePipelineChange(input())).toMatchObject({ state: "complete" });
    expect(mocks.claim).toHaveBeenCalledOnce();
    const claim = mocks.claim.mock.calls[0][0];
    expect(claim.copies).toHaveLength(2); expect(claim.actor_id).toBe(10);
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.provider.mock.invocationCallOrder[1]);
    expect(mocks.provider.mock.calls.map(call => call[1].method)).toEqual(["GET", "PATCH", "GET"]);
    expect(mocks.provider.mock.calls[1][1]).toMatchObject({ body: { name: "Updated" }, maxRetries: 0, authUserId: 10 });
    expect(mocks.complete).toHaveBeenCalledWith(claim, expect.objectContaining({ title: "Updated", estimated_amount: 1000 }));
  });
  it("retains history for an Admin archive and sends only inactive:true", async () => {
    mocks.provider.mockResolvedValueOnce(remote).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...remote, inactive: true });
    const request = input({ actor: { id: 99, role: "admin" } });
    request.body = { ...request.body, operation: "archive", confirmArchive: true };
    expect(await savePipelineChange(request)).toMatchObject({ state: "complete" });
    expect(mocks.provider.mock.calls[1][1].body).toEqual({ inactive: true });
    expect(mocks.complete.mock.calls[0][1]).toMatchObject({ opportunity_status: "Archived", current_stage: "Cultivation" });
  });
  it("holds uncertain writes and verifies without replay", async () => {
    mocks.provider.mockResolvedValueOnce(remote).mockRejectedValueOnce(new Error("timeout"));
    expect(await savePipelineChange(input())).toMatchObject({ state: "pending" });
    expect(mocks.reject).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
    const receipt = { ...mocks.claim.mock.calls[0][0], state: "pending" };
    mocks.load.mockResolvedValue(copies.map(row => ({ ...row, pipeline_change_id: receipt.id })));
    mocks.receipt.mockResolvedValue(receipt);
    const count = mocks.provider.mock.calls.length;
    expect(await savePipelineChange(input())).toMatchObject({ state: "pending" });
    expect(mocks.provider).toHaveBeenCalledTimes(count);
    mocks.provider.mockResolvedValue({ ...remote, name: "Updated" });
    expect(await verifyPipelineChange(input())).toMatchObject({ state: "complete" });
    expect(mocks.provider.mock.calls.filter(call => call[1].method === "PATCH")).toHaveLength(1);
  });
  it("retains a successful-but-lagging write for read-only verification", async () => {
    expect(await savePipelineChange(input())).toMatchObject({ state: "pending" });
    expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.reject).not.toHaveBeenCalled();
  });
  it("releases only definitive NXT rejections and never changes local fields", async () => {
    mocks.provider.mockResolvedValueOnce(remote).mockRejectedValueOnce(Object.assign(new Error("private provider payload"), { httpStatus: 400 }));
    await expect(savePipelineChange(input())).rejects.toMatchObject({ status: 422, message: expect.stringContaining("NXT rejected") });
    expect(mocks.reject).toHaveBeenCalledOnce(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("keeps the receipt when local finalization fails after confirmed NXT success", async () => {
    mocks.provider.mockResolvedValueOnce(remote).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...remote, name: "Updated" });
    mocks.complete.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await savePipelineChange(input())).toMatchObject({ state: "pending" });
    expect(mocks.reject).not.toHaveBeenCalled();
  });
});
