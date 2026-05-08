export const ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES = "Advancement Services";
export const DESIRED_NXT_CUSTOM_FIELD_CATEGORY = "MGOGPT";
export const DESIRED_NXT_CUSTOM_FIELD_VALUE = "Identification/Re-Qualification";
export const DESIRED_NXT_COMMENT = "Assigned by Advancement Services";

export const PROSPECT_POOL_ASSIGNMENT_STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
};

export const PROSPECT_POOL_NXT_SYNC_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
  MANUAL_REQUIRED: "manual_required",
};

const APP_TIME_ZONE = "America/New_York";

export function getProspectPoolTodayDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getProspectStatusUpdateCapability() {
  return {
    supported: true,
    mode: "create_or_validate_constituent_custom_field",
    reason:
      "This workflow targets the MGOGPT constituent custom field instead of Prospect Management status.",
    canUpdateExistingValues: false,
  };
}

export function buildDesiredProspectStatusUpdate(now = new Date()) {
  return {
    desiredNxtProspectStatus: DESIRED_NXT_CUSTOM_FIELD_VALUE,
    desiredNxtCustomFieldCategory: DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
    desiredNxtCustomFieldValue: DESIRED_NXT_CUSTOM_FIELD_VALUE,
    desiredNxtStartDate: getProspectPoolTodayDate(now),
    desiredNxtComment: DESIRED_NXT_COMMENT,
  };
}

export function normalizeCustomFieldText(value) {
  return String(value || "").trim().toLowerCase();
}

export function findMatchingCustomField(customFields, categoryName) {
  const normalizedCategory = normalizeCustomFieldText(categoryName);
  return (Array.isArray(customFields) ? customFields : []).find(
    (field) => normalizeCustomFieldText(field?.category) === normalizedCategory,
  );
}

export function getCustomFieldDisplayValue(field) {
  return (
    field?.value ??
    field?.code_table_entry ??
    field?.code_table_entry_name ??
    field?.code_table_entry_description ??
    field?.codetableentry_value ??
    null
  );
}

export function buildConstituentCustomFieldPayload(syncPlan) {
  return {
    category: syncPlan.desiredNxtCustomFieldCategory,
    codetableentry_value: syncPlan.desiredNxtCustomFieldValue,
    comment: syncPlan.desiredNxtComment,
    date: syncPlan.desiredNxtStartDate,
  };
}

export function buildProspectPoolSyncDebug({ operation, endpointPath, detail, customFieldId }) {
  return {
    operation: operation || null,
    endpointPath: endpointPath || null,
    detail: detail || null,
    customFieldId: customFieldId ? String(customFieldId) : null,
    recordedAt: new Date().toISOString(),
  };
}

export function getProspectPoolAssignmentStatus(assignedUserId) {
  return assignedUserId
    ? PROSPECT_POOL_ASSIGNMENT_STATUS.ACTIVE
    : PROSPECT_POOL_ASSIGNMENT_STATUS.PENDING;
}

export function planProspectStatusSync({
  blackbaudConstituentId,
  now = new Date(),
  capability = getProspectStatusUpdateCapability(),
}) {
  const desired = buildDesiredProspectStatusUpdate(now);

  if (!blackbaudConstituentId) {
    return {
      ...desired,
      syncStatus: PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED,
      manualUpdateRequired: true,
      errorMessage:
        "Manual NXT update required: no linked constituent/system record ID is available for this assignment.",
      syncedAt: null,
    };
  }

  if (!capability?.supported) {
    return {
      ...desired,
      syncStatus: PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED,
      manualUpdateRequired: true,
      errorMessage:
        capability?.reason ||
        "Manual NXT update required: automated MGOGPT custom field sync is unavailable.",
      syncedAt: null,
    };
  }

  return {
    ...desired,
    syncStatus: PROSPECT_POOL_NXT_SYNC_STATUS.PENDING,
    manualUpdateRequired: false,
    errorMessage: null,
    syncedAt: null,
  };
}

