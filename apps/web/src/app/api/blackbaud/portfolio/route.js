import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  findBlackbaudConstituentByLookupId,
  findBlackbaudConstituentByEmail,
  getBlackbaudConstituentById,
  getBlackbaudConfigIssues,
  listBlackbaudFundraiserAssignments,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";

const PORTFOLIO_CACHE_TTL_MS = 15 * 60 * 1000;
const PORTFOLIO_STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PORTFOLIO_IDENTITY_LOOKUP_BATCH_SIZE = 4;
const PORTFOLIO_IDENTITY_LOOKUP_CONCURRENCY = 2;
const PORTFOLIO_IDENTITY_LOOKUP_RETRY_COOLDOWN_MS = 30 * 1000;
// v12 excludes deceased assignments and lets failed identity lookups yield to
// later portfolio cards instead of retrying the same records indefinitely.
const PORTFOLIO_CACHE_VERSION = "v12";

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

function isAffirmativeBoolean(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  return ["true", "yes", "y", "1", "deceased"].includes(
    String(value).trim().toLowerCase(),
  );
}

function isDeceasedRecord(record) {
  if (!record || typeof record !== "object") return false;

  const deathIndicator =
    record.deceased ??
    record.is_deceased ??
    record.isDeceased ??
    record.deceased_indicator ??
    record.deceasedIndicator ??
    record.is_deceased_indicator;
  if (isAffirmativeBoolean(deathIndicator)) return true;

  return Boolean(
    record.deceased_date ??
      record.deceasedDate ??
      record.deceased_on ??
      record.deceasedOn ??
      record.death_date ??
      record.deathDate ??
      record.death_on ??
      record.deathOn ??
      record.date_of_death ??
      record.dateOfDeath ??
      record.date_deceased ??
      record.dateDeceased,
  );
}

