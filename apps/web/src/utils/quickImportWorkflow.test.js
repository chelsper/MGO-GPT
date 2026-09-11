import { describe, it, expect } from "vitest";
import { validateNewRecordContacts, quickImportCandidates } from "./newConstituentImport";
import { importMatchEvidence } from "./importMatchEvidence";
import { quickImportInputKey, quickImportApplyBlocker, quickImportResumeCandidate, importRecoveryState } from "./quickImportWorkflow";

const input = { firstName: "Jane", lastName: "Dolphin", emailUpdates: [
  { address: "jane@example.com", type: "Work", makePrimary: true },
  { address: "jane2@example.com", type: "Home", makePrimary: false },
] };
const row = () => ({ status: "Ready", created_blackbaud_constituent_id: "44", matched_blackbaud_constituent_id: "44",
  preview: { input, quickImportWorkflow: { phase: "apply", constituentId: "44", approvedByUserId: "7", inputKey: quickImportInputKey(input) } },
  requested_writes: [{ type: "email_address", action: "add", address: "jane2@example.com", makePrimary: false }],
});

describe("clear-new-record contact preflight", () => {
  it("preserves multiple valid contacts and accepts explicit non-primary choices", () => {
    const before = JSON.stringify(input);
    expect(() => validateNewRecordContacts(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
    expect(() => validateNewRecordContacts({ emailUpdates: input.emailUpdates.map((value) => ({ ...value, makePrimary: false })) })).not.toThrow();
    expect(() => validateNewRecordContacts({ addressUpdates: [{ addressLine1: "1 Main St", type: "Home", validFrom: "2026-09-11", makePrimary: false }] })).not.toThrow();
  });
  it.each([
    input.emailUpdates.map((value) => ({ ...value, makePrimary: true })),
    input.emailUpdates.map((value) => ({ ...value, makePrimary: null })),
    [input.emailUpdates[0], { ...input.emailUpdates[1], address: "bad" }],
    [input.emailUpdates[0], { ...input.emailUpdates[1], type: "" }],
    [input.emailUpdates[0], { ...input.emailUpdates[1], address: "JANE@example.com" }],
  ].map((emailUpdates) => ({ emailUpdates })))("holds ambiguous or invalid contacts before a create", ({ emailUpdates }) => {
    expect(() => validateNewRecordContacts({ emailUpdates })).toThrow();
  });
  it("checks matching evidence from every added contact, including local previous rows", () => {
    expect(importMatchEvidence(input, { id: "5", first: "Other", last: "Person", email: "jane2@example.com" }).rank).toBe(90);
    expect(importMatchEvidence({ email: "jane2@example.com" }, { id: "5", ...input }).rank).toBe(90);
    expect(importMatchEvidence({ addressUpdates: [{ addressLine1: "10 Main St", postalCode: "32211" }] }, { id: "5", address: "10 Main Street", postalCode: "32211-5555" }).rank).toBe(40);
  });
  it("rechecks only the known legacy contact hold, never duplicate or uncertain holds", () => {
    const base = { status: "Needs Review", intentDisposition: { key: "potential_new" }, quickCreateStatus: "review", blackbaudError: "Multiple contacts of one kind need individual review before quick creation. No NXT record was created." };
    expect(quickImportCandidates([base])).toEqual([base]);
    expect(importRecoveryState(base).resume).toBe(true);
    expect(quickImportCandidates([{ ...base, createRequestStartedAt: "now" }, { ...base, createdBlackbaudConstituentId: "44" }, { ...base, blackbaudError: "Possible duplicate" }])).toEqual([]);
  });
});

describe("automatic completion approval", () => {
  it("allows additions to exactly the approved newly created record", () => {
    expect(quickImportApplyBlocker(row())).toBeNull();
    expect(quickImportResumeCandidate(row())).toBe(true);
  });
  it.each(["matched_blackbaud_constituent_id", "created_blackbaud_constituent_id"])("rejects changed %s", (key) => {
    expect(quickImportApplyBlocker({ ...row(), [key]: "99" })).toMatch(/exact new record/);
  });
  it("rejects source changes and old or already attempted plans", () => {
    const changed = row();
    changed.preview = { ...changed.preview, input: { ...input, lastName: "Different" } };
    expect(quickImportApplyBlocker(changed)).toMatch(/source values changed/);
    expect(quickImportApplyBlocker({ ...row(), blackbaud_result: { results: [{ writeIndex: 0, status: "unconfirmed" }] } })).toMatch(/checkpoint/);
    expect(quickImportApplyBlocker({ ...row(), status: "Applying" })).toMatch(/processing/);
  });
  it.each([
    { type: "phone", action: "replace", targetId: "5" },
    { type: "address", action: "add", demoteExistingPrimary: true },
    { type: "constituent_code", action: "replace", sourceCodeId: "5" },
    { type: "education_relationship", action: "update" },
    { type: "constituent_profile", action: "update" },
    { type: "contact_detail_review", requiresReview: true },
  ])("does not auto-approve unsafe writes: %j", (write) => {
    expect(quickImportApplyBlocker({ ...row(), requested_writes: [write] })).toBeTruthy();
  });
  it("does not resume completed, skipped or manually held workflows", () => {
    for (const phase of ["review", "complete"]) {
      const value = row(); value.preview.quickImportWorkflow.phase = phase;
      expect(quickImportResumeCandidate(value)).toBe(false);
    }
    expect(quickImportResumeCandidate({ ...row(), status: "Skipped" })).toBe(false);
  });
  it("does not confuse duplicate-email holds with contact choices or completed rows with errors", () => {
    expect(importRecoveryState({ blackbaudError: "NXT found a possible email match. Held for review." }).title).toBe("Possible duplicate");
    expect(importRecoveryState({ status: "Applied", quickImportWorkflow: { phase: "complete", message: "Verified and complete" } })).toBeNull();
  });
});
