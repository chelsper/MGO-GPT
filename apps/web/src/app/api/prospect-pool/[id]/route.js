import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { resolveConstituent } from "@/app/api/utils/constituents";
import {
  createBlackbaudConstituentCustomField,
  createBlackbaudFundraiserAssignment,
  findBlackbaudConstituentByEmail,
  findBlackbaudConstituentByLookupId,
  getBlackbaudFundraiserById,
  listBlackbaudConstituentCustomFields,
  listBlackbaudFundraiserAssignments,
  searchBlackbaudConstituents,
  updateBlackbaudConstituentCustomField,
} from "@/app/api/utils/blackbaud";
import {
  DATA_REQUEST_TYPE_CONTACT_INFO,
  upsertOpenDataRequest,
} from "@/app/api/utils/dataRequests";
import { sendAdvancementServicesNotification } from "@/app/api/utils/sendSubmissionEmail";
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
const MGOGPT_FOLLOW_UP_VALUES = new Set([
  "Not interested at this time",
  "Not interested/Does not want to be solicited",
  "Qualified - Annual Fund",
  "Qualified - Major Gifts",
  "Unable to Connect",
]);
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

function normalizeOptionalAssignmentValue(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

async function clearBlackbaudPortfolioCacheForUser(userId) {
  if (!userId) return false;

  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_cache = NULL,
      blackbaud_portfolio_cache_key = NULL,
      blackbaud_portfolio_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;

  return true;
}

function buildSolicitorAssignmentDebug({
  operation,
  endpointPath,
  detail,
  assignmentId,
  fundraiserId,
  assignmentValue,
  resolutionPath,
  resolutionCandidates,
}) {
  return {
    operation: operation || null,
    endpointPath: endpointPath || null,
    detail: detail || null,
    assignmentId: assignmentId ? String(assignmentId) : null,
    fundraiserId: fundraiserId ? String(fundraiserId) : null,
    assignmentValue:
      assignmentValue !== undefined && assignmentValue !== null
        ? Number(assignmentValue)
        : null,
    resolutionPath: resolutionPath || null,
    resolutionCandidates: Array.isArray(resolutionCandidates)
      ? resolutionCandidates.map((candidate) => ({
          fundraiserId: candidate?.fundraiserId ? String(candidate.fundraiserId) : null,
          resolutionPath: candidate?.resolutionPath || null,
        }))
      : null,
    recordedAt: new Date().toISOString(),
  };
}

function buildMgogptDispositionDebug({ operation, endpointPath, detail, customFieldId }) {
  return {
    operation: operation || null,
    endpointPath: endpointPath || null,
    detail: detail || null,
    customFieldId: customFieldId ? String(customFieldId) : null,
    recordedAt: new Date().toISOString(),
  };
}

function addFundraiserCandidate(candidates, fundraiserId, resolutionPath) {
  const normalizedId = String(fundraiserId || "").trim();
  if (!normalizedId) return;
  if (candidates.some((candidate) => candidate.fundraiserId === normalizedId)) return;
  candidates.push({
    fundraiserId: normalizedId,
    resolutionPath,
  });
}

async function getUserFundraiserIdentity(userId) {
  if (!userId) return null;

  const rows = await sql`
    SELECT id, name, email, role, blackbaud_constituent_id, blackbaud_lookup_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function resolveWorkspaceFundraiserCandidates({
  workspaceUser,
  authUserId,
  origin,
}) {
  const candidates = [];

  addFundraiserCandidate(
    candidates,
    workspaceUser?.blackbaud_constituent_id,
    "workspace-blackbaud-constituent-id",
  );

  const exactLookupMatch = await findBlackbaudConstituentByLookupId({
    userId: workspaceUser.id,
    authUserId,
    origin,
    lookupId: workspaceUser.blackbaud_lookup_id,
  }).catch(() => null);

  addFundraiserCandidate(
    candidates,
    exactLookupMatch?.blackbaudConstituentId,
    "workspace-blackbaud-lookup-id",
  );

  const exactEmailMatch = await findBlackbaudConstituentByEmail({
    userId: workspaceUser.id,
    authUserId,
    origin,
    email: workspaceUser.email,
  }).catch(() => null);

  addFundraiserCandidate(
    candidates,
    exactEmailMatch?.blackbaudConstituentId,
    "email-match",
  );

  const normalizedName = String(workspaceUser?.name || "").trim().toLowerCase();
  const normalizedEmail = String(workspaceUser?.email || "").trim().toLowerCase();
  const matches = await searchBlackbaudConstituents({
    userId: workspaceUser.id,
    authUserId,
    origin,
    query: workspaceUser.name || workspaceUser.email,
  }).catch(() => []);
  const exactSearchMatch =
    matches.find(
      (candidate) =>
        String(candidate?.name || "").trim().toLowerCase() === normalizedName &&
        String(candidate?.email || "").trim().toLowerCase() === normalizedEmail,
    ) ||
    matches.find(
      (candidate) =>
        String(candidate?.name || "").trim().toLowerCase() === normalizedName,
    ) ||
    null;

  addFundraiserCandidate(
    candidates,
    exactSearchMatch?.blackbaudConstituentId,
    "name-search-match",
  );

  return candidates;
}

async function resolveWorkspaceFundraiserRecord({
  currentUser,
  workspaceUser,
  assignedUserId,
  origin,
}) {
  const resolutionCandidates = await resolveWorkspaceFundraiserCandidates({
    workspaceUser,
    authUserId: currentUser.id,
    origin,
  });
  const workspaceMissingDirectLinkage =
    !String(workspaceUser?.blackbaud_constituent_id || "").trim() &&
    !String(workspaceUser?.blackbaud_lookup_id || "").trim();
  const assignedUserIdentity =
    assignedUserId &&
    (Number(assignedUserId) !== Number(workspaceUser?.id || 0) ||
      workspaceMissingDirectLinkage)
      ? await getUserFundraiserIdentity(assignedUserId)
      : null;

  if (assignedUserIdentity) {
    const assignedCandidates = await resolveWorkspaceFundraiserCandidates({
      workspaceUser: assignedUserIdentity,
      authUserId: currentUser.id,
      origin,
    });

    for (const candidate of assignedCandidates) {
      addFundraiserCandidate(
        resolutionCandidates,
        candidate.fundraiserId,
        `assigned-user:${candidate.resolutionPath}`,
      );
    }
  }

  for (const candidate of resolutionCandidates) {
    try {
      const fundraiserRecord = await getBlackbaudFundraiserById({
        userId: workspaceUser.id,
        authUserId: currentUser.id,
        origin,
        fundraiserId: candidate.fundraiserId,
      });

      if (fundraiserRecord?.fundraiserId) {
        return {
          fundraiserId: fundraiserRecord.fundraiserId,
          resolutionPath: candidate.resolutionPath,
          resolutionCandidates,
        };
      }
    } catch {
      continue;
    }
  }

  if (resolutionCandidates.length > 0) {
    return {
      fundraiserId: resolutionCandidates[0].fundraiserId,
      resolutionPath: `${resolutionCandidates[0].resolutionPath}:unvalidated-fallback`,
      resolutionCandidates,
    };
  }

  return {
    fundraiserId: null,
    resolutionPath: "not-resolved",
    resolutionCandidates,
  };
}

async function attemptSolicitorAssignmentSync({
  currentUser,
  workspaceUser,
  request,
  blackbaudConstituentId,
  assignmentValue,
  assignedUserId,
}) {
  const origin = new URL(request.url).origin;
  const {
    fundraiserId: resolvedFundraiserId,
    resolutionPath,
    resolutionCandidates,
  } = await resolveWorkspaceFundraiserRecord({
    currentUser,
    workspaceUser,
    assignedUserId,
    origin,
  });
  const workspaceFundraiserId = String(resolvedFundraiserId || "").trim();
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
        resolutionPath,
        resolutionCandidates,
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
        resolutionPath,
        resolutionCandidates,
      }),
    };
  }

  const normalizedAssignmentValue = normalizeOptionalAssignmentValue(assignmentValue);

  const todayDate = getProspectPoolTodayDate(new Date());
  const startTimestamp = new Date().toISOString();

  try {
    let existingAssignments;
    try {
      existingAssignments = await listBlackbaudFundraiserAssignments({
        userId: workspaceUser.id,
        authUserId: currentUser.id,
        origin,
        fundraiserId: workspaceFundraiserId,
      });
    } catch (error) {
      const message =
        error?.message || "Failed to list existing Raiser's Edge NXT fundraiser assignments";
      return {
        syncState: /404|resource not found|unsupported|not implemented/i.test(message)
          ? SOLICITOR_ASSIGNMENT_SYNC_STATUS.MANUAL_REQUIRED
          : SOLICITOR_ASSIGNMENT_SYNC_STATUS.FAILED,
        errorMessage: message,
        syncedAt: null,
        debug: buildSolicitorAssignmentDebug({
          operation: "list",
          endpointPath: "/fundraising/v1/fundraisers/assignments?fundraiser_id=...",
          detail: message,
          fundraiserId: workspaceFundraiserId,
          assignmentValue: normalizedAssignmentValue,
          resolutionPath,
          resolutionCandidates,
        }),
      };
    }

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
          assignmentValue: normalizedAssignmentValue,
          resolutionPath,
          resolutionCandidates,
        }),
      };
    }

    try {
      const assignmentPayload = {
        fundraiser_id: workspaceFundraiserId,
        constituent_id: String(blackbaudConstituentId),
        type: LEAD_SOLICITOR_FUNDRAISER_TYPE,
        start: startTimestamp,
      };
      if (normalizedAssignmentValue !== null) {
        assignmentPayload.value = normalizedAssignmentValue;
      }

      await createBlackbaudFundraiserAssignment({
        userId: workspaceUser.id,
        authUserId: currentUser.id,
        origin,
        payload: assignmentPayload,
      });
    } catch (error) {
      const message =
        error?.message || "Failed to create Raiser's Edge NXT solicitor assignment";
      return {
        syncState: /404|resource not found|unsupported|not implemented/i.test(message)
          ? SOLICITOR_ASSIGNMENT_SYNC_STATUS.MANUAL_REQUIRED
          : SOLICITOR_ASSIGNMENT_SYNC_STATUS.FAILED,
        errorMessage: message,
        syncedAt: null,
        debug: buildSolicitorAssignmentDebug({
          operation: "create",
          endpointPath: "/fundraising/v1/fundraisers/assignments",
          detail: message,
          fundraiserId: workspaceFundraiserId,
          assignmentValue: normalizedAssignmentValue,
          resolutionPath,
          resolutionCandidates,
        }),
      };
    }

    return {
      syncState: SOLICITOR_ASSIGNMENT_SYNC_STATUS.SUCCESS,
      errorMessage: null,
      syncedAt: new Date().toISOString(),
      debug: buildSolicitorAssignmentDebug({
        operation: "create",
        endpointPath: "/fundraising/v1/fundraisers/assignments",
        detail: "Created Lead Solicitor assignment in Raiser's Edge NXT.",
        fundraiserId: workspaceFundraiserId,
        assignmentValue: normalizedAssignmentValue,
        resolutionPath,
        resolutionCandidates,
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
        assignmentValue: normalizedAssignmentValue,
        resolutionPath,
        resolutionCandidates,
      }),
    };
  }
}

async function attemptMgogptDispositionSync({
  currentUser,
  workspaceUser,
  request,
  blackbaudConstituentId,
  dispositionValue,
  dispositionComment,
}) {
  if (!dispositionValue) {
    return {
      syncState: null,
      errorMessage: null,
      syncedAt: null,
      debug: null,
    };
  }

  if (!blackbaudConstituentId) {
    return {
      syncState: "manual_required",
      errorMessage:
        "Saved in the app, but the MGOGPT outcome could not be written because no linked constituent/system record ID is available.",
      syncedAt: null,
      debug: buildMgogptDispositionDebug({
        operation: "fallback",
        detail: "Missing linked constituent/system record ID.",
      }),
    };
  }

  const origin = new URL(request.url).origin;
  const todayDate = getProspectPoolTodayDate(new Date());

  try {
    const customFields = await listBlackbaudConstituentCustomFields({
      userId: workspaceUser.id,
      authUserId: currentUser.id,
      origin,
      constituentId: blackbaudConstituentId,
    });

    const matchingField = (Array.isArray(customFields) ? customFields : []).find((field) => {
      if (normalizeCustomFieldText(field?.category) !== normalizeCustomFieldText("MGOGPT")) {
        return false;
      }
      if (
        normalizeCustomFieldText(getCustomFieldDisplayValue(field)) !==
        normalizeCustomFieldText(dispositionValue)
      ) {
        return false;
      }
      if (
        normalizeCustomFieldText(field?.comment || "") !==
        normalizeCustomFieldText(dispositionComment || "")
      ) {
        return false;
      }
      const fieldDate = String(field?.date || field?.start_date || field?.startDate || "")
        .trim()
        .slice(0, 10);
      return fieldDate === todayDate;
    });

    if (matchingField) {
      return {
        syncState: "success",
        errorMessage: null,
        syncedAt: new Date().toISOString(),
        debug: buildMgogptDispositionDebug({
          operation: "list",
          endpointPath: `/constituent/v1/constituents/${blackbaudConstituentId}/customfields`,
          detail: `Matching MGOGPT outcome "${dispositionValue}" already exists.`,
          customFieldId:
            matchingField?.id ||
            matchingField?.custom_field_id ||
            matchingField?.customFieldId ||
            null,
        }),
      };
    }

    const created = await createBlackbaudConstituentCustomField({
      userId: workspaceUser.id,
      authUserId: currentUser.id,
      origin,
      payload: {
        parent_id: String(blackbaudConstituentId),
        category: "MGOGPT",
        value: dispositionValue,
        codetableentry_value: dispositionValue,
        comment: dispositionComment || undefined,
        date: todayDate,
      },
    });

    return {
      syncState: "success",
      errorMessage: null,
      syncedAt: new Date().toISOString(),
      debug: buildMgogptDispositionDebug({
        operation: "create",
        endpointPath: "/constituent/v1/constituents/customfields",
        detail: `Created MGOGPT outcome "${dispositionValue}".`,
        customFieldId:
          created?.id || created?.custom_field_id || created?.customFieldId || null,
      }),
    };
  } catch (error) {
    const message = error?.message || "Failed to create MGOGPT custom field outcome";
    if (/404|resource not found|unsupported|not implemented/i.test(message)) {
      return {
        syncState: "manual_required",
        errorMessage:
          "Saved in the app, but the MGOGPT outcome endpoint is unavailable for this constituent record.",
        syncedAt: null,
        debug: buildMgogptDispositionDebug({
          operation: "fallback",
          detail: message,
        }),
      };
    }

    return {
      syncState: "failed",
      errorMessage: message,
      syncedAt: null,
      debug: buildMgogptDispositionDebug({
        operation: "fallback",
        detail: message,
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
    const { searchParams } = new URL(request.url);
    const requestedView = searchParams.get("view");
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
    const body = await request.json();
    const requestsMgoMutation =
      body?.needsContactInfo !== undefined ||
      body?.contactInfoRequestNote !== undefined ||
      body?.solicitorRequested !== undefined ||
      body?.solicitorAssignmentValue !== undefined ||
      body?.mgogptDispositionValue !== undefined ||
      body?.mgogptDispositionComment !== undefined;
    const reviewerForcedIntoMgoMode =
      requestsMgoMutation &&
      Number(entry.assigned_user_id || 0) === Number(workspaceUser.id || currentUser.id) &&
      (requestedView === "mgo" || isReviewerRole(currentUser.role));
    const isReviewerWorkspace =
      isReviewerRole(workspaceUser.role) &&
      !(isReviewerRole(currentUser.role) && requestedView === "mgo") &&
      !reviewerForcedIntoMgoMode;

    if (isReviewerWorkspace) {
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
            AND (
              POSITION(',mgo,' IN ',' || REPLACE(LOWER(COALESCE(role, '')), ' ', '') || ',') > 0
              OR id = ${currentUser.id}
            )
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

    const needsContactInfo =
      body?.needsContactInfo !== undefined
        ? isTruthy(body.needsContactInfo)
        : entry.needs_contact_info;
    const solicitorRequestedRequested =
      body?.solicitorRequested !== undefined
        ? isTruthy(body.solicitorRequested)
        : entry.solicitor_requested;
    const solicitorAssignmentValue =
      body?.solicitorAssignmentValue !== undefined &&
      body?.solicitorAssignmentValue !== null &&
      String(body.solicitorAssignmentValue).trim() !== ""
        ? normalizeOptionalAssignmentValue(body.solicitorAssignmentValue)
        : entry.solicitor_assignment_value != null
          ? normalizeOptionalAssignmentValue(entry.solicitor_assignment_value)
          : null;
    const solicitorRequested =
      entry.solicitor_assignment_sync_state === SOLICITOR_ASSIGNMENT_SYNC_STATUS.SUCCESS
        ? true
        : solicitorRequestedRequested;
    const noteProvided = typeof body?.contactInfoRequestNote === "string";
    const contactInfoRequestNote = noteProvided
      ? body.contactInfoRequestNote.trim() || null
      : entry.contact_info_request_note;
    const mgogptDispositionValueProvided = typeof body?.mgogptDispositionValue === "string";
    const mgogptDispositionCommentProvided = typeof body?.mgogptDispositionComment === "string";
    const mgogptDispositionValue = mgogptDispositionValueProvided
      ? body.mgogptDispositionValue.trim() || null
      : entry.mgogpt_disposition_value || null;
    const mgogptDispositionComment = mgogptDispositionCommentProvided
      ? body.mgogptDispositionComment.trim() || null
      : entry.mgogpt_disposition_comment || null;

    if (solicitorRequested && !mgogptDispositionValue) {
      return Response.json(
        {
          error:
            "Choose an MGOGPT outcome before assigning yourself as solicitor.",
        },
        { status: 400 },
      );
    }

    if (
      mgogptDispositionValue &&
      !MGOGPT_FOLLOW_UP_VALUES.has(mgogptDispositionValue)
    ) {
      return Response.json({ error: "Invalid MGOGPT outcome selected" }, { status: 400 });
    }

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
    let mgogptDispositionSyncState = entry.mgogpt_disposition_sync_state || null;
    let mgogptDispositionSyncError = entry.mgogpt_disposition_sync_error || null;
    let mgogptDispositionSyncedAt = entry.mgogpt_disposition_synced_at || null;
    let mgogptDispositionSyncDebug = entry.mgogpt_disposition_sync_debug || null;

    const mgogptDispositionChanged =
      mgogptDispositionValue !== (entry.mgogpt_disposition_value || null) ||
      mgogptDispositionComment !== (entry.mgogpt_disposition_comment || null);

    if (solicitorRequested) {
      const syncResult = await attemptSolicitorAssignmentSync({
        currentUser,
        workspaceUser,
        request,
        blackbaudConstituentId: linkedBlackbaudConstituentId,
        assignmentValue: solicitorAssignmentValue,
        assignedUserId: entry.assigned_user_id,
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

    if (mgogptDispositionValue && mgogptDispositionChanged) {
      const dispositionSyncResult = await attemptMgogptDispositionSync({
        currentUser,
        workspaceUser,
        request,
        blackbaudConstituentId: linkedBlackbaudConstituentId,
        dispositionValue: mgogptDispositionValue,
        dispositionComment: mgogptDispositionComment,
      });
      mgogptDispositionSyncState = dispositionSyncResult.syncState;
      mgogptDispositionSyncError = dispositionSyncResult.errorMessage;
      mgogptDispositionSyncedAt = dispositionSyncResult.syncedAt;
      mgogptDispositionSyncDebug = dispositionSyncResult.debug;
    } else if (!mgogptDispositionValue) {
      mgogptDispositionSyncState = null;
      mgogptDispositionSyncError = null;
      mgogptDispositionSyncedAt = null;
      mgogptDispositionSyncDebug = null;
    }

    const updated = await sql`
      UPDATE prospect_pool
      SET
        needs_contact_info = ${needsContactInfo},
        contact_info_request_note = ${contactInfoRequestNote},
        solicitor_requested = ${solicitorRequested},
        solicitor_assignment_value = CASE
          WHEN ${solicitorRequested} THEN CAST(${solicitorAssignmentValue} AS numeric)
          ELSE NULL::numeric
        END,
        mgogpt_disposition_value = ${mgogptDispositionValue},
        mgogpt_disposition_comment = ${mgogptDispositionComment},
        mgogpt_disposition_updated_at = CASE
          WHEN ${mgogptDispositionValueProvided || mgogptDispositionCommentProvided} THEN NOW()
          ELSE mgogpt_disposition_updated_at
        END,
        mgogpt_disposition_sync_state = ${mgogptDispositionSyncState},
        mgogpt_disposition_sync_error = ${mgogptDispositionSyncError},
        mgogpt_disposition_sync_attempted_at = CASE
          WHEN ${mgogptDispositionValue && mgogptDispositionChanged} THEN NOW()
          WHEN ${!mgogptDispositionValue} THEN NULL
          ELSE mgogpt_disposition_sync_attempted_at
        END,
        mgogpt_disposition_synced_at = ${mgogptDispositionSyncedAt},
        mgogpt_disposition_sync_debug = ${mgogptDispositionSyncDebug ? JSON.stringify(mgogptDispositionSyncDebug) : null}::jsonb,
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

    let dataRequest = null;
    if (needsContactInfo) {
      dataRequest = await upsertOpenDataRequest({
        sql,
        requesterUserId: currentUser.id,
        ownerUserId: entry.assigned_user_id || workspaceUser.id,
        prospectPoolId: entryId,
        constituentId: entry.constituent_id || null,
        blackbaudConstituentId: linkedBlackbaudConstituentId,
        constituentName: entry.prospect_name,
        requestType: DATA_REQUEST_TYPE_CONTACT_INFO,
        requestNote:
          contactInfoRequestNote ||
          "Please verify or update this constituent's contact information.",
        sourceContext: "prospect_pool",
      });

      await sendAdvancementServicesNotification({
        title:
          dataRequest?.notification_event === "updated"
            ? "Contact information request updated"
            : "New contact information request",
        text: [
          "A user sent a contact-information request for Advancement Services review.",
          `Requested by: ${currentUser.name || "Workspace user"}${
            currentUser.email ? ` <${currentUser.email}>` : ""
          }`,
          `Constituent: ${entry.prospect_name || "Unknown constituent"}`,
          linkedBlackbaudConstituentId
            ? `NXT constituent ID: ${linkedBlackbaudConstituentId}`
            : null,
          dataRequest?.request_note ? `Request: ${dataRequest.request_note}` : null,
          "Source: prospect pool",
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch((notificationError) => {
        console.error(
          "Could not send Advancement Services contact-information notification:",
          notificationError,
        );
      });
    }

    let blackbaudPortfolioCacheCleared = false;
    if (
      solicitorRequested &&
      solicitorAssignmentSyncState === SOLICITOR_ASSIGNMENT_SYNC_STATUS.SUCCESS
    ) {
      try {
        const userIdsToClear = [
          Number(workspaceUser.id || 0),
          Number(entry.assigned_user_id || 0),
        ].filter((userId, index, items) => userId > 0 && items.indexOf(userId) === index);

        for (const userId of userIdsToClear) {
          blackbaudPortfolioCacheCleared =
            (await clearBlackbaudPortfolioCacheForUser(userId)) ||
            blackbaudPortfolioCacheCleared;
        }
      } catch (cacheError) {
        console.warn("Could not clear Blackbaud portfolio cache:", cacheError);
      }
    }

    return Response.json({
      ...updated[0],
      data_request_id: dataRequest?.id || null,
      blackbaud_portfolio_cache_cleared: blackbaudPortfolioCacheCleared,
      solicitor_assignment_sync_debug:
        solicitorAssignmentSyncDebug || updated[0]?.solicitor_assignment_sync_debug || null,
    });
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
