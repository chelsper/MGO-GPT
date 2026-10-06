import { describe, expect, it } from "vitest";
import { importFieldResults, importFieldResultExport, savedImportContactContext } from "./importFieldResults";
import { importWritePlanKey } from "./importWriteResults";
import { importContactMappingKey, IMPORT_CONTACT_GROUPS } from "./importContactPreflight";
import { quickImportInputKey } from "./quickImportWorkflow";

const phone = { type: "phone", action: "add", number: "9045551212", phoneType: "Cell", makePrimary: true };
const base = () => ({ id: "9", status: "Applied", input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [phone],
  blackbaudResult: { writePlanKey: importWritePlanKey([phone]), results: [{ type: "phone", writeIndex: 0, status: "applied" }] } });
const verify = (row, status = "confirmed") => ({ ...row, blackbaudResult: { ...row.blackbaudResult, reconciliation: {
  scope: "requested_fields_and_settings", verifiedAt: "2026-10-06T12:00:00Z", results: row.writePlan.map((write, writeIndex) => ({ type: write.type, writeIndex, status, message: "Saved check result" })),
} } });

describe("saved field result evidence", () => {
  it("does not equate Applied with verified, and includes primary as its own outcome", () => {
    const result = importFieldResults(base());
    expect(result.fields.map(({ field, status }) => ({ field, status }))).toEqual([
      { field: "Phone", status: "Awaiting verification" }, { field: "Phone type", status: "Awaiting verification" }, { field: "Phone primary setting", status: "Awaiting verification" },
    ]);
    expect(result.verified).toBe(0);
    expect(result.next.kind).toBe("verify");
  });
  it("uses the saved per-write verification, not the run count or timestamp alone", () => {
    const row = verify(base());
    expect(importFieldResults(row).fields.every((field) => field.state === "verified")).toBe(true);
    expect(importFieldResults(row).next).toBeNull();
    row.blackbaudResult.reconciliation.results = [];
    expect(importFieldResults(row).verified).toBe(0);
    row.blackbaudResult.reconciliation.results = [{ writeIndex: 5, status: "confirmed" }];
    expect(importFieldResults(row).verified).toBe(0);
  });
  it.each([undefined, "applied_values"])("does not overstate legacy contact checks with scope %s", (scope) => {
    const row = base();
    row.writePlan = [{ ...phone, demoteExistingPrimary: true, demotedPrimaryType: "Other" }];
    row.blackbaudResult.writePlanKey = importWritePlanKey(row.writePlan);
    const checked = verify(row);
    checked.blackbaudResult.reconciliation.scope = scope;
    const result = importFieldResults(checked);
    expect(result.fields.map(({ field, state }) => [field, state])).toEqual([
      ["Phone", "verified"], ["Phone type", "awaiting"], ["Phone primary setting", "verified"], ["Phone previous primary", "awaiting"],
    ]);
    expect(result.next).toMatchObject({ kind: "verify", completeIfMatches: true });
    checked.blackbaudResult.completion = { method: "verified_existing_nxt" };
    expect(importFieldResults(checked).fields.every((field) => field.state === "verified")).toBe(true);
  });
  it.each(["replace", "skip_existing", "set_primary"])("does not claim a preserved contact type was changed for %s", (action) => {
    const row = base();
    if (action === "replace") row.writePlan = [{ ...phone, action }];
    else row.blackbaudResult.results[0].action = action;
    row.blackbaudResult.writePlanKey = importWritePlanKey(row.writePlan);
    expect(importFieldResults(verify(row)).fields.find((field) => field.field === "Phone type").state).toBe("unchanged");
  });
  it.each([
    (row) => { row.writePlan = [{ ...phone, number: "different" }]; },
    (row) => { row.createdBlackbaudConstituentId = "999"; },
    (row) => { row.quickCreateStatus = "uncertain"; },
    (row) => { row.blackbaudResult.reconciliation.results[0].type = "email_address"; },
    (row) => { row.blackbaudResult.results[0].type = "email_address"; },
    (row) => { row.blackbaudResult.reconciliation.results.push({ writeIndex: 0, status: "confirmed" }); },
    (row) => { row.blackbaudResult.appliedAt = "2026-10-07T12:00:00Z"; },
    (row) => { row.blackbaudResult.reconciliation.verifiedAt = "not a date"; },
    (row) => { row.status = "Applying"; },
  ])("does not use stale, conflicting, malformed, or active evidence", (change) => {
    const row = verify(base()); change(row);
    expect(importFieldResults(row).verified).toBe(0);
  });
  it("preserves outcomes from earlier attempts without proposing a resend", () => {
    const row = base();
    row.status = "Failed";
    row.writePlan.push({ type: "email_address", address: "test@example.test" });
    row.blackbaudResult = { writePlanKey: importWritePlanKey(row.writePlan), attempts: [{ results: [{ type: "phone", writeIndex: 0, status: "applied" }] }],
      results: [{ type: "email_address", writeIndex: 1, status: "unconfirmed" }] };
    const result = importFieldResults(row);
    expect(result.fields.every((field) => field.state === "awaiting")).toBe(true);
    expect(result.next).toMatchObject({ kind: "verify", label: "Verify in NXT and finish" });
  });
  it("keeps partial primary changes in review instead of claiming the value or primary was verified", () => {
    const row = base();
    row.status = "Needs Review";
    row.blackbaudResult.results[0] = { writeIndex: 0, type: "phone", status: "manual_required", partialApplied: true };
    expect(importFieldResults(row).fields.every((field) => field.state === "attention")).toBe(true);
    expect(importFieldResults(row).next.kind).toBe("verify");
    expect(importFieldResults(verify(row, "needs_review")).verified).toBe(0);
  });
  it("separates name and profile fields covered by the same verified write", () => {
    const row = base();
    row.writePlan = [{ type: "constituent_name", firstName: "Jane", lastName: "Dolphin", preferredName: "Jay" }, { type: "constituent_profile", title: "Dr.", suffix: "Jr." }];
    row.blackbaudResult = { writePlanKey: importWritePlanKey(row.writePlan) };
    expect(importFieldResults(verify(row)).fields.map((field) => field.field)).toEqual(["First name", "Last name", "Preferred name", "Title", "Suffix"]);
    expect(importFieldResults(verify(row)).verified).toBe(5);
  });
  it("does not let a creation ID verify names or contacts", () => {
    const row = { ...base(), createdBlackbaudConstituentId: "123", input: { firstName: "Jane", lastName: "Dolphin" } };
    const result = importFieldResults(row);
    expect(result.fields.find((field) => field.field === "Constituent record").state).toBe("awaiting");
    expect(result.fields.find((field) => field.field === "First name").state).toBe("awaiting");
    expect(result.verified).toBe(0);
  });
  it("limits a completed identity check to unchanged identity data", () => {
    const row = { ...base(), createdBlackbaudConstituentId: "123", input: { firstName: "Jane", lastName: "Dolphin", preferredName: "Jay" }, match: { blackbaudConstituentId: "123", firstName: "Jane", lastName: "Dolphin" } };
    row.quickImportWorkflow = { phase: "complete", constituentId: "123", identityConfirmedAt: "2026-10-06", inputKey: quickImportInputKey(row.input) };
    const fields = importFieldResults(row).fields;
    expect(fields.find((field) => field.field === "First name").state).toBe("verified");
    expect(fields.find((field) => field.field === "Preferred name").state).toBe("awaiting");
    row.input.firstName = "Changed";
    expect(importFieldResults(row).verified).toBe(0);
  });
  it("recognizes a completed standard import's identity check without requiring the quick workflow", () => {
    const row = verify({ ...base(), createdBlackbaudConstituentId: "123", input: { firstName: "Jane", lastName: "Dolphin" },
      match: { blackbaudConstituentId: "123", firstName: "Jane", lastName: "Dolphin" } });
    row.blackbaudResult.completion = { method: "verified_existing_nxt" };
    const result = importFieldResults(row);
    expect(result.fields.every((field) => field.state === "verified")).toBe(true);
    expect(result.next).toBeNull();
    expect(result.fields.find((field) => field.field === "Constituent record").checkedAt).toBe("2026-10-06T12:00:00Z");
    row.blackbaudResult.reconciliation.results[0].status = "needs_review";
    expect(importFieldResults(row).fields.find((field) => field.field === "Constituent record").state).toBe("awaiting");
  });
  it("shows skipped choices and no-op fields without claiming a successful write", () => {
    const row = { status: "Needs Review", writePlan: [], input: { nameUpdate: { firstName: "Jane" }, targetConstituency: "Alumni",
      emailUpdates: [{ address: "test@example.test", makePrimary: true }], phoneUpdates: [{ number: "9045551212", makePrimary: true }] },
    fieldReviewDecisions: { constituent_name: { firstName: { mode: "skip" } } }, contactReviewDecisions: { email: { 0: { mode: "skip" } } } };
    const fields = importFieldResults(row).fields;
    expect(fields.find((field) => field.field === "First name").state).toBe("skipped");
    expect(fields.find((field) => field.field === "Email").state).toBe("skipped");
    expect(fields.find((field) => field.field === "Phone").state).toBe("unchanged");
    expect(fields.find((field) => field.field === "Phone primary setting").state).toBe("attention");
    expect(fields.find((field) => field.field === "Constituency code").state).toBe("unchanged");
    expect(fields.some((field) => field.state === "verified")).toBe(false);
  });
  it("uses each contact value rather than merging separate contacts into one result", () => {
    const row = base();
    row.input.phoneUpdates = [{ number: "9045551212" }, { number: "9045550000" }];
    row.contactReviewDecisions = { phone: { 1: { mode: "skip" } } };
    const fields = importFieldResults(verify(row)).fields.filter((field) => field.field === "Phone");
    expect(fields.map((field) => field.state)).toEqual(["verified", "skipped"]);
  });
  it("does not merge addresses that share a street but differ in city", () => {
    const row = base();
    row.writePlan = [{ type: "address", addressLine1: "100 Oak Street", city: "Jacksonville" }];
    row.blackbaudResult = { writePlanKey: importWritePlanKey(row.writePlan) };
    row.input.addressUpdates = [{ addressLine1: "100 Oak Street", city: "Tampa" }];
    expect(importFieldResults(verify(row)).fields.map((field) => field.state)).toEqual(["verified", "unchanged"]);
  });
  it("does not use another contact's primary operation to cover a requested primary setting", () => {
    const row = base();
    row.writePlan = [{ type: "phone", action: "set_primary", targetId: "other" }];
    row.blackbaudResult = { writePlanKey: importWritePlanKey(row.writePlan) };
    row.input.phoneUpdates = [{ number: "9045551212", makePrimary: true }];
    const primary = importFieldResults(verify(row)).fields.filter((field) => field.field === "Phone primary setting");
    expect(primary.map((field) => field.state)).toEqual(["verified", "attention"]);
  });
  it("retains failed attempted work when a row is skipped", () => {
    const row = base(); row.status = "Skipped";
    expect(importFieldResults(row).fields.every((field) => field.state === "awaiting")).toBe(true);
    expect(importFieldResults(row).next.kind).toBe("history");
  });
});

