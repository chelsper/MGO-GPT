import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { resolveConstituent } from "@/app/api/utils/constituents";
import {
  createBlackbaudConstituentCustomField,
  createBlackbaudFundraiserAssignment,
  listBlackbaudConstituentCustomFields,
  listBlackbaudFundraiserAssignments,
  updateBlackbaudConstituentCustomField,
} from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  applyAssignmentStateToProspectPool,
  ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
  buildProspectPoolSyncDebug,
  buildConstituentCustomFieldPayload,
  createAssignmentAudit,
  findMatchingCustomField,
  findDuplicateActiveAssignment,
  getCustomFieldDisplayValue,
  getProspectPoolAssignmentStatus,
  getProspectPoolTodayDate,
  normalizeCustomFieldText,
  planProspectStatusSync,
} from "../workflow";

const LEAD_SOLICITOR_FUNDRAISER_TYPE = "Lead Solicitor";
const SOLICITOR_ASSIGNMENT_SYNC_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
  MANUAL_REQUIRED: "manual_required",
};

function isTruthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getFundraiserAssignmentConstituentId(assignment) {
  return (
    assignment?.constituent_id?.toString() ||
    assignment?.constituentId?.toString() ||
    assignment?.prospect_id?.toString() ||
    assignment?.prospectId?.toString() ||
    null
  );
}

function getFundraiserAssignmentType(assignment) {
  return (
    assignment?.type ||
    assignment?.fundraiser_type ||
    assignment?.fundraiserType ||
    assignment?.category ||
    null
  );
}

function getFundraiserAssignmentId(assignment) {
  return (
    assignment?.id?.toString() ||
    assignment?.assignment_id?.toString() ||
    assignment?.assignmentId?.toString() ||
    null
  );
}

function getFundraiserAssignmentEndDate(assignment) {
  const value =
    assignment?.end ||
    assignment?.end_date ||
    assignment?.endDate ||
    assignment?.date_to ||
    assignment?.dateTo ||
    null;
  if (!value) return null;
  return String(value).slice(0, 10);
}

function isFundraiserAssignmentActive(assignment, todayDate) {
  const endDate = getFundraiserAssignmentEndDate(assignment);
  return !endDate || endDate >= todayDate;
}

function buildSolicitorAssignmentDebug({
  operation,
  endpointPath,
  detail,
  assignmentId,
  fundraiserId,
}) {
  return {
    operation: operation || null,
    endpointPath: endpointPath || null,
    detail: detail || null,
    assignmentId: assignmentId ? String(assignmentId) : null,
    fundraiserId: fundraiserId ? String(fundraiserId) : null,
    recordedAt: new Date().toISOString(),
  };
}

