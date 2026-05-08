import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  createBlackbaudConstituentCustomField,
  listBlackbaudConstituentCustomFields,
} from "@/app/api/utils/blackbaud";
import {
  applyAssignmentStateToProspectPool,
  ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
  buildConstituentCustomFieldPayload,
  createAssignmentAudit,
  findMatchingCustomField,
  getCustomFieldDisplayValue,
  getProspectPoolAssignmentStatus,
  normalizeCustomFieldText,
  planProspectStatusSync,
} from "../../workflow";

async function attemptProspectPoolNxtSync({
  currentUser,
  request,
  blackbaudConstituentId,
  syncPlan,
}) {
  if (syncPlan.syncStatus !== "pending") {
    return syncPlan;
  }

  const origin = new URL(request.url).origin;

  try {
    const customFields = await listBlackbaudConstituentCustomFields({
      userId: currentUser.id,
      authUserId: currentUser.id,
      origin,
      constituentId: blackbaudConstituentId,
    });
    const existingField = findMatchingCustomField(
      customFields,
      syncPlan.desiredNxtCustomFieldCategory,
    );

    if (existingField) {
      const existingValue = getCustomFieldDisplayValue(existingField);
      if (
        normalizeCustomFieldText(existingValue) ===
        normalizeCustomFieldText(syncPlan.desiredNxtCustomFieldValue)
      ) {
        return {
          ...syncPlan,
          syncStatus: "success",
          manualUpdateRequired: false,
          errorMessage: null,
          syncedAt: new Date().toISOString(),
        };
      }

      return {
        ...syncPlan,
        syncStatus: "manual_required",
        manualUpdateRequired: true,
        errorMessage: `Manual NXT update required: MGOGPT already exists on the constituent with value "${existingValue || "Unknown"}", and automated updates for existing custom field values are not enabled in this workflow.`,
        syncedAt: null,
      };
    }

    await createBlackbaudConstituentCustomField({
      userId: currentUser.id,
      authUserId: currentUser.id,
      origin,
      constituentId: blackbaudConstituentId,
      payload: buildConstituentCustomFieldPayload(syncPlan),
    });

    return {
      ...syncPlan,
      syncStatus: "success",
      manualUpdateRequired: false,
      errorMessage: null,
      syncedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...syncPlan,
      syncStatus: "failed",
      manualUpdateRequired: false,
      errorMessage: error?.message || "Failed to update NXT custom field",
      syncedAt: null,
    };
  }
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);
    if (!isReviewerRole(currentUser.role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const entryId = Number(params?.id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return Response.json({ error: "Invalid prospect pool ID" }, { status: 400 });
    }

    const existing = await sql`
      SELECT pp.*, assigned_user.name AS assigned_user_name, assigned_user.email AS assigned_user_email
      FROM prospect_pool pp
      LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
      WHERE pp.id = ${entryId}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "Prospect pool entry not found" }, { status: 404 });
    }

    const entry = existing[0];
    if (!entry.assigned_user_id) {
      return Response.json(
        { error: "Assigned MGO is required before retrying NXT status sync." },
        { status: 400 },
      );
    }

    const retryCount = Number(entry.nxt_status_retry_count || 0) + 1;
    const assignedAt = entry.assigned_at || new Date().toISOString();
    const assignmentStatus = getProspectPoolAssignmentStatus(entry.assigned_user_id);
    const plannedSync = planProspectStatusSync({
      blackbaudConstituentId: entry.blackbaud_constituent_id,
    });
    const syncPlan = await attemptProspectPoolNxtSync({
      currentUser,
      request,
      blackbaudConstituentId: entry.blackbaud_constituent_id,
      syncPlan: plannedSync,
    });

    const audit = await createAssignmentAudit({
      sql,
      prospectPoolId: entry.id,
      constituentId: entry.constituent_id,
      blackbaudConstituentId: entry.blackbaud_constituent_id,
      constituentName: entry.prospect_name,
      assignedToUserId: entry.assigned_user_id,
      assignedToName:
        entry.assigned_user_name || entry.assigned_user_email || "Unknown MGO",
      assignedByUserId: currentUser.id,
      assignedByName: currentUser.name || currentUser.email,
      assignedAt,
      assignmentSource:
        entry.assignment_source || ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
      assignmentStatus,
      syncPlan,
      retryCount,
    });

    const updated = await applyAssignmentStateToProspectPool({
      sql,
      prospectPoolId: entry.id,
      assignedUserId: entry.assigned_user_id,
      assignmentUpdatedBy: currentUser.id,
      constituentId: entry.constituent_id,
      blackbaudConstituentId: entry.blackbaud_constituent_id,
      prospectName: entry.prospect_name,
      normalizedName: entry.normalized_name,
      note: entry.note,
      email: entry.email,
      phone: entry.phone,
      assignedAt,
      assignmentSource:
        entry.assignment_source || ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
      assignmentStatus,
      syncPlan,
      currentAssignmentAuditId: audit?.id || entry.current_assignment_audit_id || null,
      retryCount,
    });

    return Response.json(updated || entry);
  } catch (error) {
    console.error("Error retrying prospect pool NXT sync:", error);
    return Response.json(
      { error: error?.message || "Failed to retry NXT status sync" },
      { status: 500 },
    );
  }
}
