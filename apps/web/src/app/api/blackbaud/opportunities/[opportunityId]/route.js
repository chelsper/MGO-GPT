import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";

function mapFundraiser(fundraiser) {
  return {
    constituentId: fundraiser?.constituent_id || null,
    creditAmount: fundraiser?.credit_amount?.value ?? null,
  };
}

function getNestedValue(source, path) {
  return path.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function firstDefined(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function getOpportunityAskDate(opportunity) {
  return firstDefined(opportunity, [
    "ask_date",
    "askDate",
    "date_asked",
    "dateAsked",
    "date_ask",
    "ask.date",
  ]);
}

function getOpportunityExpectedDate(opportunity) {
  return firstDefined(opportunity, [
    "expected_date",
    "expectedDate",
    "date_expected",
    "dateExpected",
    "anticipated_date",
    "anticipatedDate",
    "deadline",
  ]);
}

function getOpportunityFundedAmount(opportunity) {
  return firstDefined(opportunity, [
    "funded_amount.value",
    "fundedAmount.value",
    "funded_amount",
    "fundedAmount",
    "amount_funded.value",
    "amountFunded.value",
    "amount_funded",
    "amountFunded",
  ]);
}

function getOpportunityFundedDate(opportunity) {
  return firstDefined(opportunity, [
    "funded_date",
    "fundedDate",
    "date_funded",
    "dateFunded",
    "close_date",
    "closeDate",
  ]);
}

function mapOpportunity(opportunity) {
  return {
    id: opportunity?.id || null,
    constituentId: opportunity?.constituent_id || null,
    name: opportunity?.name || null,
    status: opportunity?.status || null,
    purpose: opportunity?.purpose || null,
    campaignId: opportunity?.campaign_id || null,
    fundId: opportunity?.fund_id || null,
    askAmount: opportunity?.ask_amount?.value ?? null,
    askDate: getOpportunityAskDate(opportunity),
    expectedAmount: opportunity?.expected_amount?.value ?? null,
    expectedDate: getOpportunityExpectedDate(opportunity),
    fundedAmount: getOpportunityFundedAmount(opportunity),
    fundedDate: getOpportunityFundedDate(opportunity),
    deadline: opportunity?.deadline || null,
    inactive: opportunity?.inactive ?? null,
    linkedGifts: Array.isArray(opportunity?.linked_gifts)
      ? opportunity.linked_gifts
      : [],
    opportunityLikelihoodName: opportunity?.opportunity_likelihood_name || null,
    opportunityLikelihoodId: opportunity?.opportunity_likelihood_id || null,
    giftType: opportunity?.gift_type || null,
    giftTypeId: opportunity?.gift_type_id || null,
    fundraisers: Array.isArray(opportunity?.fundraisers)
      ? opportunity.fundraisers.map(mapFundraiser)
      : [],
    dateAdded: opportunity?.date_added || null,
    dateModified: opportunity?.date_modified || null,
  };
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

  const opportunityId = String(params?.opportunityId || "").trim();
  if (!opportunityId) {
    return Response.json(
      { error: "A Blackbaud opportunity ID is required" },
      { status: 400 },
    );
  }

  const includeRaw = new URL(request.url).searchParams.get("raw") === "true";

  try {
    const user = await getOrCreateUser(session);
    const opportunity = await blackbaudApiFetch(
      `/opportunity/v1/opportunities/${encodeURIComponent(opportunityId)}`,
      {
        userId: user.id,
        origin,
      },
    );

    return Response.json({
      opportunityId,
      mapped: mapOpportunity(opportunity),
      ...(includeRaw ? { raw: opportunity } : {}),
    });
  } catch (error) {
    console.error("Blackbaud opportunity fetch error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch Blackbaud opportunity",
      },
      { status: 500 },
    );
  }
}