function isDeceasedAssignment(assignment) {
  return (
    isDeceasedRecord(assignment) ||
    isDeceasedRecord(assignment?.constituent) ||
    isDeceasedRecord(assignment?.assigned_constituent) ||
    isDeceasedRecord(assignment?.assignedConstituent) ||
    isDeceasedRecord(assignment?.constituent_details) ||
    isDeceasedRecord(assignment?.constituentDetails) ||
    isDeceasedRecord(assignment?.constituent_info) ||
    isDeceasedRecord(assignment?.constituentInfo) ||
    isDeceasedRecord(assignment?.record)
  );
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

function getAssignmentConstituentDetails(assignment) {
  const constituent =
    assignment?.constituent || assignment?.assigned_constituent || assignment?.assignedConstituent || {};

  return {
    lookupId:
      constituent?.lookup_id ||
      constituent?.lookupId ||
      assignment?.constituent_lookup_id ||
      assignment?.lookup_id ||
      null,
    name:
      constituent?.name ||
      assignment?.constituent_name ||
      assignment?.assigned_constituent_name ||
      null,
  };
}

async function getLocalPortfolioDetails(userId, constituentIds) {
  if (!userId || !constituentIds.length) return new Map();

  const rows = await sql`
    WITH local_portfolio_records AS (
      SELECT
        COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS blackbaud_constituent_id,
        COALESCE(NULLIF(c.name, ''), NULLIF(p.prospect_name, '')) AS name,
        c.email,
        c.phone,
        1 AS source_priority,
        GREATEST(COALESCE(p.updated_at, p.created_at), COALESCE(c.updated_at, c.created_at)) AS updated_at
      FROM prospects p
      LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE
        p.user_id = ${userId}
        AND COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) = ANY(${constituentIds})

      UNION ALL

      SELECT
        c.blackbaud_constituent_id,
        NULLIF(c.name, '') AS name,
        c.email,
        c.phone,
        2 AS source_priority,
        COALESCE(c.updated_at, c.created_at) AS updated_at
      FROM constituents c
      WHERE
        c.user_id = ${userId}
        AND c.blackbaud_constituent_id = ANY(${constituentIds})
    )
    SELECT DISTINCT ON (blackbaud_constituent_id)
      blackbaud_constituent_id,
      name,
      email,
      phone
    FROM local_portfolio_records
    WHERE blackbaud_constituent_id IS NOT NULL
    ORDER BY blackbaud_constituent_id, source_priority ASC, updated_at DESC NULLS LAST
  `;

  return new Map(
    rows.map((row) => [
      String(row.blackbaud_constituent_id),
      {
        name: row.name || null,
        email: row.email || null,
        phone: row.phone || null,
      },
    ]),
  );
}

function parseCachedPayload(payload) {
  if (!payload) return null;
  if (typeof payload === "object") return payload;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function getCachedNxtPortfolioDetails({
  workspaceUserId,
  authUserId,
  constituentIds,
}) {
  if (!workspaceUserId || !authUserId || !constituentIds.length) {
    return new Map();
  }

  const rows = await sql`
    SELECT DISTINCT ON (constituent_id)
      constituent_id,
      payload
    FROM blackbaud_constituent_summary_cache
    WHERE workspace_user_id = ${workspaceUserId}
      AND auth_user_id = ${authUserId}
      AND constituent_id = ANY(${constituentIds})
    ORDER BY constituent_id, updated_at DESC
  `;

  return new Map(
    rows.flatMap((row) => {
      const cachedPayload = parseCachedPayload(row.payload);
      const constituent = cachedPayload?.mapped?.constituent;
      const rawConstituent =
        cachedPayload?.raw?.constituent ?? cachedPayload?.raw ?? null;
      if (!constituent || !row.constituent_id) return [];

      return [
        [
          String(row.constituent_id),
          {
            name: constituent.name || null,
            email: constituent.email || null,
            phone: constituent.phone || null,
            address: constituent.address || null,
            isDeceased:
              isDeceasedRecord(constituent) || isDeceasedRecord(rawConstituent),
          },
        ],
      ];
    }),
  );
}

function enrichConstituents({
  groupedAssignments,
  localDetailsByConstituentId,
  cachedNxtDetailsByConstituentId,
  liveIdentityByConstituentId,
}) {
  return Array.from(groupedAssignments.values())
    .map((entry) => {
      const localDetails = localDetailsByConstituentId.get(String(entry.constituentId)) || {};
      const cachedNxtDetails =
        cachedNxtDetailsByConstituentId.get(String(entry.constituentId)) || {};
      const liveIdentity =
        liveIdentityByConstituentId.get(String(entry.constituentId)) || {};
      const hasCachedNxtContact = Boolean(
        cachedNxtDetails.email || cachedNxtDetails.phone || cachedNxtDetails.address,
      );
      const hasLocalContact = Boolean(localDetails.email || localDetails.phone);
      return {
        constituentId: entry.constituentId,
        lookupId: entry.lookupId || liveIdentity.lookupId || null,
        name:
          cachedNxtDetails.name ||
          localDetails.name ||
          liveIdentity.name ||
          entry.name ||
          `NXT constituent ${entry.constituentId}`,
        email: cachedNxtDetails.email || localDetails.email || null,
        phone: cachedNxtDetails.phone || localDetails.phone || null,
        address: cachedNxtDetails.address || null,
        contactDataSource: hasCachedNxtContact
          ? "nxt-summary-cache"
          : hasLocalContact
            ? "local-workspace-record"
            : "not-loaded",
        lifetimeGiving: {
          totalGiving: null,
          totalReceivedGiving: null,
        },
        assignmentTypes: Array.from(entry.assignmentTypes),
        isDeceased: Boolean(
          entry.isDeceased || cachedNxtDetails.isDeceased || liveIdentity.isDeceased,
        ),
        identityLookupRetryAt:
          liveIdentity.identityLookupRetryAt || entry.identityLookupRetryAt || null,
      };
    })
    .sort((left, right) =>
      String(left?.name || "").localeCompare(String(right?.name || ""), "en"),
    );
}

function hasResolvedConstituentName(name, constituentId) {
  const normalizedName = String(name || "").trim();
  return (
    Boolean(normalizedName) &&
    normalizedName !== `NXT constituent ${String(constituentId || "").trim()}`
  );
}

async function getLivePortfolioIdentities({
  userId,
  authUserId,
  origin,
  entries,
}) {
  const now = Date.now();
  const unresolvedEntries = entries
    .filter(
      (entry) =>
        entry?.constituentId &&
        !hasResolvedConstituentName(entry.name, entry.constituentId) &&
        new Date(entry?.identityLookupRetryAt || 0).getTime() <= now,
    )
    .slice(0, PORTFOLIO_IDENTITY_LOOKUP_BATCH_SIZE);

  const identities = new Map();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < unresolvedEntries.length) {
      const entry = unresolvedEntries[nextIndex];
      nextIndex += 1;
      const identity = await getBlackbaudConstituentById({
        userId,
        authUserId,
        origin,
        constituentId: entry.constituentId,
      }).catch(() => null);

      if (isDeceasedRecord(identity) || isDeceasedRecord(identity?.raw)) {
        identities.set(String(entry.constituentId), {
          isDeceased: true,
        });
      } else if (hasResolvedConstituentName(identity?.name, entry.constituentId)) {
        identities.set(String(entry.constituentId), {
          name: identity.name,
          lookupId: identity.lookupId || null,
          identityLookupRetryAt: null,
        });
      } else {
        // A failed identity lookup should never block all later portfolio cards.
        identities.set(String(entry.constituentId), {
          identityLookupRetryAt: new Date(
            Date.now() + PORTFOLIO_IDENTITY_LOOKUP_RETRY_COOLDOWN_MS,
          ).toISOString(),
        });
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          PORTFOLIO_IDENTITY_LOOKUP_CONCURRENCY,
          unresolvedEntries.length,
        ),
      },
      () => worker(),
    ),
  );

  return identities;
}

