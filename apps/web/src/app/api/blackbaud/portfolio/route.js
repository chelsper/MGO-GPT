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
  listBlackbaudFundraiserAssignments,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";

const PORTFOLIO_CACHE_TTL_MS = 15 * 60 * 1000;
const PORTFOLIO_STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PORTFOLIO_CACHE_VERSION = "v6";
// Each constituent currently needs a constituent and lifetime-giving read.
// Four concurrent constituents keeps the request burst under NXT's rate limits.
const PORTFOLIO_DETAIL_CONCURRENCY = 4;

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
          hasTransientDetailError: details.hasTransientDetailError,
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

function getCacheAgeMs(timestamp) {
  if (!timestamp) return false;
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) return null;
  return Date.now() - parsed;
}

function isFreshCache(timestamp) {
  const ageMs = getCacheAgeMs(timestamp);
  return typeof ageMs === "number" && ageMs < PORTFOLIO_CACHE_TTL_MS;
}

function isUsableStaleCache(timestamp) {
  const ageMs = getCacheAgeMs(timestamp);
  return typeof ageMs === "number" && ageMs < PORTFOLIO_STALE_CACHE_TTL_MS;
}

async function getCachedPortfolio(workspaceUserId, cacheKey, { allowStale = false } = {}) {
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
  const isFresh = isFreshCache(row.blackbaud_portfolio_cached_at);
  if (!isFresh && (!allowStale || !isUsableStaleCache(row.blackbaud_portfolio_cached_at))) {
    return null;
  }

  return {
    payload: row.blackbaud_portfolio_cache,
    cachedAt: row.blackbaud_portfolio_cached_at,
    isFresh,
  };
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

function buildStaleCacheResponse(cachedPortfolio, { reason, diagnostics } = {}) {
  return {
    ...cachedPortfolio.payload,
    portfolioMeta: {
      source: "stale-cache",
      cachedAt: cachedPortfolio.cachedAt,
      reason,
    },
    diagnostics,
  };
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

    // v4 and v5 payloads are safe short-term fallbacks while the next refresh
    // rebuilds the smaller v6 portfolio without per-constituent gift history.
    const linkedFundraiserId = String(workspaceUser?.blackbaud_constituent_id || "").trim();
    const initialCacheKeys = linkedFundraiserId
      ? [
          `${PORTFOLIO_CACHE_VERSION}:${linkedFundraiserId}`,
          `v5:${linkedFundraiserId}`,
          `v4:${linkedFundraiserId}`,
        ]
      : null;
    const initialCachedPortfolio = includeDiagnostics
      ? null
      : await getCachedPortfolio(workspaceUser.id, initialCacheKeys, { allowStale: true });

    if (initialCachedPortfolio?.isFresh) {
      return Response.json(initialCachedPortfolio.payload);
    }
    let staleCachedPortfolio = initialCachedPortfolio || null;

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
    const resolvedCachedPortfolio = includeDiagnostics || linkedFundraiserId
      ? null
      : await getCachedPortfolio(workspaceUser.id, initialCacheKey, { allowStale: true });

    if (resolvedCachedPortfolio?.isFresh) {
      return Response.json(resolvedCachedPortfolio.payload);
    }
    if (!staleCachedPortfolio && resolvedCachedPortfolio) {
      staleCachedPortfolio = resolvedCachedPortfolio;
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

    const assignmentLookupFailed = resolutionAttempts.some(
      (attempt) => Boolean(attempt.fundraiserAssignmentsError),
    );

    if (!includeDiagnostics && !assignments.length && assignmentLookupFailed && staleCachedPortfolio) {
      return Response.json(
        buildStaleCacheResponse(staleCachedPortfolio, {
          reason: "fundraiser-assignments-unavailable",
        }),
      );
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
    const expectedConstituentCount = leadAssignments.size + supportAssignments.size;
    const loadedConstituentCount = leadSolicitor.length + supportingSolicitor.length;
    const allAssignedConstituentsLoaded =
      loadedConstituentCount === expectedConstituentCount;

    if (
      !includeDiagnostics &&
      staleCachedPortfolio &&
      (!allAssignedConstituentsLoaded || hasTransientDetailError)
    ) {
      return Response.json(
        buildStaleCacheResponse(staleCachedPortfolio, {
          reason: allAssignedConstituentsLoaded
            ? "optional-portfolio-details-unavailable"
            : "constituent-details-unavailable",
        }),
      );
    }

    // Cache a complete base portfolio even if optional gift data is delayed.
    // This avoids repeatedly rebuilding every constituent card on each visit.
    if (!includeDiagnostics && allAssignedConstituentsLoaded) {
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
