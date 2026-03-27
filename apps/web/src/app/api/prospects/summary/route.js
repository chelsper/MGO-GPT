import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  blackbaudApiFetch,
  findBlackbaudConstituentByEmail,
  findBlackbaudConstituentByLookupId,
  getBlackbaudConfigIssues,
  listBlackbaudOpportunities,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

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

function getImportedOpportunityStatus(opportunity) {
  const normalizedStatus = String(opportunity?.status || "").trim().toLowerCase();
  const fundedAmount = Number(getOpportunityFundedAmount(opportunity) ?? 0);
  const fundedDate = getOpportunityFundedDate(opportunity);

  if (fundedAmount > 0 || fundedDate) {
    return "Closed – Gift Secured";
  }

  if (
    normalizedStatus.includes("declined") ||
    normalizedStatus.includes("lost") ||
    normalizedStatus.includes("cancel") ||
    normalizedStatus.includes("rejected")
  ) {
    return "Closed – Declined";
  }

  return "Active";
}

async function backfillImportedFundedOpportunities({ userId, authUserId, origin }) {
  const configIssues = getBlackbaudConfigIssues(origin);
  if (configIssues.length > 0) return;

  const rowsNeedingRefresh = await sql`
    SELECT po.id, po.blackbaud_opportunity_id
    FROM prospect_opportunities po
    INNER JOIN prospects p ON p.id = po.prospect_id
    WHERE p.user_id = ${userId}
      AND po.blackbaud_opportunity_id IS NOT NULL
      AND (
        po.closed_amount IS NULL
        OR po.close_date IS NULL
      )
    ORDER BY po.updated_at DESC
    LIMIT 25
  `;

  if (!rowsNeedingRefresh.length) return;

  await Promise.all(
    rowsNeedingRefresh.map(async (row) => {
      try {
        const opportunity = await blackbaudApiFetch(
          `/opportunity/v1/opportunities/${encodeURIComponent(String(row.blackbaud_opportunity_id))}`,
          {
            userId,
            authUserId,
            origin,
          },
        );

        const nextClosedAmount = getOpportunityFundedAmount(opportunity);
        const nextCloseDate = getOpportunityFundedDate(opportunity);
        const nextStatus = getImportedOpportunityStatus(opportunity);

        await sql`
          UPDATE prospect_opportunities
          SET
            opportunity_status = CASE
              WHEN ${nextStatus} = 'Closed – Gift Secured' THEN 'Closed – Gift Secured'
              ELSE opportunity_status
            END,
            closed_amount = COALESCE(${nextClosedAmount}, closed_amount),
            close_date = COALESCE(${nextCloseDate}, close_date),
            updated_at = NOW()
          WHERE id = ${row.id}
        `;
      } catch (error) {
        console.error("Summary funded backfill error:", error);
      }
    }),
  );
}

async function resolveWorkspaceFundraiserConstituentId({ user, authUserId, origin }) {
  if (user?.blackbaud_lookup_id) {
    const lookupMatch = await findBlackbaudConstituentByLookupId({
      userId: user.id,
      authUserId,
      origin,
      lookupId: user.blackbaud_lookup_id,
    }).catch(() => null);

    if (lookupMatch?.blackbaudConstituentId) {
      return String(lookupMatch.blackbaudConstituentId);
    }
  }

  if (user?.blackbaud_constituent_id) {
    return String(user.blackbaud_constituent_id);
  }

  if (user?.email) {
    const emailMatch = await findBlackbaudConstituentByEmail({
      userId: user.id,
      authUserId,
      origin,
      email: user.email,
    }).catch(() => null);

    if (emailMatch?.blackbaudConstituentId) {
      return String(emailMatch.blackbaudConstituentId);
    }
  }

  return null;
}

