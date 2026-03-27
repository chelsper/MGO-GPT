import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  blackbaudApiFetch,
  findBlackbaudConstituentByEmail,
  getBlackbaudConfigIssues,
  listBlackbaudFundraiserAssignments,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";

const LEAD_TYPES = new Set(["lead solicitor"]);
const SUPPORT_TYPES = new Set(["secondary solicitor", "athletics solicitor"]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isCurrentAssignment(assignment) {
  const endValue = assignment?.end || assignment?.end_date || null;
  if (!endValue) return true;
  const parsed = new Date(endValue);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() >= Date.now();
}

function getAssignmentType(assignment) {
  return (
    assignment?.type ||
    assignment?.assignment_type ||
    assignment?.fundraiser_type ||
    "Unspecified"
  );
}

function getAssignmentConstituentId(assignment) {
  return (
    assignment?.constituent_id ||
    assignment?.constituentId ||
    assignment?.assigned_constituent_id ||
    assignment?.assigned_constituent?.id ||
    null
  );
}

function mapConstituentBasics(constituent) {
  return {
    constituentId: constituent?.id || null,
    lookupId: constituent?.lookup_id || null,
    name: constituent?.name || null,
    email:
      constituent?.email?.primary === true ? constituent?.email?.address || null : null,
    phone:
      constituent?.phone?.primary === true ? constituent?.phone?.number || null : null,
    address:
      constituent?.address?.preferred === true
        ? constituent?.address?.formatted_address || null
        : null,
  };
}

function mapLifetimeGiving(lifetimeGiving) {
  return {
    totalGiving: lifetimeGiving?.total_giving?.value ?? null,
    totalReceivedGiving: lifetimeGiving?.total_received_giving?.value ?? null,
  };
}

async function fetchPortfolioConstituent({ userId, authUserId, origin, constituentId }) {
  const [constituentResult, lifetimeGivingResult] = await Promise.allSettled([
    blackbaudApiFetch(
      `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}`,
      {
        userId,
        authUserId,
        origin,
      },
    ),
    blackbaudApiFetch(
      `/constituent/v1/constituents/${encodeURIComponent(
        String(constituentId),
      )}/givingsummary/lifetimegiving`,
      {
        userId,
        authUserId,
        origin,
      },
    ),
  ]);

  const constituent =
    constituentResult.status === "fulfilled" ? constituentResult.value : null;
  const lifetimeGiving =
    lifetimeGivingResult.status === "fulfilled" ? lifetimeGivingResult.value : null;

  return {
    ...mapConstituentBasics(constituent),
    lifetimeGiving: mapLifetimeGiving(lifetimeGiving),
  };
}

async function enrichConstituents({ userId, authUserId, origin, groupedAssignments }) {
  const entries = Array.from(groupedAssignments.values());
  const enriched = [];

  for (let index = 0; index < entries.length; index += 5) {
    const chunk = entries.slice(index, index + 5);
    const results = await Promise.all(
      chunk.map(async (entry) => {
        const details = await fetchPortfolioConstituent({
          userId,
          authUserId,
          origin,
          constituentId: entry.constituentId,
        }).catch(() => null);

        if (!details?.constituentId) {
          return null;
        }

        return {
          constituentId: details.constituentId,
          lookupId: details.lookupId,
          name: details.name,
          email: details.email,
          phone: details.phone,
          address: details.address,
          lifetimeGiving: details.lifetimeGiving,
          assignmentTypes: Array.from(entry.assignmentTypes),
        };
      }),
    );

    enriched.push(...results.filter(Boolean));
  }

  return enriched.sort((left, right) =>
    String(left?.name || "").localeCompare(String(right?.name || ""), "en"),
  );
}

async function resolveFundraiserConstituentId({ workspaceUser, authUserId, origin }) {
  if (workspaceUser?.blackbaud_constituent_id) {
    return workspaceUser.blackbaud_constituent_id;
  }

  const exactEmailMatch = await findBlackbaudConstituentByEmail({
    userId: workspaceUser.id,
    authUserId,
    origin,
    email: workspaceUser.email,
  }).catch(() => null);

  if (exactEmailMatch?.blackbaudConstituentId) {
    return exactEmailMatch.blackbaudConstituentId;
  }

  const matches = await searchBlackbaudConstituents({
    userId: workspaceUser.id,
    authUserId,
    origin,
    query: workspaceUser.name || workspaceUser.email,
  }).catch(() => []);

  const normalizedName = String(workspaceUser?.name || "").trim().toLowerCase();
  const normalizedEmail = String(workspaceUser?.email || "").trim().toLowerCase();
  const match =
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

  return match?.blackbaudConstituentId || null;
}

export async function GET(request) {
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
    await getOrCreateUser(session);
    const { sessionUser, workspaceUser, isActing } = await getWorkspaceUser(session, request);
    const authUserId = isActing ? sessionUser.id : workspaceUser.id;

    const fundraiserId = await resolveFundraiserConstituentId({
      workspaceUser,
      authUserId,
      origin,
    });

    if (!fundraiserId) {
      return Response.json({
        leadSolicitor: [],
        supportingSolicitor: [],
        warning: "Connect this MGO to a Blackbaud user to view portfolio assignments.",
      });
    }

    const assignments = await listBlackbaudFundraiserAssignments({
      userId: workspaceUser.id,
      authUserId,
      origin,
      fundraiserId,
      searchParams: {
        include_inactive: false,
      },
    });

    const leadAssignments = new Map();
    const supportAssignments = new Map();

    assignments
      .filter(isCurrentAssignment)
      .forEach((assignment) => {
        const constituentId = getAssignmentConstituentId(assignment);
        if (!constituentId) return;

        const type = getAssignmentType(assignment);
        const normalizedType = normalizeText(type);
        const targetMap = LEAD_TYPES.has(normalizedType)
          ? leadAssignments
          : SUPPORT_TYPES.has(normalizedType)
            ? supportAssignments
            : null;

        if (!targetMap) return;

        const existing = targetMap.get(String(constituentId)) || {
          constituentId: String(constituentId),
          assignmentTypes: new Set(),
        };
        existing.assignmentTypes.add(type);
        targetMap.set(String(constituentId), existing);
      });

    for (const constituentId of leadAssignments.keys()) {
      supportAssignments.delete(constituentId);
    }

    const [leadSolicitor, supportingSolicitor] = await Promise.all([
      enrichConstituents({
        userId: workspaceUser.id,
        authUserId,
        origin,
        groupedAssignments: leadAssignments,
      }),
      enrichConstituents({
        userId: workspaceUser.id,
        authUserId,
        origin,
        groupedAssignments: supportAssignments,
      }),
    ]);

    return Response.json({
      leadSolicitor,
      supportingSolicitor,
      summary: {
        leadCount: leadSolicitor.length,
        supportingCount: supportingSolicitor.length,
      },
    });
  } catch (error) {
    console.error("Blackbaud portfolio error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Blackbaud portfolio assignments",
      },
      { status: 500 },
    );
  }
}
