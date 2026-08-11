import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  blackbaudApiFetch,
  findBlackbaudConstituentByLookupId,
  findBlackbaudConstituentByEmail,
  getBlackbaudConfigIssues,
  listBlackbaudGifts,
  listBlackbaudConstituents,
  listBlackbaudFundraiserAssignments,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";

const PORTFOLIO_CACHE_TTL_MS = 15 * 60 * 1000;
const PORTFOLIO_CACHE_VERSION = "v5";
const PORTFOLIO_DETAIL_CONCURRENCY = 6;
const PORTFOLIO_GIFT_QUERY_CHUNK_SIZE = 20;
const PORTFOLIO_GIFT_PAGE_LIMIT = 25;
const PORTFOLIO_GIFT_MAX_PAGES = 1;
const EXCLUDED_LAST_GIFT_FUNDS = new Set(["credit card processing fee"]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
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

function normalizeGiftFundName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getTextFromMaybeObject(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim() || null;
  }

  if (typeof value === "object") {
    return (
      String(
        firstDefined(value, [
          "name",
          "description",
          "fund_name",
          "fundName",
          "fund_description",
          "fundDescription",
          "value",
          "id",
        ]) || "",
      ).trim() || null
    );
  }

  return null;
}

function getGiftDate(gift) {
  return firstDefined(gift, [
    "date",
    "gift_date",
    "giftDate",
    "date_received",
    "dateReceived",
    "received_date",
    "receivedDate",
  ]);
}

function getGiftTypeLabel(gift) {
  const rawType = String(
    firstDefined(gift, [
      "gift_type",
      "giftType",
      "type",
      "type_name",
      "category",
    ]) || "",
  ).trim();

  if (!rawType) return null;

  return rawType
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function getGiftFundNames(gift) {
  const fundNames = [];
  const paths = [
    "fund",
    "fund.name",
    "fund.description",
    "fund_name",
    "fundName",
    "fund_description",
    "fundDescription",
    "gift_fund",
    "giftFund",
    "designation",
    "designation.name",
    "designation.description",
    "payments.0.applications.0.fund",
    "payments.0.applications.0.fund.name",
    "payments.0.applications.0.fund.description",
    "applications.0.fund",
    "applications.0.fund.name",
    "applications.0.fund.description",
  ];

  for (const path of paths) {
    const value = getNestedValue(gift, path);
    const label = getTextFromMaybeObject(value);
    if (label && !fundNames.some((existing) => normalizeGiftFundName(existing) === normalizeGiftFundName(label))) {
      fundNames.push(label);
    }
  }

  const arrayPaths = ["funds", "designations", "payments.0.applications", "applications"];
  for (const path of arrayPaths) {
    const value = getNestedValue(gift, path);
    if (!Array.isArray(value)) continue;

    for (const item of value) {
      const label =
        getTextFromMaybeObject(item?.fund) ||
        getTextFromMaybeObject(item?.designation) ||
        getTextFromMaybeObject(item);
      if (label && !fundNames.some((existing) => normalizeGiftFundName(existing) === normalizeGiftFundName(label))) {
        fundNames.push(label);
      }
    }
  }

  return fundNames;
}

function isExcludedLastGiftFund(gift) {
  const fundNames = getGiftFundNames(gift);
  // A gift may have a fee application and a real gift fund. Exclude it only
  // when every returned fund is the processing-fee fund.
  return (
    fundNames.length > 0 &&
    fundNames.every((fundName) =>
      EXCLUDED_LAST_GIFT_FUNDS.has(normalizeGiftFundName(fundName)),
    )
  );
}

function mapLastGift(gift) {
  if (!gift) return null;

  const fundNames = getGiftFundNames(gift).filter(
    (fundName) => !EXCLUDED_LAST_GIFT_FUNDS.has(normalizeGiftFundName(fundName)),
  );
  return {
    date: getGiftDate(gift) || null,
    type: getGiftTypeLabel(gift),
    fund: fundNames[0] || null,
  };
}

function getGiftAssociatedConstituentIds(gift) {
  const ids = new Set();
  const addId = (value) => {
    const normalizedId = String(value || "").trim();
    if (normalizedId) ids.add(normalizedId);
  };

  addId(
    firstDefined(gift, [
      "constituent_id",
      "constituentId",
      "constituent.id",
      "constituent.system_record_id",
    ]),
  );

  const softCredits = firstDefined(gift, ["soft_credits", "softCredits"]);
  if (Array.isArray(softCredits)) {
    softCredits.forEach((softCredit) => {
      addId(
        firstDefined(softCredit, [
          "constituent_id",
          "constituentId",
          "constituent.id",
          "constituent.system_record_id",
        ]),
      );
    });
  }

  return ids;
}

function getMostRecentQualifyingGift(gifts) {
  const sortedGifts = gifts
    .filter((gift) => getGiftDate(gift))
    .filter((gift) => !isExcludedLastGiftFund(gift))
    .sort((left, right) => {
      const rightDate = new Date(getGiftDate(right)).getTime();
      const leftDate = new Date(getGiftDate(left)).getTime();
      return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
    });

  return sortedGifts[0] || null;
}

async function fetchLastGifts({ userId, authUserId, origin, constituentIds }) {
  const normalizedConstituentIds = Array.from(
    new Set(
      constituentIds
        .map((constituentId) => String(constituentId || "").trim())
        .filter(Boolean),
    ),
  );
  const giftsByConstituentId = new Map(
    normalizedConstituentIds.map((constituentId) => [constituentId, []]),
  );

  for (
    let index = 0;
    index < normalizedConstituentIds.length;
    index += PORTFOLIO_GIFT_QUERY_CHUNK_SIZE
  ) {
    const constituentIdChunk = normalizedConstituentIds.slice(
      index,
      index + PORTFOLIO_GIFT_QUERY_CHUNK_SIZE,
    );
    const gifts = await listBlackbaudGifts({
      userId,
      authUserId,
      origin,
      searchParams: {
        constituent_id: constituentIdChunk,
      },
      // Last-gift details should enrich the portfolio, not hold up the entire
      // dashboard with a broad multi-page revenue query.
      pageLimit: PORTFOLIO_GIFT_PAGE_LIMIT,
      maxPages: PORTFOLIO_GIFT_MAX_PAGES,
    });

    for (const gift of gifts) {
      const associatedIds = getGiftAssociatedConstituentIds(gift);
      constituentIdChunk.forEach((constituentId) => {
        if (associatedIds.has(constituentId)) {
          giftsByConstituentId.get(constituentId).push(gift);
        }
      });
    }
  }

  return new Map(
    normalizedConstituentIds.map((constituentId) => [
      constituentId,
      mapLastGift(getMostRecentQualifyingGift(giftsByConstituentId.get(constituentId))),
    ]),
  );
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
    assignment?.constituent?.id ||
    null
  );
}

