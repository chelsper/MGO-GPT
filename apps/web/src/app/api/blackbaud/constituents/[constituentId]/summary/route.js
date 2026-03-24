import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";

async function tryFetchConstituentById({
  userId,
  origin,
  candidateId,
}) {
  if (!candidateId) return null;

  try {
    const payload = await blackbaudApiFetch(
      `/constituent/v1/constituents/${encodeURIComponent(String(candidateId))}`,
      {
        userId,
        origin,
      },
    );
    return payload || null;
  } catch (error) {
    return null;
  }
}

async function resolveConstituentPayload({
  userId,
  origin,
  constituentId,
  lookupId,
  recordId,
  name,
}) {
  const direct = await tryFetchConstituentById({
    userId,
    origin,
    candidateId: constituentId,
  });
  if (direct) {
    return direct;
  }

  const searchTerms = [lookupId, recordId, name]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const term of searchTerms) {
    try {
      const payload = await blackbaudApiFetch(
        "/constituent/v1/constituents/search",
        {
          userId,
          origin,
          searchParams: {
            search_text: term,
            limit: 10,
          },
        },
      );

      const rows = Array.isArray(payload?.value)
        ? payload.value
        : Array.isArray(payload)
          ? payload
          : [];

      const normalizedTerm = term.toLowerCase();
      const exact =
        rows.find((item) => {
          const lookupMatches =
            String(item?.lookup_id || item?.lookupId || "")
              .trim()
              .toLowerCase() === normalizedTerm;
          const nameMatches =
            String(item?.name || "")
              .trim()
              .toLowerCase() === normalizedTerm;
          return lookupMatches || nameMatches;
        }) || rows[0];

      if (exact?.id) {
        const resolved = await tryFetchConstituentById({
          userId,
          origin,
          candidateId: exact.id,
        });
        if (resolved) {
          return resolved;
        }
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error("Blackbaud constituent summary request failed");
}

function mapConstituent(constituent) {
  return {
    id: constituent?.id || null,
    lookupId: constituent?.lookup_id || null,
    name: constituent?.name || null,
    preferredName: constituent?.preferred_name || null,
    type: constituent?.type || null,
    email:
      constituent?.email?.primary === true ? constituent?.email?.address || null : null,
    phone:
      constituent?.phone?.primary === true ? constituent?.phone?.number || null : null,
    address:
      constituent?.address?.preferred === true
        ? constituent?.address?.formatted_address || null
        : null,
    requestsNoEmail: constituent?.requests_no_email ?? null,
    fundraiserStatus: constituent?.fundraiser_status || null,
    inactive: constituent?.inactive ?? null,
  };
}

function mapLifetimeGiving(lifetimeGiving) {
  return {
    constituentId: lifetimeGiving?.constituent_id || null,
    totalGiving: lifetimeGiving?.total_giving?.value ?? null,
    totalReceivedGiving: lifetimeGiving?.total_received_giving?.value ?? null,
    totalPledgeBalance: lifetimeGiving?.total_pledge_balance?.value ?? null,
    totalSoftCredits: lifetimeGiving?.total_soft_credits?.value ?? null,
    totalYearsGiven: lifetimeGiving?.total_years_given ?? null,
    consecutiveYearsGiven: lifetimeGiving?.consecutive_years_given ?? null,
  };
}

function mapFundraiserAssignment(assignment) {
  return {
    assignmentId: assignment?.id || null,
    fundraiserId: assignment?.fundraiser_id || null,
    amount: assignment?.amount?.value ?? null,
    appealId: assignment?.appeal_id || null,
    campaignId: assignment?.campaign_id || null,
    fundId: assignment?.fund_id || null,
    start: assignment?.start || null,
    end: assignment?.end || null,
    type: assignment?.type || null,
  };
}

function mapPrimaryBusinessRelationship(relationships) {
  const rows = Array.isArray(relationships?.value)
    ? relationships.value
    : Array.isArray(relationships)
      ? relationships
      : [];

  const primaryBusiness = rows.find((relationship) => relationship?.is_primary_business);
  if (!primaryBusiness) {
    return null;
  }

  return {
    relationshipId: primaryBusiness?.id || null,
    organizationConstituentId: primaryBusiness?.relation_id || null,
    organizationName: primaryBusiness?.name || null,
    position: primaryBusiness?.position || null,
    type: primaryBusiness?.type || null,
    start: primaryBusiness?.start || null,
    end: primaryBusiness?.end || null,
  };
}

async function loadBlackbaudSection(label, requestFactory) {
  try {
    const payload = await requestFactory();
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : `Failed to fetch ${label} from Blackbaud`,
    };
  }
}

export async function GET(request, { params }) {
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

  const constituentId = String(params?.constituentId || "").trim();
  if (!constituentId) {
    return Response.json(
      { error: "A Blackbaud constituent ID is required" },
      { status: 400 },
    );
  }

  const includeInactive =
    new URL(request.url).searchParams.get("include_inactive") === "true";
  const includeRaw = new URL(request.url).searchParams.get("raw") === "true";
  const lookupId = new URL(request.url).searchParams.get("lookupId")?.trim() || "";
  const recordId = new URL(request.url).searchParams.get("recordId")?.trim() || "";
  const name = new URL(request.url).searchParams.get("name")?.trim() || "";

  try {
    const user = await getOrCreateUser(session);
    const constituentPayload = await resolveConstituentPayload({
      userId: user.id,
      origin,
      constituentId,
      lookupId,
      recordId,
      name,
    });
    const resolvedConstituentId = String(constituentPayload?.id || constituentId).trim();

    const [
      lifetimeGivingResult,
      fundraiserAssignmentsResult,
      relationshipsResult,
    ] =
      await Promise.all([
        loadBlackbaudSection("lifetimeGiving", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(
              resolvedConstituentId,
            )}/givingsummary/lifetimegiving`,
            {
              userId: user.id,
              origin,
            },
          ),
        ),
        loadBlackbaudSection("fundraiserAssignments", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(
              resolvedConstituentId,
            )}/fundraiserassignments`,
            {
              userId: user.id,
              origin,
              searchParams: {
                include_inactive: includeInactive,
              },
            },
          ),
        ),
        loadBlackbaudSection("relationships", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(resolvedConstituentId)}/relationships`,
            {
              userId: user.id,
              origin,
            },
          ),
        ),
      ]);

    const constituent = constituentPayload;
    const lifetimeGiving = lifetimeGivingResult.ok
      ? lifetimeGivingResult.payload
      : null;
    const fundraiserAssignments = fundraiserAssignmentsResult.ok
      ? fundraiserAssignmentsResult.payload
      : null;
    const relationships = relationshipsResult.ok ? relationshipsResult.payload : null;

    const assignments = Array.isArray(fundraiserAssignments?.value)
      ? fundraiserAssignments.value
      : [];

    return Response.json({
      constituentId,
      includeInactive,
      mapped: {
        constituent: mapConstituent(constituent),
        lifetimeGiving: mapLifetimeGiving(lifetimeGiving),
        fundraiserAssignments: assignments.map(mapFundraiserAssignment),
        primaryBusinessRelationship: mapPrimaryBusinessRelationship(relationships),
      },
      warnings: {
        lifetimeGiving: lifetimeGivingResult.ok ? null : lifetimeGivingResult.error,
        fundraiserAssignments: fundraiserAssignmentsResult.ok
          ? null
          : fundraiserAssignmentsResult.error,
        relationships: relationshipsResult.ok ? null : relationshipsResult.error,
      },
      ...(includeRaw
        ? {
            raw: {
              constituent,
              lifetimeGiving,
              fundraiserAssignments,
              relationships,
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("Blackbaud constituent summary error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch Blackbaud constituent summary",
      },
      { status: 500 },
    );
  }
}
