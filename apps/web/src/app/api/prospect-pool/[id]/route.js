import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { resolveConstituent } from "@/app/api/utils/constituents";
import {
  createBlackbaudConstituentCustomField,
  listBlackbaudConstituentCustomFields,
} from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  applyAssignmentStateToProspectPool,
  ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
  buildConstituentCustomFieldPayload,
  createAssignmentAudit,
  findMatchingCustomField,
  findDuplicateActiveAssignment,
  getCustomFieldDisplayValue,
  getProspectPoolAssignmentStatus,
  normalizeCustomFieldText,
  planProspectStatusSync,
} from "../workflow";

function isTruthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

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

export async function PATCH(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);
    const entryId = Number(params?.id);

    if (!Number.isInteger(entryId) || entryId <= 0) {
      return Response.json({ error: "Invalid prospect pool ID" }, { status: 400 });
    }

    const existing = await sql`
      SELECT *
      FROM prospect_pool
      WHERE id = ${entryId}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "Prospect pool entry not found" }, { status: 404 });
    }

    const entry = existing[0];

    if (isReviewerRole(currentUser.role)) {
      const body = await request.json();
      const assignedUserId =
        body?.assignedUserId !== undefined ? Number(body.assignedUserId) : null;
      const noteProvided = typeof body?.note === "string";
      const emailProvided = typeof body?.email === "string";
      const phoneProvided = typeof body?.phone === "string";

      if (
        assignedUserId !== null &&
        (!Number.isInteger(assignedUserId) || assignedUserId <= 0)
      ) {
        return Response.json({ error: "Invalid assigned MGO" }, { status: 400 });
      }

      let assigned = null;
      if (assignedUserId !== null) {
        assigned = await sql`
          SELECT id
            , name
            , email
          FROM users
          WHERE id = ${assignedUserId}
            AND (role = 'mgo' OR id = ${currentUser.id})
          LIMIT 1
        `;
        if (assigned.length === 0) {
          return Response.json({ error: "Assigned MGO not found" }, { status: 404 });
        }
      }

      const nextAssignedUserId =
        assignedUserId !== null ? assignedUserId : entry.assigned_user_id;
      const nextNote = noteProvided ? body.note.trim() || null : entry.note;
      const nextEmail = emailProvided ? body.email.trim().toLowerCase() || null : entry.email;
      const nextPhone = phoneProvided ? body.phone.trim() || null : entry.phone;
      const isAssignmentChange =
        assignedUserId !== null && assignedUserId !== Number(entry.assigned_user_id || 0);

      if (isAssignmentChange) {
        const duplicate = await findDuplicateActiveAssignment({
          sql,
          assignedUserId: nextAssignedUserId,
          blackbaudConstituentId: entry.blackbaud_constituent_id,
          normalizedName: entry.normalized_name,
          excludeEntryId: entryId,
        });

        if (duplicate) {
          return Response.json(
            {
              error: `${duplicate.prospect_name || entry.prospect_name} is already assigned to this MGO in the prospect pool.`,
            },
            { status: 409 },
          );
        }

        const constituent = await resolveConstituent({
          userId: nextAssignedUserId,
          name: entry.prospect_name,
          blackbaudConstituentId: entry.blackbaud_constituent_id,
        });
        const assignedAt = new Date();
        const assignmentStatus = getProspectPoolAssignmentStatus(nextAssignedUserId);
        const plannedSync = planProspectStatusSync({
          blackbaudConstituentId:
            entry.blackbaud_constituent_id || constituent?.blackbaud_constituent_id || null,
          now: assignedAt,
        });
        const syncPlan = await attemptProspectPoolNxtSync({
          currentUser,
          request,
          blackbaudConstituentId:
            entry.blackbaud_constituent_id || constituent?.blackbaud_constituent_id || null,
          syncPlan: plannedSync,
        });
        const assignedUserRecord = assigned?.[0] || null;
        const audit = await createAssignmentAudit({
          sql,
          prospectPoolId: entryId,
          constituentId: constituent?.id || null,
          blackbaudConstituentId:
            entry.blackbaud_constituent_id || constituent?.blackbaud_constituent_id || null,
          constituentName: entry.prospect_name,
          assignedToUserId: nextAssignedUserId,
          assignedToName:
            assignedUserRecord?.name || assignedUserRecord?.email || "Unknown MGO",
          assignedByUserId: currentUser.id,
          assignedByName: currentUser.name || currentUser.email,
          assignedAt: assignedAt.toISOString(),
          assignmentSource: ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
          assignmentStatus,
          syncPlan,
          retryCount: 0,
        });

        const updatedAssignment = await applyAssignmentStateToProspectPool({
          sql,
          prospectPoolId: entryId,
          assignedUserId: nextAssignedUserId,
          assignmentUpdatedBy: currentUser.id,
          constituentId: constituent?.id || null,
          blackbaudConstituentId:
            entry.blackbaud_constituent_id || constituent?.blackbaud_constituent_id || null,
          prospectName: entry.prospect_name,
          normalizedName: entry.normalized_name,
          note: nextNote,
          email: nextEmail,
          phone: nextPhone,
          assignedAt: assignedAt.toISOString(),
          assignmentSource: ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
          assignmentStatus,
          syncPlan,
          currentAssignmentAuditId: audit?.id || null,
          retryCount: 0,
        });

        return Response.json(updatedAssignment);
      }

      const updated = await sql`
        UPDATE prospect_pool
        SET
          note = CASE
            WHEN ${noteProvided} THEN ${nextNote}
            ELSE note
          END,
          email = CASE
            WHEN ${emailProvided} THEN ${nextEmail}
            ELSE email
          END,
          phone = CASE
            WHEN ${phoneProvided} THEN ${nextPhone}
            ELSE phone
          END,
          updated_at = NOW()
        WHERE id = ${entryId}
        RETURNING *
      `;

      return Response.json(updated[0]);
    }

    if (entry.assigned_user_id !== currentUser.id) {
      return Response.json(
        { error: "Forbidden — this prospect is assigned to another MGO" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const needsContactInfo =
      body?.needsContactInfo !== undefined
        ? isTruthy(body.needsContactInfo)
        : entry.needs_contact_info;
    const solicitorRequested =
      body?.solicitorRequested !== undefined
        ? isTruthy(body.solicitorRequested)
        : entry.solicitor_requested;
    const noteProvided = typeof body?.contactInfoRequestNote === "string";
    const contactInfoRequestNote = noteProvided
      ? body.contactInfoRequestNote.trim() || null
      : entry.contact_info_request_note;

    const updated = await sql`
      UPDATE prospect_pool
      SET
        needs_contact_info = ${needsContactInfo},
        contact_info_request_note = ${contactInfoRequestNote},
        solicitor_requested = ${solicitorRequested},
        solicitor_requested_at = CASE
          WHEN ${solicitorRequested} THEN COALESCE(solicitor_requested_at, NOW())
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${entryId}
      RETURNING *
    `;

    return Response.json(updated[0]);
  } catch (error) {
    console.error("Error updating prospect pool entry:", error);
    return Response.json(
      { error: error?.message || "Failed to update prospect pool entry" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
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

    const deleted = await sql`
      DELETE FROM prospect_pool
      WHERE id = ${entryId}
      RETURNING id, prospect_name
    `;

    if (deleted.length === 0) {
      return Response.json({ error: "Prospect pool entry not found" }, { status: 404 });
    }

    return Response.json({ ok: true, deleted: deleted[0] });
  } catch (error) {
    console.error("Error deleting prospect pool entry:", error);
    return Response.json(
      { error: error?.message || "Failed to delete prospect pool entry" },
      { status: 500 },
    );
  }
}
