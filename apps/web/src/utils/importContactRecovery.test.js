import { describe, expect, it } from "vitest";
import { buildContactRecoveryPreview, contactRecoverySnapshot, getContactRecoveryRows } from "./importContactRecovery";
import { canChangeImportMatch } from "./importMatchReview";

const recoveryRun = { id: 42, defaults: { updateEmailFields: false, updatePhoneFields: false }, mappings: {
  email: "Email", emailType: "Email type", emailMakePrimary: "Primary email",
  phoneNumber: "Phone", phoneType: "Phone type", phoneMakePrimary: "Primary phone",
} };
const recoveryRow = { id: 9, run_id: 42, row_number: 1, status: "Applied", created_blackbaud_constituent_id: "123", matched_blackbaud_constituent_id: "123",
  created_blackbaud_lookup_id: "NEW-123", quick_create_status: "created",
  raw_row: { Email: "alex@example.com", "Email type": "Personal", "Primary email": "Yes", Phone: "904-555-0100", "Phone type": "Mobile", "Primary phone": "TRUE" },
  preview: { input: { firstName: "Alex", lastName: "Example", constituentName: "Alex Example", email: "alex@example.com", targetConstituency: "Alumni" },
    match: { blackbaudConstituentId: "123", lookupId: "NEW-123", name: "Alex Example", firstName: "Alex", lastName: "Example" } },
  requested_writes: [{ type: "constituent_code" }], blackbaud_result: { results: [{ writeIndex: 0, type: "constituent_code", status: "applied" }] },
};

