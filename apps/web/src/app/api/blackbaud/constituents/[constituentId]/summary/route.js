import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";

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

  try {
    const user = await getOrCreateUser(session);

    const [constituentResult, lifetimeGivingResult, fundraiserAssignmentsResult] =
      await Promise.all([
        loadBlackbaudSection("constituent", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(constituentId)}`,
            {
              userId: user.id,
              origin,
            },
          ),
        ),
        loadBlackbaudSection("lifetimeGiving", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(
              constituentId,
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
              constituentId,
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
      ]);

    if (!constituentResult.ok || !lifetimeGivingResult.ok || !fundraiserAssignmentsResult.ok) {
      return Response.json(
        {
          error: "Blackbaud constituent summary request failed",
          details: {
            constituent: constituentResult.ok ? null : constituentResult.error,
            lifetimeGiving: lifetimeGivingResult.ok ? null : lifetimeGivingResult.error,
            fundraiserAssignments: fundraiserAssignmentsResult.ok
              ? null
              : fundraiserAssignmentsResult.error,
          },
        },
        { status: 502 },
      );
    }

    const constituent = constituentResult.payload;
    const lifetimeGiving = lifetimeGivingResult.payload;
    const fundraiserAssignments = fundraiserAssignmentsResult.payload;

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
      },
      ...(includeRaw
        ? {
            raw: {
              constituent,
              lifetimeGiving,
              fundraiserAssignments,
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
