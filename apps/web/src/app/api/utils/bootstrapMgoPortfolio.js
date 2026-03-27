import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  blackbaudApiFetch,
  findBlackbaudConstituentByLookupId,
  findBlackbaudConstituentByEmail,
  listBlackbaudOpportunities,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";
import { resolveConstituent } from "@/app/api/utils/constituents";
import { getBootstrapAdminEmail } from "@/app/api/utils/invitations";

const ALLOWED_OPPORTUNITY_STATUSES = new Set([
  "Identification",
  "Cultivation",
  "Solicitation",
  "Solicitation - Verbal",
]);

const STATUS_PRIORITY = {
  "Solicitation - Verbal": 0,
  Solicitation: 1,
  Cultivation: 2,
  Identification: 3,
};
const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const OPPORTUNITY_DETAIL_BATCH_SIZE = 8;

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isRecentTimestamp(value, intervalMs = AUTO_SYNC_INTERVAL_MS) {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed < intervalMs;
}

function getFiscalYearLabel(expectedDate) {
  if (!expectedDate) return null;

  const parsed = new Date(expectedDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const month = parsed.getUTCMonth();
  const year = parsed.getUTCFullYear();
  const fiscalYear = month >= 6 ? year + 1 : year;
  return `FY${String(fiscalYear).slice(-2)}`;
}

function getFiscalYearNumber(expectedDate) {
  if (!expectedDate) return Number.POSITIVE_INFINITY;

  const parsed = new Date(expectedDate);
  if (Number.isNaN(parsed.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  const month = parsed.getUTCMonth();
  const year = parsed.getUTCFullYear();
  return month >= 6 ? year + 1 : year;
}

function getOpportunityAmount(opportunity) {
  return Number(
    opportunity?.expected_amount?.value ??
      opportunity?.ask_amount?.value ??
      opportunity?.funded_amount?.value ??
      0,
  );
}

function getImportedOpportunityStatus(opportunity) {
  const normalizedStatus = normalizeText(opportunity?.status);
  const fundedAmount = Number(opportunity?.funded_amount?.value ?? 0);
  const fundedDate = opportunity?.funded_date || null;

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

async function enrichOpportunityDetails({ userId, authUserId, origin, opportunities }) {
  const enriched = [];

  for (let index = 0; index < opportunities.length; index += OPPORTUNITY_DETAIL_BATCH_SIZE) {
    const chunk = opportunities.slice(index, index + OPPORTUNITY_DETAIL_BATCH_SIZE);
    const detailedChunk = await Promise.all(
      chunk.map(async (opportunity) => {
        if (
          opportunity?.ask_date &&
          opportunity?.expected_date &&
          (opportunity?.funded_amount?.value != null || opportunity?.funded_date)
        ) {
          return opportunity;
        }

        if (!opportunity?.id) {
          return opportunity;
        }

        try {
          const detailedOpportunity = await blackbaudApiFetch(
            `/opportunity/v1/opportunities/${encodeURIComponent(String(opportunity.id))}`,
            {
              userId,
              authUserId,
              origin,
            },
          );

          return {
            ...opportunity,
            ...detailedOpportunity,
          };
        } catch {
          return opportunity;
        }
      }),
    );

    enriched.push(...detailedChunk);
  }

  return enriched;
}

function compareOpportunities(left, right) {
  const fiscalYearDelta =
    getFiscalYearNumber(left?.expected_date) - getFiscalYearNumber(right?.expected_date);
  if (fiscalYearDelta !== 0) {
    return fiscalYearDelta;
  }

  const statusDelta =
    (STATUS_PRIORITY[left?.status] ?? Number.MAX_SAFE_INTEGER) -
    (STATUS_PRIORITY[right?.status] ?? Number.MAX_SAFE_INTEGER);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  const amountDelta = getOpportunityAmount(right) - getOpportunityAmount(left);
  if (amountDelta !== 0) {
    return amountDelta;
  }

  return new Date(left?.expected_date || 0).getTime() - new Date(right?.expected_date || 0).getTime();
}

async function getUserById(userId) {
  const rows = await sql`
    SELECT *
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function updateUserBlackbaudLink({
  userId,
  blackbaudConstituentId,
  blackbaudLookupId,
}) {
  await sql`
    UPDATE users
    SET
      blackbaud_constituent_id = COALESCE(${blackbaudConstituentId || null}, blackbaud_constituent_id),
      blackbaud_lookup_id = COALESCE(${blackbaudLookupId || null}, blackbaud_lookup_id),
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

async function markSeedAttempt({ userId, error = null, seeded = false }) {
  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_seed_attempted_at = NOW(),
      blackbaud_portfolio_seed_error = ${error},
      blackbaud_portfolio_seeded_at = CASE
        WHEN ${seeded} THEN NOW()
        ELSE blackbaud_portfolio_seeded_at
      END,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

async function resolveUserBlackbaudConstituent({ user, authUserId, origin }) {
  const exactLookupMatch = await findBlackbaudConstituentByLookupId({
    userId: user.id,
    authUserId,
    origin,
    lookupId: user.blackbaud_lookup_id,
  }).catch(() => null);
  if (exactLookupMatch?.blackbaudConstituentId) {
    return exactLookupMatch;
  }

  if (user?.blackbaud_constituent_id) {
    return {
      blackbaudConstituentId: user.blackbaud_constituent_id,
      lookupId: user.blackbaud_lookup_id || null,
    };
  }

  const exactEmailMatch = await findBlackbaudConstituentByEmail({
    userId: user.id,
    authUserId,
    origin,
    email: user.email,
  });
  if (exactEmailMatch?.blackbaudConstituentId) {
    return exactEmailMatch;
  }

  const fallbackMatches = await searchBlackbaudConstituents({
    userId: user.id,
    authUserId,
    origin,
    query: user.name || user.email,
  });

  const normalizedName = normalizeText(user.name);
  const nameMatch =
    fallbackMatches.find(
      (match) =>
        normalizeText(match?.name) === normalizedName &&
        normalizeText(match?.email) === normalizeText(user.email),
    ) ||
    fallbackMatches.find((match) => normalizeText(match?.name) === normalizedName) ||
    null;

  return nameMatch;
}

async function fetchConstituentBasics({ userId, authUserId, origin, blackbaudConstituentId }) {
  const constituent = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(blackbaudConstituentId))}`,
    {
      userId,
      authUserId,
      origin,
    },
  );

  return {
    blackbaudConstituentId: constituent?.id || String(blackbaudConstituentId),
    lookupId: constituent?.lookup_id || null,
    name: constituent?.name || null,
  };
}

async function upsertProspectOpportunity({
  prospectId,
  constituentId,
  opportunity,
}) {
  const existingRows = await sql`
    SELECT id
    FROM prospect_opportunities
    WHERE prospect_id = ${prospectId}
      AND blackbaud_opportunity_id = ${String(opportunity.id)}
    LIMIT 1
  `;

  const payload = {
    title: opportunity?.name || "Imported Blackbaud opportunity",
    currentStage: opportunity?.status || "Identification",
    estimatedAmount: getOpportunityAmount(opportunity) || null,
    opportunityStatus: getImportedOpportunityStatus(opportunity),
    askDate: opportunity?.ask_date || null,
    expectedDate: opportunity?.expected_date || null,
    closedAmount: opportunity?.funded_amount?.value ?? null,
    closeDate: opportunity?.funded_date || null,
  };

  if (existingRows[0]?.id) {
    await sql`
      UPDATE prospect_opportunities
      SET
        title = ${payload.title},
        current_stage = ${payload.currentStage},
        estimated_amount = ${payload.estimatedAmount},
        ask_date = ${payload.askDate},
        expected_date = ${payload.expectedDate},
        opportunity_status = ${payload.opportunityStatus},
        closed_amount = ${payload.closedAmount},
        close_date = ${payload.closeDate},
        constituent_id = ${constituentId || null},
        updated_at = NOW()
      WHERE id = ${existingRows[0].id}
    `;
    return;
  }

  await sql`
    INSERT INTO prospect_opportunities (
      prospect_id,
      constituent_id,
      blackbaud_opportunity_id,
      title,
      current_stage,
      opportunity_status,
      estimated_amount,
      ask_date,
      expected_date,
      closed_amount,
      close_date,
      created_at,
      updated_at
    ) VALUES (
      ${prospectId},
      ${constituentId || null},
      ${String(opportunity.id)},
      ${payload.title},
      ${payload.currentStage},
      ${payload.opportunityStatus},
      ${payload.estimatedAmount},
      ${payload.askDate},
      ${payload.expectedDate},
      ${payload.closedAmount},
      ${payload.closeDate},
      NOW(),
      NOW()
    )
  `;
}

async function rankExistingProspects(userId, prospectIdsInOrder) {
  for (let index = 0; index < prospectIdsInOrder.length; index += 1) {
    await sql`
      UPDATE prospects
      SET priority_order = ${index + 1}, updated_at = NOW()
      WHERE id = ${prospectIdsInOrder[index]} AND user_id = ${userId}
    `;
  }
}

async function getNextActivePriorityOrder(userId) {
  const rows = await sql`
    SELECT COALESCE(MAX(priority_order), 0) AS max_order
    FROM prospects
    WHERE user_id = ${userId} AND status = 'Active'
  `;

  return Number(rows[0]?.max_order || 0);
}

export async function bootstrapMgoPortfolioFromBlackbaud({
  userId,
  authUserId,
  origin,
  force = false,
} = {}) {
  await ensureAppSchema();

  const user = await getUserById(userId);
  const bootstrapAdminEmail = getBootstrapAdminEmail();
  const canSeedBootstrapAdmin =
    Boolean(bootstrapAdminEmail) &&
    user?.email === bootstrapAdminEmail &&
    Boolean(user?.blackbaud_constituent_id);

  if (!user || (user.role !== "mgo" && !canSeedBootstrapAdmin)) {
    return { skipped: true, reason: "not-mgo" };
  }

  if (!force && isRecentTimestamp(user.blackbaud_portfolio_seed_attempted_at)) {
    return { skipped: true, reason: "recent-attempt" };
  }

  const userBlackbaudConstituent = await resolveUserBlackbaudConstituent({
    user,
    authUserId,
    origin,
  });

  if (!userBlackbaudConstituent?.blackbaudConstituentId) {
    await markSeedAttempt({
      userId,
      error:
        "Could not resolve this MGO to a Blackbaud constituent record for opportunity import.",
    });
    return { skipped: true, reason: "user-not-linked" };
  }

  await updateUserBlackbaudLink({
    userId,
    blackbaudConstituentId: userBlackbaudConstituent.blackbaudConstituentId,
    blackbaudLookupId: userBlackbaudConstituent.lookupId,
  });

  const listedOpportunities = await listBlackbaudOpportunities({
    userId,
    authUserId,
    origin,
    searchParams: {
      limit: 500,
    },
  });

  const assignedOpportunities = listedOpportunities.filter((opportunity) => {
    const assignedFundraisers = Array.isArray(opportunity?.fundraisers)
      ? opportunity.fundraisers
      : [];

    return assignedFundraisers.some(
      (fundraiser) =>
        String(fundraiser?.constituent_id || "") ===
        String(userBlackbaudConstituent.blackbaudConstituentId),
    );
  });

  const opportunities = await enrichOpportunityDetails({
    userId,
    authUserId,
    origin,
    opportunities: assignedOpportunities,
  });

  const qualifying = opportunities.filter((opportunity) => {
    if (opportunity?.inactive) return false;
    if (normalizeText(opportunity?.purpose) !== normalizeText("Future. Made. Campaign")) {
      return false;
    }
    if (!ALLOWED_OPPORTUNITY_STATUSES.has(opportunity?.status)) {
      return false;
    }
    if (!opportunity?.expected_date || !opportunity?.constituent_id) {
      return false;
    }
    return true;
  });

  const groupedByConstituent = new Map();
  const allAssignedByConstituent = new Map();
  opportunities.forEach((opportunity) => {
    const key = String(opportunity.constituent_id || "");
    if (!key) return;
    const bucket = allAssignedByConstituent.get(key) || [];
    bucket.push(opportunity);
    allAssignedByConstituent.set(key, bucket);
  });

  qualifying.forEach((opportunity) => {
    const key = String(opportunity.constituent_id);
    const bucket = groupedByConstituent.get(key) || [];
    bucket.push(opportunity);
    groupedByConstituent.set(key, bucket);
  });

  const constituentCache = new Map();
  const rankedGroups = await Promise.all(
    [...groupedByConstituent.entries()].map(async ([blackbaudConstituentId, items]) => {
      const sortedItems = [...items].sort(compareOpportunities);
      let constituent = constituentCache.get(blackbaudConstituentId);

      if (!constituent) {
        constituent = await fetchConstituentBasics({
          userId,
          authUserId,
          origin,
          blackbaudConstituentId,
        });
        constituentCache.set(blackbaudConstituentId, constituent);
      }

      return {
        blackbaudConstituentId,
        constituent,
        opportunities:
          allAssignedByConstituent.get(blackbaudConstituentId) || sortedItems,
        primaryOpportunity: sortedItems[0],
      };
    }),
  );

  rankedGroups.sort((left, right) =>
    compareOpportunities(left.primaryOpportunity, right.primaryOpportunity),
  );

  const activeProspects = await sql`
    SELECT id
    FROM prospects
    WHERE user_id = ${userId} AND status = 'Active'
    ORDER BY priority_order ASC, created_at ASC
  `;
  const hadActiveProspects = activeProspects.length > 0;
  let nextPriorityOrder = await getNextActivePriorityOrder(userId);
  const seededProspectIds = [];
  let createdProspects = 0;
  let createdOpportunities = 0;

  for (const group of rankedGroups) {
    const constituent = await resolveConstituent({
      userId,
      name:
        group.constituent?.name ||
        group.primaryOpportunity?.name ||
        `Constituent ${group.blackbaudConstituentId}`,
      blackbaudConstituentId: group.blackbaudConstituentId,
      createNew: true,
    });

    const existingProspectRows = await sql`
      SELECT id, status, priority_order
      FROM prospects
      WHERE user_id = ${userId}
        AND constituent_id = ${constituent?.id || null}
      ORDER BY
        CASE WHEN status = 'Active' THEN 0 ELSE 1 END,
        priority_order ASC,
        created_at ASC
      LIMIT 1
    `;

    const topOpportunity = group.primaryOpportunity;
    const expectedCloseFY = getFiscalYearLabel(topOpportunity?.expected_date);
    if (!expectedCloseFY) {
      continue;
    }

    let prospectId = existingProspectRows[0]?.id || null;
    let reactivatedPriorityOrder = null;
    if (!prospectId) {
      nextPriorityOrder += 1;
      const insertedProspects = await sql`
        INSERT INTO prospects (
          user_id,
          constituent_id,
          blackbaud_constituent_id,
          prospect_name,
          expected_close_fy,
          ask_amount,
          ask_type,
          priority_order,
          created_at,
          updated_at
        ) VALUES (
          ${userId},
          ${constituent?.id || null},
          ${group.blackbaudConstituentId},
          ${group.constituent?.name || topOpportunity?.name || "Imported prospect"},
          ${expectedCloseFY},
          ${getOpportunityAmount(topOpportunity) || null},
          ${"Major Gift"},
          ${nextPriorityOrder},
          NOW(),
          NOW()
        )
        RETURNING id
      `;
      prospectId = insertedProspects[0]?.id || null;
      if (prospectId) {
        createdProspects += 1;
      }
    } else if (existingProspectRows[0]?.status !== "Active") {
      nextPriorityOrder += 1;
      reactivatedPriorityOrder = nextPriorityOrder;
    }

    if (!prospectId) {
      continue;
    }

    if (!hadActiveProspects) {
      seededProspectIds.push(prospectId);
    }

    await sql`
      UPDATE prospects
      SET
        constituent_id = COALESCE(${constituent?.id || null}, constituent_id),
        blackbaud_constituent_id = COALESCE(${group.blackbaudConstituentId}, blackbaud_constituent_id),
        prospect_name = COALESCE(${group.constituent?.name || null}, prospect_name),
        expected_close_fy = COALESCE(${expectedCloseFY}, expected_close_fy),
        ask_amount = COALESCE(${getOpportunityAmount(topOpportunity) || null}, ask_amount),
        ask_type = COALESCE(ask_type, ${"Major Gift"}),
        status = 'Active',
        closed_amount = NULL,
        close_date = NULL,
        decline_reason = NULL,
        priority_order = COALESCE(${reactivatedPriorityOrder}, priority_order),
        updated_at = NOW()
      WHERE id = ${prospectId}
    `;

    for (const opportunity of group.opportunities) {
      const beforeRows = await sql`
        SELECT id
        FROM prospect_opportunities
        WHERE prospect_id = ${prospectId}
          AND blackbaud_opportunity_id = ${String(opportunity.id)}
        LIMIT 1
      `;
      await upsertProspectOpportunity({
        prospectId,
        constituentId: constituent?.id || null,
        opportunity,
      });
      if (!beforeRows[0]?.id) {
        createdOpportunities += 1;
      }
    }
  }

  if (!hadActiveProspects && seededProspectIds.length > 0) {
    await rankExistingProspects(userId, seededProspectIds);
  }

  await markSeedAttempt({ userId, seeded: true });

  return {
    skipped: false,
    userBlackbaudConstituentId: userBlackbaudConstituent.blackbaudConstituentId,
    createdProspects,
    createdOpportunities,
    matchedOpportunities: qualifying.length,
    seededConstituents: rankedGroups.length,
  };
}