describe("omitted contacts and next actions", () => {
  const source = () => ({ id: "9", created_blackbaud_constituent_id: "123", raw_row: { Email: "test@example.test", Primary: "Yes", Unmapped: "private" }, preview: { input: {}, writePlan: [] } });
  const run = () => ({ mappings: { email: "Email", emailMakePrimary: "Primary" }, defaults: {} });
  it("detects legacy omissions using saved mappings without returning unrelated source data", () => {
    const context = savedImportContactContext(source(), run());
    expect(context).toEqual({ correctionRunId: null, omissions: [{ kind: "email", value: "test@example.test", type: "", makePrimary: true, intentional: false }] });
    expect(JSON.stringify(context)).not.toContain("private");
    expect(savedImportContactContext(source(), {}).omissions).toEqual([]);
  });
  it("requires exact saved mappings for intentional omission", () => {
    const config = run();
    config.defaults.contactMatchingOnly = { email: importContactMappingKey(config.mappings, IMPORT_CONTACT_GROUPS[0]) };
    expect(savedImportContactContext(source(), config).omissions[0].intentional).toBe(true);
    config.mappings.emailType = "Type";
    expect(savedImportContactContext(source(), config).omissions[0].intentional).toBe(false);
  });
  it.each([
    (row) => { row.preview.input.emailUpdates = [{ address: "test@example.test" }]; },
    (row) => { row.requested_writes = [{ type: "email_address" }]; },
    (row) => { row.preview.writePlan = [{ type: "contact_detail_review" }]; },
    (row) => { row.blackbaud_result = { attempts: [{ results: [{ writeIndex: 0, type: "email_address", status: "unconfirmed" }] }] }; },
  ])("does not recover contacts already included or attempted", (change) => {
    const row = source(); change(row);
    expect(savedImportContactContext(row, run()).omissions).toEqual([]);
  });
  it("routes a legacy omission to recovery, but honors an intentional omission", () => {
    const row = { status: "Applied", createdBlackbaudConstituentId: "123", writePlan: [], savedContactContext: savedImportContactContext(source(), run()) };
    expect(importFieldResults(row).next.kind).toBe("recover");
    row.savedContactContext.omissions[0].intentional = true;
    expect(importFieldResults(row).fields.find((field) => field.field === "Email").state).toBe("skipped");
    expect(importFieldResults(row).next.kind).not.toBe("recover");
  });
  it("opens a linked correction without claiming it succeeded or proposing another correction", () => {
    const row = { status: "Applied", createdBlackbaudConstituentId: "123", savedContactContext: savedImportContactContext(source(), { ...run(), defaults: { contactRecoveryRuns: { 9: "77" } } }) };
    expect(importFieldResults(row).next).toMatchObject({ kind: "correction", runId: "77" });
    expect(importFieldResults(row).fields.find((field) => field.field === "Email").state).toBe("linked");
  });
  it("prioritizes uncertainty and in-flight work over recovery", () => {
    const row = { ...base(), savedContactContext: { omissions: [{ kind: "email", value: "test@example.test" }] }, createdBlackbaudConstituentId: "123" };
    expect(importFieldResults(row).next.kind).toBe("verify");
    expect(importFieldResults({ ...row, quickCreateStatus: "uncertain" }).next.kind).toBe("history");
    expect(importFieldResults({ ...row, status: "Applying" }).next.kind).toBe("wait");
  });
  it("exports IDs, outcomes, primary status, checked time and the safe next step from the same evidence", () => {
    const row = verify(base(), "needs_review");
    const exported = importFieldResultExport(row);
    expect(exported.resultSystemId).toBe("123");
    expect(exported.fieldResults).toContain("Phone primary setting: Needs attention");
    expect(exported.outstandingFields).toContain("Phone: Needs attention");
    expect(exported.nextStep).toContain("read-only");
    expect(importFieldResultExport(verify(base())).fieldResults).toContain("Checked 2026-10-06T12:00:00Z");
  });
});