async function attemptSolicitorAssignmentSync({
  currentUser,
  workspaceUser,
  request,
  blackbaudConstituentId,
}) {
  const workspaceFundraiserId = String(workspaceUser?.blackbaud_constituent_id || "").trim();
  if (!blackbaudConstituentId) {
    return {
      syncState: SOLICITOR_ASSIGNMENT_SYNC_STATUS.MANUAL_REQUIRED,
      errorMessage:
        "Saved in the app, but Raiser's Edge NXT solicitor assignment requires a linked constituent/system record ID.",
      syncedAt: null,
      debug: buildSolicitorAssignmentDebug({
        operation: "fallback",
        detail: "Missing linked constituent/system record ID.",
        fundraiserId: workspaceFundraiserId || null,
      }),
    };
  }

  if (!workspaceFundraiserId) {
    return {
      syncState: SOLICITOR_ASSIGNMENT_SYNC_STATUS.MANUAL_REQUIRED,
      errorMessage:
        "Saved in the app, but Raiser's Edge NXT solicitor assignment requires a fundraiser system record ID for the active workspace MGO.",
      syncedAt: null,
      debug: buildSolicitorAssignmentDebug({
        operation: "fallback",
        detail: "Missing workspace fundraiser system record ID.",
      }),
    };
  }

  const origin = new URL(request.url).origin;
  const todayDate = getProspectPoolTodayDate(new Date());

  try {
    const existingAssignments = await listBlackbaudFundraiserAssignments({
      userId: workspaceUser.id,
      authUserId: currentUser.id,
      origin,
      fundraiserId: workspaceFundraiserId,
    });

    const matchingAssignment = (Array.isArray(existingAssignments) ? existingAssignments : []).find(
      (assignment) =>
        getFundraiserAssignmentConstituentId(assignment) === String(blackbaudConstituentId) &&
        normalizeText(getFundraiserAssignmentType(assignment)) ===
          normalizeText(LEAD_SOLICITOR_FUNDRAISER_TYPE) &&
        isFundraiserAssignmentActive(assignment, todayDate),
    );

    if (matchingAssignment) {
      return {
        syncState: SOLICITOR_ASSIGNMENT_SYNC_STATUS.SUCCESS,
        errorMessage: null,
        syncedAt: new Date().toISOString(),
        debug: buildSolicitorAssignmentDebug({
          operation: "list",
          endpointPath: `/fundraising/v1/fundraisers/${workspaceFundraiserId}/assignments`,
          detail: "Lead Solicitor assignment already exists for this constituent.",
          assignmentId: getFundraiserAssignmentId(matchingAssignment),
          fundraiserId: workspaceFundraiserId,
        }),
      };
    }

    const startTimestamp = new Date().toISOString();
    await createBlackbaudFundraiserAssignment({
      userId: workspaceUser.id,
      authUserId: currentUser.id,
      origin,
      payload: {
        fundraiser_id: workspaceFundraiserId,
        constituent_id: String(blackbaudConstituentId),
        type: LEAD_SOLICITOR_FUNDRAISER_TYPE,
        start: startTimestamp,
        amount: {
          value: 0,
        },
      },
    });

    return {
      syncState: SOLICITOR_ASSIGNMENT_SYNC_STATUS.SUCCESS,
      errorMessage: null,
      syncedAt: new Date().toISOString(),
      debug: buildSolicitorAssignmentDebug({
        operation: "create",
        endpointPath: "/fundraising/v1/fundraisers/assignments",
        detail: "Created Lead Solicitor assignment in Raiser's Edge NXT.",
        fundraiserId: workspaceFundraiserId,
      }),
    };
  } catch (error) {
    const message = error?.message || "Failed to create Raiser's Edge NXT solicitor assignment";
    const normalizedMessage = normalizeText(message);
    const manualRequired =
      /404|resource not found|unsupported|not implemented/i.test(message);

    return {
      syncState: manualRequired
        ? SOLICITOR_ASSIGNMENT_SYNC_STATUS.MANUAL_REQUIRED
        : SOLICITOR_ASSIGNMENT_SYNC_STATUS.FAILED,
      errorMessage: manualRequired
        ? "Saved in the app, but the Raiser's Edge NXT fundraiser assignment endpoint is unavailable for this record."
        : message,
      syncedAt: null,
      debug: buildSolicitorAssignmentDebug({
        operation: "fallback",
        detail: normalizedMessage || message,
        fundraiserId: workspaceFundraiserId,
      }),
    };
  }
}

