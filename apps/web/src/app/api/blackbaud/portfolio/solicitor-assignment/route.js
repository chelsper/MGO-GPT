import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  findBlackbaudConstituentByEmail,
  findBlackbaudConstituentByLookupId,
  getBlackbaudConfigIssues,
  getBlackbaudFundraiserById,
  listBlackbaudFundraiserAssignments,
  searchBlackbaudConstituents,
  updateBlackbaudFundraiserAssignment,
} from "@/app/api/utils/blackbaud";

const FORMER_SOLICITOR_TYPE = "Former Solicitor";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getAssignmentConstituentId(assignment) {
  return (
    assignment?.constituent_id?.toString() ||
    assignment?.constituentId?.toString() ||
    assignment?.prospect_id?.toString() ||
    assignment?.prospectId?.toString() ||
    assignment?.assigned_constituent_id?.toString() ||
    assignment?.assigned_constituent?.id?.toString() ||
    assignment?.constituent?.id?.toString() ||
    null
  );
}

function getAssignmentId(assignment) {
  return (
    assignment?.id?.toString() ||
    assignment?.assignment_id?.toString() ||
    assignment?.assignmentId?.toString() ||
    null
  );
}

function getAssignmentType(assignment) {
  return (
    assignment?.type ||
    assignment?.assignment_type ||
    assignment?.fundraiser_type ||
    assignment?.fundraiserType ||
    assignment?.category ||
    null
  );
}

function getAssignmentStartDate(assignment) {
  const value =
    assignment?.start ||
    assignment?.start_date ||
    assignment?.startDate ||
    assignment?.date_from ||
    assignment?.dateFrom ||
    null;
  if (!value) return null;
  return String(value);
}