function classifyAssignmentType(type) {
  const normalizedType = normalizeText(type);

  if (
    normalizedType.includes("lead solicitor") ||
    normalizedType.includes("primary solicitor")
  ) {
    return "lead";
  }

  if (
    normalizedType.includes("secondary solicitor") ||
    normalizedType.includes("athletics solicitor")
  ) {
    return "support";
  }

  return null;
}

function getAssignedFundraisers(constituent) {
  return (
    constituent?.constituent_assigned_fundraisers ||
    constituent?.assigned_fundraisers ||
    constituent?.fundraiser_assignments ||
    constituent?.fundraisers ||
    []
  );
}

function getFundraiserIdentitySet(workspaceUser, fundraiserId) {
  return new Set(
    [
      fundraiserId,
      workspaceUser?.blackbaud_constituent_id,
      workspaceUser?.blackbaud_lookup_id,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function getAssignedFundraiserId(assignment) {
  return (
    assignment?.fundraiser_id ||
    assignment?.fundraiser?.id ||
    assignment?.fundraiser_constituent_id ||
    assignment?.constituent_id ||
    assignment?.id ||
    null
  );
}

async function listAssignmentsFromConstituentFallback({
  userId,
  authUserId,
  origin,
  workspaceUser,
  fundraiserId,
}) {
  const fundraiserIdentitySet = getFundraiserIdentitySet(workspaceUser, fundraiserId);
  const constituents = await listBlackbaudConstituents({
    userId,
    authUserId,
    origin,
    searchParams: {
      constituent_assigned_fundraisers: true,
    },
    pageLimit: 500,
    maxPages: 20,
  }).catch(() => []);

  const assignments = [];

  for (const constituent of constituents) {
    const assignedFundraisers = getAssignedFundraisers(constituent);
    if (!Array.isArray(assignedFundraisers) || assignedFundraisers.length === 0) {
      continue;
    }

    for (const assignedFundraiser of assignedFundraisers) {
      const assignedFundraiserId = String(
        getAssignedFundraiserId(assignedFundraiser) || "",
      ).trim();
      if (!assignedFundraiserId || !fundraiserIdentitySet.has(assignedFundraiserId)) {
        continue;
      }

      assignments.push({
        constituent_id:
          constituent?.id || constituent?.constituent_id || constituent?.lookup_id || null,
        type:
          assignedFundraiser?.type ||
          assignedFundraiser?.assignment_type ||
          assignedFundraiser?.fundraiser_type ||
          (assignedFundraisers.length === 1 ? "Lead Solicitor" : "Secondary Solicitor"),
        end:
          assignedFundraiser?.end ||
          assignedFundraiser?.end_date ||
          null,
      });
    }
  }

  return assignments;
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
    hasTransientDetailError:
      lifetimeGivingResult.status === "rejected",
  };
}

async function enrichConstituents({ userId, authUserId, origin, groupedAssignments }) {
  const entries = Array.from(groupedAssignments.values());
  const enriched = [];

  for (let index = 0; index < entries.length; index += PORTFOLIO_DETAIL_CONCURRENCY) {
    const chunk = entries.slice(index, index + PORTFOLIO_DETAIL_CONCURRENCY);
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
          lastGift: details.lastGift,
          lastGiftStatus: details.lastGiftStatus,
          hasTransientDetailError: details.hasTransientDetailError,
          assignmentTypes: Array.from(entry.assignmentTypes),
        };
      }),
    );

    enriched.push(...results.filter(Boolean));
  }

  const constituentIds = enriched
    .map((person) => String(person?.constituentId || "").trim())
    .filter(Boolean);
  let lastGiftsByConstituentId = new Map();
  let lastGiftLoadFailed = false;

  if (constituentIds.length > 0) {
    try {
      lastGiftsByConstituentId = await fetchLastGifts({
        userId,
        authUserId,
        origin,
        constituentIds,
      });
    } catch {
      lastGiftLoadFailed = true;
    }
  }

  return enriched
    .map((person) => {
      const constituentId = String(person?.constituentId || "").trim();
      const lastGift = lastGiftsByConstituentId.get(constituentId) || null;
      return {
        ...person,
        lastGift,
        lastGiftStatus: lastGiftLoadFailed
          ? "unavailable"
          : lastGift
            ? "loaded"
            : "no-qualifying-gift",
        hasTransientDetailError: person.hasTransientDetailError || lastGiftLoadFailed,
      };
    })
    .sort((left, right) =>
      String(left?.name || "").localeCompare(String(right?.name || ""), "en"),
    );
}