async function attemptProspectPoolNxtSync({
  currentUser,
  request,
  blackbaudConstituentId,
  syncPlan,
}) {
  if (syncPlan.syncStatus !== "pending") {
    return {
      ...syncPlan,
      debug: buildProspectPoolSyncDebug({
        operation: "fallback",
        detail: syncPlan.errorMessage || "Sync not attempted",
      }),
    };
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
      const customFieldId =
        existingField?.id || existingField?.custom_field_id || existingField?.customFieldId;
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
          debug: buildProspectPoolSyncDebug({
            operation: "list",
            endpointPath: `/constituent/v1/constituents/${blackbaudConstituentId}/customfields`,
            detail: "MGOGPT already set to the requested value.",
            customFieldId,
          }),
        };
      }

      await updateBlackbaudConstituentCustomField({
        userId: currentUser.id,
        authUserId: currentUser.id,
        origin,
        customFieldId,
        payload: {
          category: syncPlan.desiredNxtCustomFieldCategory,
          codetableentry_value: syncPlan.desiredNxtCustomFieldValue,
          comment: syncPlan.desiredNxtComment,
          date: syncPlan.desiredNxtStartDate,
        },
      });

      return {
        ...syncPlan,
        syncStatus: "success",
        manualUpdateRequired: false,
        errorMessage: null,
        syncedAt: new Date().toISOString(),
        debug: buildProspectPoolSyncDebug({
          operation: "update",
          endpointPath: `/constituent/v1/constituents/customfields/${customFieldId}`,
          detail: `Updated MGOGPT from "${existingValue || "Unknown"}" to "${syncPlan.desiredNxtCustomFieldValue}".`,
          customFieldId,
        }),
      };
    }

    await createBlackbaudConstituentCustomField({
      userId: currentUser.id,
      authUserId: currentUser.id,
      origin,
      payload: {
        parent_id: String(blackbaudConstituentId),
        ...buildConstituentCustomFieldPayload(syncPlan),
      },
    });

    return {
      ...syncPlan,
      syncStatus: "success",
      manualUpdateRequired: false,
      errorMessage: null,
      syncedAt: new Date().toISOString(),
      debug: buildProspectPoolSyncDebug({
        operation: "create",
        endpointPath: "/constituent/v1/constituents/customfields",
        detail: "Created MGOGPT constituent custom field value.",
      }),
    };
  } catch (error) {
    const message = error?.message || "Failed to update NXT custom field";
    if (/404|resource not found/i.test(message)) {
      return {
        ...syncPlan,
        syncStatus: "manual_required",
        manualUpdateRequired: true,
        errorMessage:
          "Manual MGOGPT update required: the constituent custom field endpoint could not be confirmed for this record from the current integration layer.",
        syncedAt: null,
        debug: buildProspectPoolSyncDebug({
          operation: "fallback",
          detail: message,
        }),
      };
    }

    return {
      ...syncPlan,
      syncStatus: "failed",
      manualUpdateRequired: false,
      errorMessage: message,
      syncedAt: null,
      debug: buildProspectPoolSyncDebug({
        operation: "fallback",
        detail: message,
      }),
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
    const { workspaceUser } = await getWorkspaceUser(session, request);
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

    if (entry.assigned_user_id !== workspaceUser.id) {
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
    const solicitorRequestedRequested =
      body?.solicitorRequested !== undefined
        ? isTruthy(body.solicitorRequested)
        : entry.solicitor_requested;
    const solicitorRequested =
      entry.solicitor_assignment_sync_state === SOLICITOR_ASSIGNMENT_SYNC_STATUS.SUCCESS
        ? true
        : solicitorRequestedRequested;
    const noteProvided = typeof body?.contactInfoRequestNote === "string";
    const contactInfoRequestNote = noteProvided
      ? body.contactInfoRequestNote.trim() || null
      : entry.contact_info_request_note;
    let linkedBlackbaudConstituentId = entry.blackbaud_constituent_id || null;

    if (!linkedBlackbaudConstituentId && entry.constituent_id) {
      const constituentRows = await sql`
        SELECT blackbaud_constituent_id
        FROM constituents
        WHERE id = ${entry.constituent_id}
        LIMIT 1
      `;
      linkedBlackbaudConstituentId =
        constituentRows[0]?.blackbaud_constituent_id?.toString() || null;
    }

    let solicitorAssignmentSyncState = entry.solicitor_assignment_sync_state || null;
    let solicitorAssignmentSyncError = entry.solicitor_assignment_sync_error || null;
    let solicitorAssignmentSyncedAt = entry.solicitor_assignment_synced_at || null;
    let solicitorAssignmentSyncDebug = entry.solicitor_assignment_sync_debug || null;

    if (solicitorRequested) {
      const syncResult = await attemptSolicitorAssignmentSync({
        currentUser,
        workspaceUser,
        request,
        blackbaudConstituentId: linkedBlackbaudConstituentId,
      });
      solicitorAssignmentSyncState = syncResult.syncState;
      solicitorAssignmentSyncError = syncResult.errorMessage;
      solicitorAssignmentSyncedAt = syncResult.syncedAt;
      solicitorAssignmentSyncDebug = syncResult.debug;
    } else {
      solicitorAssignmentSyncState = null;
      solicitorAssignmentSyncError = null;
      solicitorAssignmentSyncedAt = null;
      solicitorAssignmentSyncDebug = null;
    }

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
        solicitor_assignment_sync_state = ${solicitorAssignmentSyncState},
        solicitor_assignment_sync_error = ${solicitorAssignmentSyncError},
        solicitor_assignment_sync_attempted_at = CASE
          WHEN ${solicitorRequested} THEN NOW()
          ELSE NULL
        END,
        solicitor_assignment_synced_at = ${solicitorAssignmentSyncedAt},
        solicitor_assignment_sync_debug = ${solicitorAssignmentSyncDebug ? JSON.stringify(solicitorAssignmentSyncDebug) : null}::jsonb,
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