async function getLiveBlackbaudClosedThisFY({
  user,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
}) {
  const fundraiserConstituentId = await resolveWorkspaceFundraiserConstituentId({
    user,
    authUserId,
    origin,
  });

  if (!fundraiserConstituentId) {
    return 0;
  }

  const opportunities = await listBlackbaudOpportunities({
    userId: user.id,
    authUserId,
    origin,
    searchParams: {
      limit: 500,
    },
  }).catch(() => []);

  const fiscalStart = new Date(`${fiscalYearStart}T00:00:00Z`).getTime();
  const fiscalEnd = new Date(`${fiscalYearEnd}T23:59:59Z`).getTime();

  return opportunities.reduce((sum, opportunity) => {
    const fundraisers = Array.isArray(opportunity?.fundraisers)
      ? opportunity.fundraisers
      : [];
    const isAssigned = fundraisers.some(
      (fundraiser) =>
        String(fundraiser?.constituent_id || "") === fundraiserConstituentId,
    );

    if (!isAssigned) return sum;

    const fundedDate = getOpportunityFundedDate(opportunity);
    if (!fundedDate) return sum;

    const fundedTimestamp = new Date(fundedDate).getTime();
    if (Number.isNaN(fundedTimestamp)) return sum;
    if (fundedTimestamp < fiscalStart || fundedTimestamp > fiscalEnd) return sum;

    const fundedAmount = Number(getOpportunityFundedAmount(opportunity) ?? 0);
    if (fundedAmount > 0) {
      return sum + fundedAmount;
    }

    return sum;
  }, 0);
}

// GET prospect summary stats for dashboard
export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(
      session,
      request,
    );
    if (!user) {
      return Response.json({
        activeCount: 0,
        totalAskPipeline: 0,
        closedThisFY: 0,
      });
    }
    const authUserId = isActing ? sessionUser.id : user.id;
    const origin = request?.url ? new URL(request.url).origin : null;

    // Count active prospects
    const activeResult = await sql`
      SELECT
        COUNT(*) as active_count,
        COALESCE(SUM(ask_amount), 0) as total_pipeline
      FROM prospects
      WHERE user_id = ${user.id} AND status = 'Active'
    `;

    // Calculate current fiscal year window (July 1 - June 30)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const fiscalStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
    const fiscalEndYear = fiscalStartYear + 1;
    const currentFY = `FY${String(fiscalEndYear).slice(-2)}`;
    const fiscalYearStart = `${fiscalStartYear}-07-01`;
    const fiscalYearEnd = `${fiscalEndYear}-06-30`;

    await backfillImportedFundedOpportunities({
      userId: user.id,
      authUserId,
      origin,
    });

    // Funded revenue this FY should come from funded opportunities, not prospect rollups.
    // Imported NXT data can lag on local status normalization, so use funded fields first
    // and fall back to the estimated amount only when the row is explicitly secured.
    const closedResult = await sql`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(po.closed_amount, 0) > 0 THEN COALESCE(po.closed_amount, 0)
              WHEN po.opportunity_status = 'Closed – Gift Secured' THEN COALESCE(po.estimated_amount, 0)
              ELSE 0
            END
          ),
          0
        ) AS closed_total
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE p.user_id = ${user.id}
        AND po.close_date IS NOT NULL
        AND po.close_date >= ${fiscalYearStart}
        AND po.close_date <= ${fiscalYearEnd}
        AND (
          COALESCE(po.closed_amount, 0) > 0
          OR po.opportunity_status = 'Closed – Gift Secured'
        )
    `;

    let closedThisFY = parseFloat(closedResult[0].closed_total) || 0;

    if (
      closedThisFY === 0 &&
      (user.blackbaud_constituent_id || user.blackbaud_lookup_id) &&
      origin
    ) {
      const liveClosedThisFY = await getLiveBlackbaudClosedThisFY({
        user,
        authUserId,
        origin,
        fiscalYearStart,
        fiscalYearEnd,
      }).catch(() => 0);

      if (liveClosedThisFY > 0) {
        closedThisFY = liveClosedThisFY;
      }
    }

    return Response.json({
      activeCount: parseInt(activeResult[0].active_count) || 0,
      totalAskPipeline: parseFloat(activeResult[0].total_pipeline) || 0,
      closedThisFY,
      currentFY,
    });
  } catch (error) {
    console.error("Error fetching prospect summary:", error);
    return Response.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
