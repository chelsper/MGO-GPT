import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { resolveConstituent } from "@/app/api/utils/constituents";
import {
  createBlackbaudConstituentCustomField,
  listBlackbaudConstituentCustomFields,
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
  normalizeCustomFieldText,
  planProspectStatusSync,
} from "./workflow";

function normalizeName(value) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function attemptProspectPoolNxtSync({
  reviewer,
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
      userId: reviewer.id,
      authUserId: reviewer.id,
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
        userId: reviewer.id,
        authUserId: reviewer.id,
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
      userId: reviewer.id,
      authUserId: reviewer.id,
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

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);
    const { workspaceUser } = await getWorkspaceUser(session, request);
    const { searchParams } = new URL(request.url);
    const requestedView = searchParams.get("view");
    const treatAsReviewer =
      isReviewerRole(currentUser.role) && requestedView !== "mgo";

    const rows =
      treatAsReviewer
        ? await sql`
            SELECT
              pp.*,
              COALESCE(pp.blackbaud_constituent_id, c.blackbaud_constituent_id) AS linked_blackbaud_constituent_id,
              assigned_user.name AS assigned_user_name,
              assigned_user.email AS assigned_user_email,
              creator.name AS created_by_name,
              creator.email AS created_by_email,
              assignment_updater.name AS assignment_updated_by_name,
              assignment_updater.email AS assignment_updated_by_email,
              matched_prospect.id AS matched_prospect_id,
              matched_prospect.prospect_name AS matched_prospect_name,
              matched_prospect_owner.name AS last_action_solicitor_name,
              latest_action.update_date AS last_action_date,
              latest_action.update_notes AS last_action_notes,
              latest_action.id AS post_assignment_action_id,
              latest_action.update_date AS post_assignment_action_date,
              latest_action.update_notes AS post_assignment_action_notes,
              latest_action.update_title AS post_assignment_action_title,
              latest_action.action_category AS post_assignment_action_category,
              latest_action.action_type AS post_assignment_action_type,
              latest_action.blackbaud_action_id AS post_assignment_blackbaud_action_id,
              CASE
                WHEN latest_action.id IS NULL THEN NULL
                WHEN latest_action.blackbaud_action_id IS NOT NULL THEN 'app-nxt'
                ELSE 'app'
              END AS post_assignment_action_source
            FROM prospect_pool pp
            LEFT JOIN constituents c ON c.id = pp.constituent_id
            LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
            LEFT JOIN users creator ON creator.id = pp.created_by
            LEFT JOIN users assignment_updater ON assignment_updater.id = pp.assignment_updated_by
            LEFT JOIN LATERAL (
              SELECT
                p.id,
                p.user_id,
                p.prospect_name
              FROM prospects p
              WHERE p.user_id = pp.assigned_user_id
                AND (
                  (pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id)
                  OR (
                    pp.normalized_name IS NOT NULL
                    AND LOWER(REGEXP_REPLACE(TRIM(COALESCE(p.prospect_name, '')), '\s+', ' ', 'g')) = pp.normalized_name
                  )
                )
              ORDER BY
                CASE
                  WHEN pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id THEN 0
                  ELSE 1
                END,
                p.updated_at DESC,
                p.created_at DESC
              LIMIT 1
            ) matched_prospect ON TRUE
            LEFT JOIN users matched_prospect_owner
              ON matched_prospect_owner.id = matched_prospect.user_id
            LEFT JOIN LATERAL (
              SELECT
                pu.id,
                pu.update_date,
                pu.update_notes,
                pu.update_title,
                pu.action_category,
                pu.action_type,
                pu.blackbaud_action_id,
                pu.created_at
              FROM prospect_updates pu
              WHERE pu.prospect_id = matched_prospect.id
                AND pu.update_date >= COALESCE(pp.assigned_at::date, pp.created_at::date)
              ORDER BY pu.update_date DESC, pu.created_at DESC
              LIMIT 1
            ) latest_action ON TRUE
            ORDER BY pp.updated_at DESC, pp.created_at DESC
          `
        : await sql`
            SELECT
              pp.*,
              COALESCE(pp.blackbaud_constituent_id, c.blackbaud_constituent_id) AS linked_blackbaud_constituent_id,
              assigned_user.name AS assigned_user_name,
              assigned_user.email AS assigned_user_email,
              creator.name AS created_by_name,
              creator.email AS created_by_email,
              assignment_updater.name AS assignment_updated_by_name,
              assignment_updater.email AS assignment_updated_by_email,
              matched_prospect.id AS matched_prospect_id,
              matched_prospect.prospect_name AS matched_prospect_name,
              matched_prospect_owner.name AS last_action_solicitor_name,
              latest_action.update_date AS last_action_date,
              latest_action.update_notes AS last_action_notes,
              latest_action.id AS post_assignment_action_id,
              latest_action.update_date AS post_assignment_action_date,
              latest_action.update_notes AS post_assignment_action_notes,
              latest_action.update_title AS post_assignment_action_title,
              latest_action.action_category AS post_assignment_action_category,
              latest_action.action_type AS post_assignment_action_type,
              latest_action.blackbaud_action_id AS post_assignment_blackbaud_action_id,
              CASE
                WHEN latest_action.id IS NULL THEN NULL
                WHEN latest_action.blackbaud_action_id IS NOT NULL THEN 'app-nxt'
                ELSE 'app'
              END AS post_assignment_action_source
            FROM prospect_pool pp
            LEFT JOIN constituents c ON c.id = pp.constituent_id
            LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
            LEFT JOIN users creator ON creator.id = pp.created_by
            LEFT JOIN users assignment_updater ON assignment_updater.id = pp.assignment_updated_by
            LEFT JOIN LATERAL (
              SELECT
                p.id,
                p.user_id,
                p.prospect_name
              FROM prospects p
              WHERE p.user_id = pp.assigned_user_id
                AND (
                  (pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id)
                  OR (
                    pp.normalized_name IS NOT NULL
                    AND LOWER(REGEXP_REPLACE(TRIM(COALESCE(p.prospect_name, '')), '\s+', ' ', 'g')) = pp.normalized_name
                  )
                )
              ORDER BY
                CASE
                  WHEN pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id THEN 0
                  ELSE 1
                END,
                p.updated_at DESC,
                p.created_at DESC
              LIMIT 1
            ) matched_prospect ON TRUE
            LEFT JOIN users matched_prospect_owner
              ON matched_prospect_owner.id = matched_prospect.user_id
            LEFT JOIN LATERAL (
              SELECT
                pu.id,
                pu.update_date,
                pu.update_notes,
                pu.update_title,
                pu.action_category,
                pu.action_type,
                pu.blackbaud_action_id,
                pu.created_at
              FROM prospect_updates pu
              WHERE pu.prospect_id = matched_prospect.id
                AND pu.update_date >= COALESCE(pp.assigned_at::date, pp.created_at::date)
              ORDER BY pu.update_date DESC, pu.created_at DESC
              LIMIT 1
            ) latest_action ON TRUE
            WHERE pp.assigned_user_id = ${workspaceUser.id}
              AND COALESCE(pp.solicitor_assignment_sync_state, '') <> 'success'
            ORDER BY pp.updated_at DESC, pp.created_at DESC
          `;

    return Response.json(rows);
  } catch (error) {
    console.error("Error fetching prospect pool:", error);
    return Response.json(
      { error: error?.message || "Failed to fetch prospect pool" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reviewer = await getOrCreateUser(session, "reviewer");
    if (!isReviewerRole(reviewer.role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const prospectName = body?.prospectName?.trim();
    const assignedUserId = Number(body?.assignedUserId);
    const note = body?.note?.trim() || null;
    const email = body?.email?.trim().toLowerCase() || null;
    const phone = body?.phone?.trim() || null;
    const blackbaudConstituentId = body?.blackbaudConstituentId?.trim() || null;

    if (!prospectName) {
      return Response.json(
        { error: "Prospect name is required" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(assignedUserId) || assignedUserId <= 0) {
      return Response.json(
        { error: "Assigned MGO is required" },
        { status: 400 },
      );
    }

    const assignedUser = await sql`
      SELECT id, name, email, role
      FROM users
      WHERE id = ${assignedUserId}
        AND (role = 'mgo' OR id = ${reviewer.id})
      LIMIT 1
    `;

    if (assignedUser.length === 0) {
      return Response.json(
        { error: "Selected MGO account was not found" },
        { status: 404 },
      );
    }

    const constituent = await resolveConstituent({
      userId: assignedUserId,
      name: prospectName,
      blackbaudConstituentId,
    });

    const linkedBlackbaudConstituentId =
      blackbaudConstituentId || constituent?.blackbaud_constituent_id || null;
    const duplicate = await findDuplicateActiveAssignment({
      sql,
      assignedUserId,
      blackbaudConstituentId: linkedBlackbaudConstituentId,
      normalizedName: normalizeName(prospectName),
    });

    if (duplicate) {
      return Response.json(
        {
          error: `${duplicate.prospect_name || prospectName} is already assigned to this MGO in the prospect pool.`,
        },
        { status: 409 },
      );
    }

    const assignedAt = new Date();
    const assignmentStatus = getProspectPoolAssignmentStatus(assignedUserId);
    const plannedSync = planProspectStatusSync({
      blackbaudConstituentId: linkedBlackbaudConstituentId,
      now: assignedAt,
    });
    const syncPlan = await attemptProspectPoolNxtSync({
      reviewer,
      request,
      blackbaudConstituentId: linkedBlackbaudConstituentId,
      syncPlan: plannedSync,
    });

    const result = await sql`
      INSERT INTO prospect_pool (
        assigned_user_id,
        created_by,
        assignment_updated_by,
        constituent_id,
        blackbaud_constituent_id,
        prospect_name,
        normalized_name,
        note,
        email,
        phone,
        assigned_at,
        assignment_source,
        assignment_status,
        nxt_status_sync_state,
        nxt_status_sync_error,
        nxt_status_sync_attempted_at,
        nxt_status_retry_count,
        manual_nxt_update_required,
        created_at,
        updated_at
      )
      VALUES (
        ${assignedUserId},
        ${reviewer.id},
        ${reviewer.id},
        ${constituent?.id || null},
        ${linkedBlackbaudConstituentId},
        ${prospectName},
        ${normalizeName(prospectName)},
        ${note},
        ${email},
        ${phone},
        ${assignedAt.toISOString()},
        ${ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES},
        ${assignmentStatus},
        ${syncPlan.syncStatus},
        ${syncPlan.errorMessage},
        NOW(),
        0,
        ${syncPlan.manualUpdateRequired},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const created = result[0];
    const audit = await createAssignmentAudit({
      sql,
      prospectPoolId: created.id,
      constituentId: constituent?.id || null,
      blackbaudConstituentId: linkedBlackbaudConstituentId,
      constituentName: prospectName,
      assignedToUserId: assignedUserId,
      assignedToName: assignedUser[0].name || assignedUser[0].email,
      assignedByUserId: reviewer.id,
      assignedByName: reviewer.name || reviewer.email,
      assignedAt: assignedAt.toISOString(),
      assignmentSource: ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
      assignmentStatus,
      syncPlan,
      retryCount: 0,
    });

    const updated = await applyAssignmentStateToProspectPool({
      sql,
      prospectPoolId: created.id,
      assignedUserId,
      assignmentUpdatedBy: reviewer.id,
      constituentId: constituent?.id || null,
      blackbaudConstituentId: linkedBlackbaudConstituentId,
      prospectName,
      normalizedName: normalizeName(prospectName),
      note,
      email,
      phone,
      assignedAt: assignedAt.toISOString(),
      assignmentSource: ASSIGNMENT_SOURCE_ADVANCEMENT_SERVICES,
      assignmentStatus,
      syncPlan,
      currentAssignmentAuditId: audit?.id || null,
      retryCount: 0,
    });

    return Response.json(updated || created, { status: 201 });
  } catch (error) {
    console.error("Error creating prospect pool entry:", error);
    return Response.json(
      { error: error?.message || "Failed to create prospect pool entry" },
      { status: 500 },
    );
  }
}