export function getProspectPoolSyncLabel(syncStatus) {
  switch (syncStatus) {
    case PROSPECT_POOL_NXT_SYNC_STATUS.SUCCESS:
      return "Assigned in app, MGOGPT custom field updated successfully";
    case PROSPECT_POOL_NXT_SYNC_STATUS.FAILED:
      return "Assigned in app, MGOGPT custom field update failed";
    case PROSPECT_POOL_NXT_SYNC_STATUS.PENDING:
      return "Assigned in app, MGOGPT custom field update pending";
    case PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED:
    default:
      return "Manual NXT custom field update required";
  }
}

export function serializeProspectPoolExportRows(rows) {
  const headers = [
    "Constituent ID / system record ID",
    "Custom field category",
    "Custom field value",
    "Start date",
    "Comment",
    "Assigned MGO",
    "Assigned by",
    "Assignment date",
    "NXT sync status",
    "Error message",
  ];

  const csvRows = [headers];
  for (const row of rows) {
    csvRows.push([
      row.blackbaudConstituentId || "",
      row.desiredNxtCustomFieldCategory || DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
      row.desiredNxtCustomFieldValue || DESIRED_NXT_CUSTOM_FIELD_VALUE,
      row.desiredNxtStartDate || "",
      row.desiredNxtComment || DESIRED_NXT_COMMENT,
      row.assignedToName || "",
      row.assignedByName || "",
      row.assignmentDate || "",
      row.nxtSyncStatus || "",
      row.errorMessage || "",
    ]);
  }

  return csvRows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

export function buildProspectPoolExportRows(audits) {
  return audits.map((audit) => ({
    blackbaudConstituentId: audit.blackbaud_constituent_id || "",
    desiredNxtCustomFieldCategory:
      audit.desired_nxt_custom_field_category || DESIRED_NXT_CUSTOM_FIELD_CATEGORY,
    desiredNxtCustomFieldValue:
      audit.desired_nxt_custom_field_value ||
      audit.desired_nxt_prospect_status ||
      DESIRED_NXT_CUSTOM_FIELD_VALUE,
    desiredNxtStartDate: audit.desired_nxt_start_date || "",
    desiredNxtComment: audit.desired_nxt_comment || DESIRED_NXT_COMMENT,
    assignedToName: audit.assigned_to_name || "",
    assignedByName: audit.assigned_by_name || "",
    assignmentDate: audit.assigned_at
      ? String(audit.assigned_at).split("T")[0]
      : "",
    nxtSyncStatus: audit.nxt_sync_status || PROSPECT_POOL_NXT_SYNC_STATUS.MANUAL_REQUIRED,
    errorMessage: audit.nxt_sync_error || "",
  }));
}

export async function findDuplicateActiveAssignment({
  sql,
  assignedUserId,
  blackbaudConstituentId,
  normalizedName,
  excludeEntryId = null,
}) {
  if (!assignedUserId) return null;

  const blackbaudValue = String(blackbaudConstituentId || "").trim() || null;
  const normalizedValue = String(normalizedName || "").trim() || null;

  if (!blackbaudValue && !normalizedValue) {
    return null;
  }

  const result = await sql`
    SELECT id, prospect_name, assigned_user_id, blackbaud_constituent_id, normalized_name
    FROM prospect_pool
    WHERE assigned_user_id = ${assignedUserId}
      AND assignment_status = 'active'
      AND (${excludeEntryId}::BIGINT IS NULL OR id <> ${excludeEntryId})
      AND (
        (${blackbaudValue}::TEXT IS NOT NULL AND blackbaud_constituent_id = ${blackbaudValue})
        OR (${blackbaudValue}::TEXT IS NULL AND ${normalizedValue}::TEXT IS NOT NULL AND normalized_name = ${normalizedValue})
      )
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `;

  return result[0] || null;
}

export async function createAssignmentAudit({
  sql,
  prospectPoolId,
  constituentId,
  blackbaudConstituentId,
  constituentName,
  assignedToUserId,
  assignedToName,
  assignedByUserId,
  assignedByName,
  assignedAt,
  assignmentSource = ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
  assignmentStatus = PROSPECT_POOL_ASSIGNMENT_STATUS.ACTIVE,
  syncPlan,
  retryCount = 0,
}) {
  const inserted = await sql`
    INSERT INTO prospect_pool_assignment_audits (
      prospect_pool_id,
      constituent_id,
      blackbaud_constituent_id,
      constituent_name,
      assigned_to_user_id,
      assigned_to_name,
      assigned_by_user_id,
      assigned_by_name,
      assigned_at,
      assignment_source,
      assignment_status,
      desired_nxt_prospect_status,
      desired_nxt_custom_field_category,
      desired_nxt_custom_field_value,
      desired_nxt_start_date,
      desired_nxt_comment,
      nxt_sync_status,
      nxt_sync_error,
      nxt_sync_debug,
      nxt_sync_attempted_at,
      nxt_synced_at,
      retry_count,
      manual_update_required,
      created_at,
      updated_at
    )
    VALUES (
      ${prospectPoolId},
      ${constituentId || null},
      ${blackbaudConstituentId || null},
      ${constituentName},
      ${assignedToUserId || null},
      ${assignedToName},
      ${assignedByUserId || null},
      ${assignedByName},
      ${assignedAt},
      ${assignmentSource},
      ${assignmentStatus},
      ${syncPlan.desiredNxtProspectStatus},
      ${syncPlan.desiredNxtCustomFieldCategory || DESIRED_NXT_CUSTOM_FIELD_CATEGORY},
      ${syncPlan.desiredNxtCustomFieldValue || DESIRED_NXT_CUSTOM_FIELD_VALUE},
      ${syncPlan.desiredNxtStartDate},
      ${syncPlan.desiredNxtComment},
      ${syncPlan.syncStatus},
      ${syncPlan.errorMessage},
      ${syncPlan.debug ? JSON.stringify(syncPlan.debug) : null}::jsonb,
      NOW(),
      ${syncPlan.syncedAt || null},
      ${retryCount},
      ${syncPlan.manualUpdateRequired},
      NOW(),
      NOW()
    )
    RETURNING *
  `;

  return inserted[0] || null;
}

export async function applyAssignmentStateToProspectPool({
  sql,
  prospectPoolId,
  assignedUserId,
  assignmentUpdatedBy,
  constituentId,
  blackbaudConstituentId,
  prospectName,
  normalizedName,
  note,
  email,
  phone,
  assignedAt,
  assignmentSource = ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
  assignmentStatus = PROSPECT_POOL_ASSIGNMENT_STATUS.ACTIVE,
  syncPlan,
  currentAssignmentAuditId,
  retryCount = 0,
}) {
  const updated = await sql`
    UPDATE prospect_pool
    SET
      assigned_user_id = ${assignedUserId || null},
      assignment_updated_by = ${assignmentUpdatedBy || null},
      constituent_id = ${constituentId || null},
      blackbaud_constituent_id = ${blackbaudConstituentId || null},
      prospect_name = ${prospectName},
      normalized_name = ${normalizedName},
      note = ${note || null},
      email = ${email || null},
      phone = ${phone || null},
      assigned_at = ${assignedAt},
      assignment_source = ${assignmentSource},
      assignment_status = ${assignmentStatus},
      nxt_status_sync_state = ${syncPlan.syncStatus},
      nxt_status_sync_error = ${syncPlan.errorMessage},
      nxt_status_sync_debug = ${syncPlan.debug ? JSON.stringify(syncPlan.debug) : null}::jsonb,
      nxt_status_sync_attempted_at = NOW(),
      nxt_status_synced_at = ${syncPlan.syncedAt || null},
      nxt_status_retry_count = ${retryCount},
      manual_nxt_update_required = ${syncPlan.manualUpdateRequired},
      current_assignment_audit_id = ${currentAssignmentAuditId || null},
      updated_at = NOW()
    WHERE id = ${prospectPoolId}
    RETURNING *
  `;

  return updated[0] || null;
}
