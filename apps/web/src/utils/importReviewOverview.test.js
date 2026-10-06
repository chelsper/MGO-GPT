import { describe, expect, it } from "vitest";
import {
  importReviewGroup,
  importReviewOverview,
  importReviewOutcome,
  firstImportReviewRow,
  newRecordRequestedChanges,
  formatContactReviewChange,
} from "./importReviewOverview";

const update = {
  id: "1",
  status: "Ready",
  match: { blackbaudConstituentId: "101" },
  intentDisposition: { key: "ready_update" },
  writePlan: [{ type: "phone", action: "add", number: "9045551212" }],
};
const newRow = {
  id: "2",
  status: "Needs Review",
  intentDisposition: { key: "potential_new" },
  input: { firstName: "Avery", lastName: "Dolphin" },
  writePlan: [],
};

describe("import overview grouping", () => {
  it("counts each row once without trusting a stale server summary", () => {
    const rows = [
      update,
      newRow,
      { ...update, id: "3", status: "Conflict" },
      { ...update, id: "4", status: "Applied" },
      { ...update, id: "5", status: "Skipped" },
    ];
    const result = importReviewOverview(rows);
    expect(Object.values(result.groups).map((group) => group.length)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(result.total).toBe(5);
    expect(result.verified).toBe(0);
    expect(importReviewOutcome(rows[3])).toBe("Imported; not yet verified");
  });
  it.each([
    { appliedAt: "2026-10-06" },
    { status: "Applying" },
    { status: "Failed" },
    { quickCreateStatus: "uncertain" },
    { createRequestStartedAt: "2026-10-06" },
    { blackbaudResult: { results: [{ writeIndex: 0, status: "started" }] } },
    {
      blackbaudResult: {
        attempts: [{ results: [{ writeIndex: 0, status: "applied" }] }],
      },
    },
    { deferredHydration: { contacts: true } },
    { writePlan: [{ type: "phone", requiresReview: true }] },
    { writePlan: [{ type: "constituent_code", action: "replace" }] },
    { match: null },
    { writePlan: [] },
    { intentDisposition: { key: "possible_duplicate", allowApply: false } },
  ])("never presents held/attempted work as a ready update: %j", (change) => {
    expect(importReviewGroup({ ...update, ...change })).toBe("attention");
  });
  it("does not count an approved created row waiting for verification as completed", () => {
    const row = {
      ...update,
      status: "Applied",
      createdBlackbaudConstituentId: "101",
      quickImportWorkflow: { phase: "verify", approvedByUserId: "9" },
    };
    expect(importReviewGroup(row)).toBe("attention");
    expect(importReviewOverview([row]).groups.completed).toHaveLength(0);
  });
  it("keeps already-created records out of new creation and distinguishes partial results", () => {
    expect(
      importReviewGroup({ ...newRow, createdBlackbaudConstituentId: "101" }),
    ).toBe("attention");
    expect(
      importReviewOutcome({
        ...update,
        status: "Needs Review",
        blackbaudResult: {
          results: [
            { writeIndex: 0, status: "manual_required", partialApplied: true },
          ],
        },
      }),
    ).toBe("Partially completed");
    expect(
      importReviewOutcome({ ...newRow, quickCreateStatus: "uncertain" }),
    ).toBe("Creation needs verification");
  });
  it("counts completed verification only with matching confirmation evidence", () => {
    const row = {
      ...update,
      status: "Applied",
      blackbaudResult: {
        reconciliation: {
          verifiedAt: "2026-10-06",
          results: [{ writeIndex: 0, status: "confirmed" }],
        },
      },
    };
    expect(importReviewOverview([row]).verified).toBe(1);
    expect(importReviewOutcome(row)).toBe("Completed and verified");
  });
  it("opens exceptions before new candidates or ready updates, without losing completed-only imports", () => {
    const exception = { ...update, id: "3", status: "Conflict" };
    expect(firstImportReviewRow([update, newRow, exception])).toBe(exception);
    expect(firstImportReviewRow([update, newRow])).toBe(newRow);
    expect(firstImportReviewRow([update])).toBe(update);
    expect(
      firstImportReviewRow([{ ...update, status: "Applied" }]).status,
    ).toBe("Applied");
    expect(firstImportReviewRow([])).toBeNull();
  });
});

describe("plain-language change previews", () => {
  it("lists approved contact inputs, not raw matching-only values, and retains primary choices", () => {
    const row = {
      ...newRow,
      input: {
        ...newRow.input,
        email: "matching@example.test",
        addressLine1: "Matching only",
        emailUpdates: [
          {
            address: "import@example.test",
            type: "Personal",
            makePrimary: true,
          },
        ],
        phoneUpdates: [
          { number: "9045551212", type: "Mobile", makePrimary: false },
        ],
        addressUpdates: [
          {
            addressLine1: "1 Example St",
            city: "Jacksonville",
            state: "FL",
            postalCode: "32211",
            type: "Home",
          },
        ],
        targetConstituency: "Friend",
        action: "add",
        startDate: "2026-10-06",
      },
    };
    const lines = newRecordRequestedChanges(row).join("\n");
    expect(lines).toContain("First name: Avery; Last name: Dolphin");
    expect(lines).toContain(
      "import@example.test (Personal); primary requested",
    );
    expect(lines).toContain("9045551212 (Mobile); non-primary requested");
    expect(lines).toContain(
      "1 Example St, Jacksonville, FL, 32211 (Home); primary not specified",
    );
    expect(lines).not.toContain("matching@example.test");
    expect(lines).not.toContain("Matching only");
    expect(
      newRecordRequestedChanges({
        ...row,
        createdBlackbaudConstituentId: "101",
      }),
    ).toEqual([]);
  });
  it("distinguishes additions, replacements, existing primary changes and address retirement", () => {
    expect(
      formatContactReviewChange({
        type: "phone",
        action: "add",
        number: "9045551212",
        phoneType: "Mobile",
        makePrimary: true,
        demoteExistingPrimary: true,
      }),
    ).toBe(
      "Add phone: 9045551212 (Mobile); set as primary; previous primary becomes non-primary",
    );
    expect(
      formatContactReviewChange({
        type: "email_address",
        action: "replace",
        address: "new@example.test",
        targetId: "8",
        emailType: "Do not claim CSV type",
      }),
    ).toBe(
      "Replace selected email (NXT contact ID 8): new@example.test; keep its existing NXT type and primary setting",
    );
    expect(
      formatContactReviewChange({
        type: "phone",
        action: "set_primary",
        targetId: "9",
      }),
    ).toContain("Set existing phone as primary");
    expect(
      formatContactReviewChange({
        type: "address",
        action: "mark_previous",
        targetId: "10",
        validTo: "2026-10-06",
      }),
    ).toContain("only after the new address is confirmed");
    expect(
      formatContactReviewChange({
        type: "address",
        action: "add",
        addressLine1: "1 Example St",
        city: "Jacksonville",
        state: "FL",
        postalCode: "32211",
      }),
    ).toContain("Jacksonville, FL, 32211");
  });
});
