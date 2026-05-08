import {
  buildConstituentCustomFieldPayload,
  buildProspectPoolExportRows,
  buildDesiredProspectStatusUpdate,
  DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
  DESIRED_NXT_CUSTOM_FIELD_VALUE,
  DESIRED_NXT_COMMENT,
  getProspectPoolAssignmentStatus,
  getProspectPoolSyncLabel,
  getProspectPoolTodayDate,
  planProspectStatusSync,
  PROSPECT_POOL_ASSIGNMENT_STATUS,
  PROSPECT_POOL_NXT_SYNC_STATUS,
  serializeProspectPoolExportRows,
} from "./workflow";

describe("prospect pool workflow helpers", () => {
  it("uses the app timezone when deriving today's assignment date", () => {
    const value = getProspectPoolTodayDate(new Date("2026-05-08T03:30:00.000Z"));
    expect(value).toBe("2026-05-07");
  });

  it("marks assignments without a linked constituent/system record as manual required", () => {
    const plan = planProspectStatusSync({
      blackbaudConstituentId: null,
      now: new Date("2026-05-08T14:00:00.000Z"),
    });

    expect(plan).toMatchObject({
      desiredNxtProspectStatus: DESIRED_NXT_CUSTOM_FIELD_VALUE,
      desiredNxtComment: DESIRED_NXT_COMMENT,
      syncStatus: PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED,
      manualUpdateRequired: true,
    });
    expect(plan.errorMessage).toMatch(/no linked constituent\/system record id/i);
  });

  it("keeps missing constituent/system record links in manual-required state", () => {
    const plan = planProspectStatusSync({
      blackbaudConstituentId: null,
      now: new Date("2026-05-08T14:00:00.000Z"),
    });

    expect(plan.syncStatus).toBe(PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED);
    expect(plan.manualUpdateRequired).toBe(true);
    expect(plan.errorMessage).toMatch(/no linked constituent\/system record id/i);
  });

  it("can express a pending sync when a supported capability is injected", () => {
    const plan = planProspectStatusSync({
      blackbaudConstituentId: "234684",
      capability: { supported: true },
      now: new Date("2026-05-08T14:00:00.000Z"),
    });

    expect(plan.syncStatus).toBe(PROSPECT_POOL_NXT_SYNC_STATUS.PENDING);
    expect(plan.manualUpdateRequired).toBe(false);
    expect(plan.errorMessage).toBeNull();
  });

  it("builds export rows and CSV output for unresolved assignments", () => {
    const rows = buildProspectPoolExportRows([
      {
        blackbaud_constituent_id: "234684",
        desired_nxt_custom_field_category: DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
        desired_nxt_custom_field_value: DESIRED_NXT_CUSTOM_FIELD_VALUE,
        desired_nxt_start_date: "2026-05-08",
        desired_nxt_comment: DESIRED_NXT_COMMENT,
        assigned_to_name: "Gretchen Picotte",
        assigned_by_name: "Chelsea Santoro",
        assigned_at: "2026-05-08T14:00:00.000Z",
        nxt_sync_status: PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED,
        nxt_sync_error: "Manual NXT update required",
      },
    ]);

    expect(rows).toEqual([
      {
        blackbaudConstituentId: "234684",
        desiredNxtCustomFieldCategory: DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
        desiredNxtCustomFieldValue: DESIRED_NXT_CUSTOM_FIELD_VALUE,
        desiredNxtStartDate: "2026-05-08",
        desiredNxtComment: DESIRED_NXT_COMMENT,
        assignedToName: "Gretchen Picotte",
        assignedByName: "Chelsea Santoro",
        assignmentDate: "2026-05-08",
        nxtSyncStatus: PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED,
        errorMessage: "Manual NXT update required",
      },
    ]);

    const csv = serializeProspectPoolExportRows(rows);
    expect(csv).toContain('"Constituent ID / system record ID"');
    expect(csv).toContain('"234684"');
    expect(csv).toContain('"Gretchen Picotte"');
  });

  it("exposes assignment and sync labels without conflating app assignment and NXT state", () => {
    expect(getProspectPoolAssignmentStatus(44)).toBe(
      PROSPECT_POOL_ASSIGNMENT_STATUS.ACTIVE,
    );
    expect(getProspectPoolAssignmentStatus(null)).toBe(
      PROSPECT_POOL_ASSIGNMENT_STATUS.PENDING,
    );
    expect(getProspectPoolSyncLabel(PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED)).toBe(
      "Manual NXT custom field update required",
    );
  });

  it("builds the desired prospect status payload exactly once per assignment", () => {
    expect(
      buildDesiredProspectStatusUpdate(new Date("2026-05-08T14:00:00.000Z")),
    ).toEqual({
      desiredNxtProspectStatus: DESIRED_NXT_CUSTOM_FIELD_VALUE,
      desiredNxtCustomFieldCategory: DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
      desiredNxtCustomFieldValue: DESIRED_NXT_CUSTOM_FIELD_VALUE,
      desiredNxtStartDate: "2026-05-08",
      desiredNxtComment: DESIRED_NXT_COMMENT,
    });
  });

  it("sends the MGOGPT table-backed value in both generic and code-table fields", () => {
    const payload = buildConstituentCustomFieldPayload(
      buildDesiredProspectStatusUpdate(new Date("2026-05-08T14:00:00.000Z")),
    );

    expect(payload).toEqual({
      category: DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
      value: DESIRED_NXT_CUSTOM_FIELD_VALUE,
      codetableentry_value: DESIRED_NXT_CUSTOM_FIELD_VALUE,
      comment: DESIRED_NXT_COMMENT,
      date: "2026-05-08",
    });
  });
});