function isFreshCache(timestamp) {
  if (!timestamp) return false;
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed < PORTFOLIO_CACHE_TTL_MS;
}

async function getCachedPortfolio(workspaceUserId, cacheKey) {
  if (!workspaceUserId || !cacheKey) return null;

  const acceptedCacheKeys = Array.isArray(cacheKey) ? cacheKey : [cacheKey];

  const rows = await sql`
    SELECT blackbaud_portfolio_cache, blackbaud_portfolio_cached_at, blackbaud_portfolio_cache_key
    FROM users
    WHERE id = ${workspaceUserId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row?.blackbaud_portfolio_cache) return null;
  if (
    !acceptedCacheKeys.some(
      (expectedKey) =>
        String(row.blackbaud_portfolio_cache_key || "") === String(expectedKey),
    )
  ) {
    return null;
  }
  if (!isFreshCache(row.blackbaud_portfolio_cached_at)) return null;

  return row.blackbaud_portfolio_cache;
}

async function saveCachedPortfolio(workspaceUserId, cacheKey, payload) {
  if (!workspaceUserId || !cacheKey || !payload) return;

  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_cache = ${JSON.stringify(payload)}::jsonb,
      blackbaud_portfolio_cache_key = ${String(cacheKey)},
      blackbaud_portfolio_cached_at = NOW(),
      updated_at = NOW()
    WHERE id = ${workspaceUserId}
  `;
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

  if (workspaceUser?.blackbaud_constituent_id) {
    addFundraiserCandidate(
      candidates,
      workspaceUser.blackbaud_constituent_id,
      "workspace-blackbaud-constituent-id",
    );
    // A previously linked NXT identity is the authoritative starting point.
    // Avoid three extra lookup calls on every refresh, which can rate-limit
    // the portfolio before its assignments are read.
    return candidates;
  }

  const exactLookupMatch = await findBlackbaudConstituentByLookupId({
    userId: workspaceUser.id,
    authUserId,
    origin,
    lookupId: workspaceUser.blackbaud_lookup_id,
  }).catch(() => null);

  if (exactLookupMatch?.blackbaudConstituentId) {
    addFundraiserCandidate(
      candidates,
      exactLookupMatch.blackbaudConstituentId,
      "workspace-blackbaud-lookup-id",
    );
  }

  const exactEmailMatch = await findBlackbaudConstituentByEmail({
    userId: workspaceUser.id,
    authUserId,
    origin,
    email: workspaceUser.email,
  }).catch(() => null);

  if (exactEmailMatch?.blackbaudConstituentId) {
    addFundraiserCandidate(
      candidates,
      exactEmailMatch.blackbaudConstituentId,
      "email-match",
    );
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

  if (match?.blackbaudConstituentId) {
    addFundraiserCandidate(
      candidates,
      match.blackbaudConstituentId,
      "name-search-match",
    );
  }

  return candidates;
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
    const includeDiagnostics =
      new URL(request.url).searchParams.get("debug") === "1";

    // The v4 cache predates the bounded gift lookup. It remains safe to show
    // for its normal TTL and gives users a responsive portfolio while the
    // next refresh rebuilds the v5 cache.
    const linkedFundraiserId = String(workspaceUser?.blackbaud_constituent_id || "").trim();
    const initialCacheKeys = linkedFundraiserId
      ? [
          `${PORTFOLIO_CACHE_VERSION}:${linkedFundraiserId}`,
          `v4:${linkedFundraiserId}`,
        ]
      : null;
    const initialCachedPortfolio = includeDiagnostics
      ? null
      : await getCachedPortfolio(workspaceUser.id, initialCacheKeys);

    if (initialCachedPortfolio) {
      return Response.json(initialCachedPortfolio);
    }

    const resolutionCandidates = await resolveFundraiserCandidates({
      workspaceUser,
      authUserId,
      origin,
    });

    const resolutionPath =
      resolutionCandidates[0]?.resolutionPath || "not-resolved";
    const fundraiserId = resolutionCandidates[0]?.fundraiserId || null;

    if (!resolutionCandidates.length) {
      return Response.json({
        leadSolicitor: [],
        supportingSolicitor: [],
        warning: "Connect this MGO to a Blackbaud user to view portfolio assignments.",
        diagnostics: includeDiagnostics
          ? {
              workspaceUserId: workspaceUser?.id || null,
              workspaceUserEmail: workspaceUser?.email || null,
              authUserId,
              isActing,
              resolutionPath,
              resolutionCandidates: [],
              fundraiserId: null,
            }
          : undefined,
      });
    }

    const candidateCacheKey =
      resolutionCandidates.map((candidate) => candidate.fundraiserId).filter(Boolean).join("|") ||
      fundraiserId ||
      null;
    const initialCacheKey = candidateCacheKey
      ? `${PORTFOLIO_CACHE_VERSION}:${candidateCacheKey}`
      : null;
    const cachedPortfolio = includeDiagnostics || linkedFundraiserId
      ? null
      : await getCachedPortfolio(workspaceUser.id, initialCacheKey);

    if (cachedPortfolio) {
      return Response.json(cachedPortfolio);
    }

    let assignmentSource = "fundraiser-assignments";
    let fundraiserAssignmentsError = null;
    let assignments = [];
    let selectedFundraiserId = fundraiserId;
    let selectedResolutionPath = resolutionPath;
    const resolutionAttempts = [];

    for (const candidate of resolutionCandidates) {
      let candidateAssignments = [];
      let candidateAssignmentSource = "fundraiser-assignments";
      let candidateError = null;

      try {
        candidateAssignments = await listBlackbaudFundraiserAssignments({
          userId: workspaceUser.id,
          authUserId,
          origin,
          fundraiserId: candidate.fundraiserId,
          searchParams: {
            include_inactive: false,
          },
        });
      } catch (error) {
        candidateError =
          error instanceof Error ? error.message : "Unknown fundraiser assignment error";
      }

      if (!candidateAssignments.length) {
        candidateAssignmentSource = candidateError
          ? "constituent-fallback-after-fundraiser-error"
          : "constituent-fallback";
        candidateAssignments = await listAssignmentsFromConstituentFallback({
          userId: workspaceUser.id,
          authUserId,
          origin,
          workspaceUser,
          fundraiserId: candidate.fundraiserId,
        }).catch(() => []);
      }

      resolutionAttempts.push({
        fundraiserId: candidate.fundraiserId,
        resolutionPath: candidate.resolutionPath,
        assignmentSource: candidateAssignmentSource,
        fundraiserAssignmentsError: candidateError,
        assignmentCount: candidateAssignments.length,
      });

      if (candidateAssignments.length) {
        assignments = candidateAssignments;
        assignmentSource = candidateAssignmentSource;
        fundraiserAssignmentsError = candidateError;
        selectedFundraiserId = candidate.fundraiserId;
        selectedResolutionPath = candidate.resolutionPath;
        break;
      }
    }

    if (
      assignments.length &&
      selectedFundraiserId &&
      String(workspaceUser?.blackbaud_constituent_id || "").trim() !==
        String(selectedFundraiserId).trim()
    ) {
      await sql`
        UPDATE users
        SET
          blackbaud_constituent_id = ${String(selectedFundraiserId)},
          updated_at = NOW()
        WHERE id = ${workspaceUser.id}
      `;
    }

    if (!assignments.length && resolutionAttempts.length > 0) {
      const lastAttempt = resolutionAttempts[resolutionAttempts.length - 1];
      assignmentSource = lastAttempt.assignmentSource;
      fundraiserAssignmentsError = lastAttempt.fundraiserAssignmentsError;
      selectedFundraiserId = lastAttempt.fundraiserId;
      selectedResolutionPath = lastAttempt.resolutionPath;
    }

    const leadAssignments = new Map();
    const supportAssignments = new Map();

    assignments
      .filter(isCurrentAssignment)
      .forEach((assignment) => {
        const constituentId = getAssignmentConstituentId(assignment);
        if (!constituentId) return;

        const type = getAssignmentType(assignment);
        const assignmentBucket = classifyAssignmentType(type);
        const targetMap =
          assignmentBucket === "lead"
            ? leadAssignments
            : assignmentBucket === "support"
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

    // Keep NXT detail calls below the per-user rate limit. Running the two
    // assignment groups concurrently previously produced a large burst of
    // gift lookups, which could cache false "Unavailable" values.
    const leadSolicitor = await enrichConstituents({
      userId: workspaceUser.id,
      authUserId,
      origin,
      groupedAssignments: leadAssignments,
    });
    const supportingSolicitor = await enrichConstituents({
      userId: workspaceUser.id,
      authUserId,
      origin,
      groupedAssignments: supportAssignments,
    });

    const responsePayload = {
      leadSolicitor,
      supportingSolicitor,
      summary: {
        leadCount: leadSolicitor.length,
        supportingCount: supportingSolicitor.length,
      },
      diagnostics: includeDiagnostics
        ? {
            workspaceUserId: workspaceUser?.id || null,
            workspaceUserEmail: workspaceUser?.email || null,
            authUserId,
            isActing,
            resolutionPath: selectedResolutionPath,
            resolutionCandidates: resolutionCandidates.map((candidate) => ({
              fundraiserId: candidate.fundraiserId,
              resolutionPath: candidate.resolutionPath,
            })),
            resolutionAttempts,
            fundraiserId: selectedFundraiserId,
            assignmentSource,
            fundraiserAssignmentsError,
            assignmentCount: assignments.length,
            assignmentTypes: Array.from(
              new Set(assignments.map((assignment) => getAssignmentType(assignment)).filter(Boolean)),
            ),
          }
        : undefined,
    };

    const hasTransientDetailError = [...leadSolicitor, ...supportingSolicitor].some(
      (person) => person?.hasTransientDetailError,
    );

    if (!includeDiagnostics && !hasTransientDetailError) {
      await saveCachedPortfolio(
        workspaceUser.id,
        initialCacheKey,
        responsePayload,
      );
    }

    return Response.json(responsePayload);
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