function getAssignmentEndDate(assignment) {
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

function isActiveAssignment(assignment, todayDate) {
  const endDate = getAssignmentEndDate(assignment);
  return !endDate || endDate >= todayDate;
}

function isRemovableSolicitorAssignment(assignment, todayDate) {
  if (!isActiveAssignment(assignment, todayDate)) return false;

  const normalizedType = normalizeText(getAssignmentType(assignment));
  if (!normalizedType) return false;
  if (normalizedType.includes("former solicitor")) return false;
  return normalizedType.includes("solicitor");
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

async function resolveFundraiserCandidates({ workspaceUser, authUserId, origin }) {
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

  addFundraiserCandidate(candidates, exactEmailMatch?.blackbaudConstituentId, "email-match");

  const normalizedName = normalizeText(workspaceUser?.name);
  const normalizedEmail = normalizeText(workspaceUser?.email);
  const matches = await searchBlackbaudConstituents({
    userId: workspaceUser.id,
    authUserId,
    origin,
    query: workspaceUser.name || workspaceUser.email,
  }).catch(() => []);

  const exactSearchMatch =
    matches.find(
      (candidate) =>
        normalizeText(candidate?.name) === normalizedName &&
        normalizeText(candidate?.email) === normalizedEmail,
    ) ||
    matches.find((candidate) => normalizeText(candidate?.name) === normalizedName) ||
    null;

  addFundraiserCandidate(
    candidates,
    exactSearchMatch?.blackbaudConstituentId,
    "name-search-match",
  );

  return candidates;
}

async function resolveWorkspaceFundraiserRecord({ workspaceUser, authUserId, origin }) {
  const candidates = await resolveFundraiserCandidates({
    workspaceUser,
    authUserId,
    origin,
  });

  for (const candidate of candidates) {
    try {
      const fundraiserRecord = await getBlackbaudFundraiserById({
        userId: workspaceUser.id,
        authUserId,
        origin,
        fundraiserId: candidate.fundraiserId,
      });

      if (fundraiserRecord?.fundraiserId) {
        return {
          fundraiserId: fundraiserRecord.fundraiserId,
          resolutionPath: candidate.resolutionPath,
          candidates,
        };
      }
    } catch {
      // Continue through the candidate list; some constituent IDs are not fundraiser records.
    }
  }

  if (candidates.length > 0) {
    return {
      fundraiserId: candidates[0].fundraiserId,
      resolutionPath: `${candidates[0].resolutionPath}:unvalidated-fallback`,
      candidates,
    };
  }

  return {
    fundraiserId: null,
    resolutionPath: "not-resolved",
    candidates,
  };
}

async function clearBlackbaudPortfolioCacheForUser(userId) {
  if (!userId) return;

  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_cache = NULL,
      blackbaud_portfolio_cache_key = NULL,
      blackbaud_portfolio_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function PATCH(request) {
  const session = await auth(request);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppSchema();

  const origin = new URL(request.url).origin;
  const configIssues = getBlackbaudConfigIssues(origin);
  if (configIssues.length > 0) {
    return Response.json(
      {
        error: "Blackbaud is not configured",
        configIssues,
      },
      { status: 400 },
    );
  }

  try {
    const { sessionUser, workspaceUser, isActing } = await getWorkspaceUser(session, request);

    if (isActing || Number(sessionUser?.id) !== Number(workspaceUser?.id)) {
      return Response.json(
        { error: "You can only remove your own solicitor assignment." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const constituentId = String(
      body?.constituentId ||
        body?.blackbaudConstituentId ||
        body?.blackbaud_constituent_id ||
        "",
    ).trim();

    if (!constituentId) {
      return Response.json(
        { error: "A Blackbaud constituent ID is required." },
        { status: 400 },
      );
    }

    const { fundraiserId, resolutionPath, candidates } = await resolveWorkspaceFundraiserRecord({
      workspaceUser,
      authUserId: sessionUser.id,
      origin,
    });

    if (!fundraiserId) {
      return Response.json(
        {
          error:
            "Could not resolve your Blackbaud fundraiser record. Ask an admin to check your NXT identity.",
          resolutionPath,
        },
        { status: 409 },
      );
    }

    const todayDate = getTodayDate();
    const assignments = await listBlackbaudFundraiserAssignments({
      userId: workspaceUser.id,
      authUserId: sessionUser.id,
      origin,
      fundraiserId,
      searchParams: {
        include_inactive: false,
      },
    });

    const matchingAssignments = (Array.isArray(assignments) ? assignments : []).filter(
      (assignment) =>
        getAssignmentConstituentId(assignment) === constituentId &&
        isRemovableSolicitorAssignment(assignment, todayDate),
    );

    if (!matchingAssignments.length) {
      return Response.json(
        {
          error:
            "No active solicitor assignment was found for this constituent and your MGO record.",
          fundraiserId,
          constituentId,
          resolutionPath,
        },
        { status: 404 },
      );
    }

    const assignmentsWithoutIds = matchingAssignments.filter(
      (assignment) => !getAssignmentId(assignment),
    );
    if (assignmentsWithoutIds.length > 0) {
      return Response.json(
        {
          error:
            "Blackbaud returned a matching solicitor assignment without an assignment ID, so it could not be updated safely.",
          fundraiserId,
          constituentId,
          resolutionPath,
        },
        { status: 409 },
      );
    }

    const updatedAssignments = [];
    for (const assignment of matchingAssignments) {
      const assignmentId = getAssignmentId(assignment);
      const startDate = getAssignmentStartDate(assignment);
      const payload = {
        type: FORMER_SOLICITOR_TYPE,
        end: todayDate,
      };

      if (startDate) {
        payload.start = startDate;
      }

      const updated = await updateBlackbaudFundraiserAssignment({
        userId: workspaceUser.id,
        authUserId: sessionUser.id,
        origin,
        assignmentId,
        payload,
      });

      updatedAssignments.push({
        assignmentId,
        previousType: getAssignmentType(assignment),
        start: startDate,
        end: todayDate,
        result: updated || null,
      });
    }

    await clearBlackbaudPortfolioCacheForUser(workspaceUser.id);

    return Response.json({
      ok: true,
      message:
        updatedAssignments.length === 1
          ? "Your solicitor assignment was ended in NXT."
          : `${updatedAssignments.length} solicitor assignments were ended in NXT.`,
      constituentId,
      fundraiserId,
      resolutionPath,
      resolutionCandidates: candidates.map((candidate) => ({
        fundraiserId: candidate.fundraiserId,
        resolutionPath: candidate.resolutionPath,
      })),
      updatedAssignments,
    });
  } catch (error) {
    console.error("Remove portfolio solicitor assignment error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to remove solicitor assignment.",
      },
      { status: 500 },
    );
  }
}