describe("saved contact recovery", () => {
  it("recovers last night's omitted mapped contacts and primary flags without recreating identity", () => {
    const before = JSON.stringify(recoveryRow);
    const [entry] = getContactRecoveryRows(recoveryRun, [recoveryRow]);
    expect(entry).toMatchObject({ eligible: true, targetId: "123", emailUpdates: [{ address: "alex@example.com", type: "Personal", makePrimary: true }], phoneUpdates: [{ number: "904-555-0100", type: "Mobile", makePrimary: true }] });
    const preview = buildContactRecoveryPreview(recoveryRow, entry, { runId: 42, userId: 7, now: "2026-10-06" });
    expect(preview).toMatchObject({ importIntent: "updates", status: "Needs Review", input: { blackbaudConstituentId: "123", lookupId: "NEW-123" }, contactRecovery: { sourceRunId: "42", sourceRowId: "9", targetId: "123" }, deferredHydration: { contacts: true } });
    expect(preview.input).not.toHaveProperty("targetConstituency");
    expect(preview.input).not.toHaveProperty("nameUpdate");
    expect(preview.writePlan).toHaveLength(1);
    expect(preview.writePlan[0].requiresReview).toBe(true);
    expect(preview.contactReviewDecisions.email[0]).toEqual({ mode: "add", makePrimary: true });
    expect(canChangeImportMatch(preview)).toBe(false);
    expect(canChangeImportMatch({ status: "Ready", preview })).toBe(false);
    expect(JSON.stringify(recoveryRow)).toBe(before);
  });

  it("does not guess target IDs from uploaded IDs, names, or email", () => {
    expect(getContactRecoveryRows(recoveryRun, [{ ...recoveryRow, created_blackbaud_constituent_id: null }])).toEqual([]);
    const [unknown] = getContactRecoveryRows(recoveryRun, [{ ...recoveryRow, created_blackbaud_constituent_id: null, quick_create_status: "uncertain" }]);
    expect(unknown.eligible).toBe(false);
    expect(unknown.targetId).toBe("");
  });

  it.each(["Applying", "Creating"])("does not race a %s operation", (status) => {
    expect(getContactRecoveryRows(recoveryRun, [{ ...recoveryRow, status }])[0].eligible).toBe(false);
  });
  it.each(["started", "unconfirmed"])("holds %s writes rather than replaying", (status) => {
    const row = { ...recoveryRow, blackbaud_result: { results: [{ writeIndex: 0, type: "phone", status }] } };
    expect(getContactRecoveryRows(recoveryRun, [row])[0].eligible).toBe(false);
  });
  it("holds mismatched or uncertain created IDs", () => {
    for (const change of [{ matched_blackbaud_constituent_id: "999" }, { quick_create_status: "uncertain" }, { created_blackbaud_constituent_id: "bad-id" }]) {
      expect(getContactRecoveryRows(recoveryRun, [{ ...recoveryRow, ...change }])[0].eligible).toBe(false);
    }
  });
  it("keeps planned and attempted contacts in the original recovery flow", () => {
    for (const change of [
      { preview: { ...recoveryRow.preview, input: { ...recoveryRow.preview.input, emailUpdates: [{ address: "alex@example.com" }] } } },
      { requested_writes: [{ type: "email_address" }] },
      { blackbaud_result: { attempts: [{ results: [{ writeIndex: 0, type: "email_address", status: "applied" }] }] } },
    ]) {
      const [row] = getContactRecoveryRows(recoveryRun, [{ ...recoveryRow, ...change }]);
      expect(row.emailUpdates).toEqual([]);
      expect(row.stagedKinds).toContain("Email");
      expect(row.phoneUpdates).toHaveLength(1);
    }
    const [deferred] = getContactRecoveryRows(recoveryRun, [{ ...recoveryRow, requested_writes: [{ type: "contact_detail_review" }] }]);
    expect(deferred.hasOmittedContacts).toBe(false);
  });
  it("uses fallbacks only for blank types and never guesses primary flags", () => {
    const row = { ...recoveryRow, raw_row: { ...recoveryRow.raw_row, "Email type": "", "Primary phone": "", "Primary email": "no" } };
    expect(getContactRecoveryRows(recoveryRun, [row])[0].eligible).toBe(false);
    const [ready] = getContactRecoveryRows(recoveryRun, [row], { emailType: "Personal", phoneType: "Home" });
    expect(ready.eligible).toBe(true);
    expect(ready.emailUpdates[0]).toMatchObject({ type: "Personal", makePrimary: false });
    expect(ready.phoneUpdates[0]).toMatchObject({ type: "Mobile", makePrimary: null });
  });
  it.each([{ Email: "invalid" }, { "Primary email": "maybe" }, { Phone: "" }])("validates contacts without modifying saved source: %j", (change) => {
    const [entry] = getContactRecoveryRows(recoveryRun, [{ ...recoveryRow, raw_row: { ...recoveryRow.raw_row, ...change } }]);
    expect(entry.eligible).toBe(change.Phone === "");
  });
  it("retains secondary contacts and blocks competing primary choices", () => {
    const run = { ...recoveryRun, mappings: { ...recoveryRun.mappings, email2: "Other email", email2Type: "Other type", email2MakePrimary: "Other primary" } };
    const row = { ...recoveryRow, raw_row: { ...recoveryRow.raw_row, "Other email": "second@example.com", "Other type": "Business", "Other primary": "no" } };
    expect(getContactRecoveryRows(run, [row])[0]).toMatchObject({ eligible: true, emailUpdates: [{ address: "alex@example.com" }, { address: "second@example.com", makePrimary: false }] });
    row.raw_row["Other primary"] = "yes";
    expect(getContactRecoveryRows(run, [row])[0].eligible).toBe(false);
  });
  it("finds the same correction after reload instead of preparing a duplicate", () => {
    const [entry] = getContactRecoveryRows({ ...recoveryRun, defaults: { contactRecoveryRuns: { 9: "77" } } }, [recoveryRow]);
    expect(entry).toMatchObject({ recoveryRunId: "77", eligible: false });
  });
  it("never treats an unmapped column as a contact and snapshots audit fields for CAS", () => {
    expect(getContactRecoveryRows({ ...recoveryRun, mappings: {} }, [recoveryRow])[0].hasOmittedContacts).toBe(false);
    expect(contactRecoverySnapshot([recoveryRow])[0]).toMatchObject({ id: "9", status: "Applied", result: recoveryRow.blackbaud_result, rawRow: recoveryRow.raw_row });
  });
});
