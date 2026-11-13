import { describe, expect, it } from "vitest";
import { canFinishImportWithoutSending, isImportVerificationComplete } from "./importCompletion";
import { importWritePlanKey } from "./importWriteResults";
import { quickImportInputKey } from "./quickImportWorkflow";

const writes = [{ type: "phone", number: "9045551212" }];
const row = { status: "Needs Review", writePlan: writes, match: { blackbaudConstituentId: "1" },
  blackbaudResult: { writePlanKey: importWritePlanKey(writes), results: [{ writeIndex: 0, status: "manual_required", partialApplied: true }] } };
describe("verification-only import eligibility", () => {
  it("requires new-name proof bound to the exact created record and source values", () => {
    const input = { middleName: "Alex", maidenName: "Harbor" };
    const created = { ...row, input, createdBlackbaudConstituentId: "1", blackbaudResult: { reconciliation: {
      verifiedAt: "2026-11-13", results: [{ writeIndex: 0, status: "confirmed" }],
      createdNames: { status: "confirmed", constituentId: "1", inputKey: quickImportInputKey(input) },
    } } };
    expect(isImportVerificationComplete(created)).toBe(true);
    expect(isImportVerificationComplete({ ...created, input: { ...input, middleName: "Taylor" } })).toBe(false);
    expect(isImportVerificationComplete({ ...created, match: { blackbaudConstituentId: "2" } })).toBe(false);
    created.blackbaudResult.reconciliation.createdNames.constituentId = "2";
    expect(isImportVerificationComplete(created)).toBe(false);
    delete created.blackbaudResult.reconciliation.createdNames;
    expect(isImportVerificationComplete(created)).toBe(false);
  });
  it("keeps creation name failures visible even when every later write was verified", () => {
    expect(isImportVerificationComplete({ ...row, blackbaudResult: { reconciliation: { verifiedAt: "2026-11-13", results: [{ writeIndex: 0, status: "confirmed" }], createdNames: { status: "needs_review" } } } })).toBe(false);
  });
  it("accepts persisted partial outcomes and folded prior attempts", () => {
    expect(canFinishImportWithoutSending(row)).toBe(true);
    expect(canFinishImportWithoutSending({ ...row, blackbaudResult: { attempts: [{ results: row.blackbaudResult.results }], results: [] } })).toBe(true);
  });
  it.each(["Ready", "Creating", "Applying", "Skipped", "Conflict"])("blocks %s", (status) => {
    expect(canFinishImportWithoutSending({ ...row, status })).toBe(false);
  });
  it.each([{ match: null }, { writePlan: [] }, { blackbaudResult: {} }, { quick_create_status: "uncertain" },
    { create_request_started_at: "2026-09-11" }, { writePlan: [{ type: "phone", number: "different" }] }])("requires known identity and unchanged attempted plan: %j", (change) => {
    expect(canFinishImportWithoutSending({ ...row, ...change })).toBe(false);
  });
  it("accepts a known created record, not an unknown creation outcome", () => {
    expect(canFinishImportWithoutSending({ ...row, create_request_started_at: "2026-09-11", created_blackbaud_constituent_id: "1" })).toBe(true);
  });
  it("a verification timestamp is not enough to count the row verified", () => {
    const verified = (results) => ({ ...row, blackbaudResult: { reconciliation: { verifiedAt: "2026-09-11", results } } });
    expect(isImportVerificationComplete(verified([{ writeIndex: 0, status: "confirmed" }]))).toBe(true);
    expect(isImportVerificationComplete(verified([{ writeIndex: 0, status: "needs_review" }]))).toBe(false);
    expect(isImportVerificationComplete(verified([]))).toBe(false);
    expect(isImportVerificationComplete(verified([{ writeIndex: 1, status: "confirmed" }]))).toBe(false);
    expect(isImportVerificationComplete({ ...verified([{ writeIndex: 0, status: "confirmed" }]), writePlan: [...writes, { type: "address" }] })).toBe(false);
  });
  it("counts an empty plan only after the approved new identity and completion checkpoint are verified", () => {
    const empty = { status: "Applied", writePlan: [], createdBlackbaudConstituentId: "1",
      blackbaudResult: { reconciliation: { verifiedAt: "now", results: [] } },
      quickImportWorkflow: { phase: "complete", identityConfirmedAt: "now" } };
    expect(isImportVerificationComplete(empty)).toBe(true);
    expect(isImportVerificationComplete({ ...empty, quickImportWorkflow: { phase: "verify" } })).toBe(false);
    expect(isImportVerificationComplete({ ...empty, createdBlackbaudConstituentId: null })).toBe(false);
  });
});