function mergePortfolioIdentities(payload, identities) {
  if (!identities.size) return payload;

  const hydrate = (constituents) =>
    Array.isArray(constituents)
      ? constituents.flatMap((constituent) => {
          const identity = identities.get(String(constituent?.constituentId || ""));
          if (!identity) return constituent?.isDeceased ? [] : [constituent];
          if (identity.isDeceased || constituent?.isDeceased) return [];

          return [
            {
              ...constituent,
              name: identity.name || constituent.name,
              lookupId: constituent.lookupId || identity.lookupId || null,
              identityLookupRetryAt:
                identity.identityLookupRetryAt || constituent.identityLookupRetryAt || null,
            },
          ];
        })
      : [];

  const leadSolicitor = hydrate(payload?.leadSolicitor);
  const supportingSolicitor = hydrate(payload?.supportingSolicitor);

  return {
    ...payload,
    leadSolicitor,
    supportingSolicitor,
    summary: {
      ...(payload?.summary || {}),
      leadCount: leadSolicitor.length,
      supportingCount: supportingSolicitor.length,
    },
  };
}

function getPortfolioIdentityHydrationMeta(payload) {
  const allConstituents = [
    ...(Array.isArray(payload?.leadSolicitor) ? payload.leadSolicitor : []),
    ...(Array.isArray(payload?.supportingSolicitor) ? payload.supportingSolicitor : []),
  ];
  const unresolvedConstituents = allConstituents.filter(
    (constituent) =>
      constituent?.constituentId &&
      !hasResolvedConstituentName(constituent.name, constituent.constituentId),
  );
  const now = Date.now();
  const retryTimestamps = unresolvedConstituents
    .map((constituent) => new Date(constituent.identityLookupRetryAt || 0).getTime())
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now);
  const hasEligibleIdentityLookup = unresolvedConstituents.some((constituent) => {
    const retryAt = new Date(constituent.identityLookupRetryAt || 0).getTime();
    return !Number.isFinite(retryAt) || retryAt <= now;
  });
  const nextRetryDelayMs = retryTimestamps.length
    ? Math.max(1000, Math.min(...retryTimestamps) - now)
    : null;

  return {
    identityHydrationPending: unresolvedConstituents.length > 0,
    unresolvedIdentityCount: unresolvedConstituents.length,
    identityHydrationPollIntervalMs:
      unresolvedConstituents.length === 0
        ? null
        : hasEligibleIdentityLookup
          ? 3000
          : Math.min(nextRetryDelayMs || 3000, PORTFOLIO_IDENTITY_LOOKUP_RETRY_COOLDOWN_MS),
  };
}

async function hydrateCachedPortfolioIdentities({
  cachedPortfolio,
  workspaceUserId,
  authUserId,
  origin,
}) {
  const cachedPayload = cachedPortfolio?.payload || {};
  const cachedConstituents = [
    ...(Array.isArray(cachedPayload.leadSolicitor) ? cachedPayload.leadSolicitor : []),
    ...(Array.isArray(cachedPayload.supportingSolicitor)
      ? cachedPayload.supportingSolicitor
      : []),
  ];
  const liveIdentities = await getLivePortfolioIdentities({
    userId: workspaceUserId,
    authUserId,
    origin,
    entries: cachedConstituents,
  });
  const payload = mergePortfolioIdentities(cachedPayload, liveIdentities);

  if (liveIdentities.size > 0) {
    await saveCachedPortfolio(workspaceUserId, cachedPortfolio.cacheKey, payload);
  }

  return {
    ...payload,
    portfolioMeta: {
      ...(payload?.portfolioMeta || {}),
      ...getPortfolioIdentityHydrationMeta(payload),
    },
  };
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
    cacheKey: row.blackbaud_portfolio_cache_key,
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
      ...(cachedPortfolio.payload?.portfolioMeta || {}),
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

    // Returning a cached assignment list is preferable to holding the whole
    // portfolio page hostage to a slow NXT detail request. Do not reuse the
    // older cache versions: they represented missing local contact fields as
    // "no contact data in NXT."
    const linkedFundraiserId = String(workspaceUser?.blackbaud_constituent_id || "").trim();
    const initialCacheKeys = linkedFundraiserId
      ? [`${PORTFOLIO_CACHE_VERSION}:${linkedFundraiserId}`]
      : null;
    const initialCachedPortfolio = includeDiagnostics
      ? null
      : await getCachedPortfolio(workspaceUser.id, initialCacheKeys, { allowStale: true });

    if (initialCachedPortfolio) {
      const hydratedPayload = await hydrateCachedPortfolioIdentities({
        cachedPortfolio: initialCachedPortfolio,
        workspaceUserId: workspaceUser.id,
        authUserId,
        origin,
      });
      const hydratedCachedPortfolio = {
        ...initialCachedPortfolio,
        payload: hydratedPayload,
      };

      if (initialCachedPortfolio.isFresh) {
        return Response.json({
          ...hydratedPayload,
          portfolioMeta: {
            ...(hydratedPayload.portfolioMeta || {}),
            source: "cache",
            cachedAt: initialCachedPortfolio.cachedAt,
          },
        });
      }

      return Response.json(
        buildStaleCacheResponse(hydratedCachedPortfolio, {
          reason: "cached-portfolio-available",
        }),
      );
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

    if (resolvedCachedPortfolio) {
      const hydratedPayload = await hydrateCachedPortfolioIdentities({
        cachedPortfolio: resolvedCachedPortfolio,
        workspaceUserId: workspaceUser.id,
        authUserId,
        origin,
      });
      const hydratedCachedPortfolio = {
        ...resolvedCachedPortfolio,
        payload: hydratedPayload,
      };

      if (resolvedCachedPortfolio.isFresh) {
        return Response.json({
          ...hydratedPayload,
          portfolioMeta: {
            ...(hydratedPayload.portfolioMeta || {}),
            source: "cache",
            cachedAt: resolvedCachedPortfolio.cachedAt,
          },
        });
      }

      return Response.json(
        buildStaleCacheResponse(hydratedCachedPortfolio, {
          reason: "cached-portfolio-available",
        }),
      );
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
      .filter((assignment) => !isDeceasedAssignment(assignment))
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

        const assignmentDetails = getAssignmentConstituentDetails(assignment);
        const existing = targetMap.get(String(constituentId)) || {
          constituentId: String(constituentId),
          lookupId: assignmentDetails.lookupId,
          name: assignmentDetails.name,
          assignmentTypes: new Set(),
        };
        existing.lookupId = existing.lookupId || assignmentDetails.lookupId;
        existing.name = existing.name || assignmentDetails.name;
        existing.assignmentTypes.add(type);
        targetMap.set(String(constituentId), existing);
      });

    for (const constituentId of leadAssignments.keys()) {
      supportAssignments.delete(constituentId);
    }

    const assignedConstituentIds = [
      ...leadAssignments.keys(),
      ...supportAssignments.keys(),
    ];
    // Cache and local enrichment are both optional. Neither may delay the
    // assignment list or trigger a live NXT request per constituent.
    const [localDetailsByConstituentId, cachedNxtDetailsByConstituentId] = await Promise.all([
      getLocalPortfolioDetails(workspaceUser.id, assignedConstituentIds).catch((error) => {
        console.warn("Could not enrich portfolio assignments from local records:", error);
        return new Map();
      }),
      getCachedNxtPortfolioDetails({
        workspaceUserId: workspaceUser.id,
        authUserId,
        constituentIds: assignedConstituentIds,
      }).catch((error) => {
        console.warn("Could not enrich portfolio assignments from cached NXT summaries:", error);
        return new Map();
      }),
    ]);

    const initialLeadSolicitor = enrichConstituents({
      groupedAssignments: leadAssignments,
      localDetailsByConstituentId,
      cachedNxtDetailsByConstituentId,
      liveIdentityByConstituentId: new Map(),
    });
    const initialSupportingSolicitor = enrichConstituents({
      groupedAssignments: supportAssignments,
      localDetailsByConstituentId,
      cachedNxtDetailsByConstituentId,
      liveIdentityByConstituentId: new Map(),
    });
    const liveIdentityByConstituentId = await getLivePortfolioIdentities({
      userId: workspaceUser.id,
      authUserId,
      origin,
      entries: [...initialLeadSolicitor, ...initialSupportingSolicitor],
    });

    // Portfolio assignment data is enough to render cards immediately. Full
    // NXT constituent details remain available through each card's on-demand
    // NXT Summary control instead of blocking the whole page.
    const leadSolicitor = enrichConstituents({
      groupedAssignments: leadAssignments,
      localDetailsByConstituentId,
      cachedNxtDetailsByConstituentId,
      liveIdentityByConstituentId,
    });
    const supportingSolicitor = enrichConstituents({
      groupedAssignments: supportAssignments,
      localDetailsByConstituentId,
      cachedNxtDetailsByConstituentId,
      liveIdentityByConstituentId,
    });

    const allAssignmentCardsBuilt =
      leadSolicitor.length + supportingSolicitor.length ===
      leadAssignments.size + supportAssignments.size;

    const responsePayload = mergePortfolioIdentities({
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
    }, liveIdentityByConstituentId);
    responsePayload.portfolioMeta = getPortfolioIdentityHydrationMeta(responsePayload);

    if (
      !includeDiagnostics &&
      staleCachedPortfolio &&
      !allAssignmentCardsBuilt
    ) {
      return Response.json(
        buildStaleCacheResponse(staleCachedPortfolio, {
          reason: "assignment-details-unavailable",
        }),
      );
    }

    // Cache a complete base portfolio even if optional gift data is delayed.
    // This avoids repeatedly rebuilding every constituent card on each visit.
    if (!includeDiagnostics && allAssignmentCardsBuilt) {
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
