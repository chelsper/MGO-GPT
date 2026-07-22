import sql from "@/app/api/utils/sql";
import {
  findBlackbaudConstituentByEmail,
  findBlackbaudConstituentByLookupId,
  getBlackbaudFundraiserById,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";

function addFundraiserCandidate(candidates, fundraiserId) {
  const normalizedId = String(fundraiserId || "").trim();
  if (!normalizedId) return;
  if (candidates.includes(normalizedId)) return;
  candidates.push(normalizedId);
}

async function getUserFundraiserIdentity(userId) {
  if (!userId) return null;

  const rows = await sql`
    SELECT id, name, email, blackbaud_constituent_id, blackbaud_lookup_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function resolveFundraiserCandidates({
  fundraiserUser,
  authUserId,
  origin,
  apiUserId,
}) {
  if (!fundraiserUser) return [];

  const candidates = [];
  const userId = apiUserId || fundraiserUser.id;
  addFundraiserCandidate(candidates, fundraiserUser.blackbaud_constituent_id);

  if (fundraiserUser.blackbaud_lookup_id) {
    const exactLookupMatch = await findBlackbaudConstituentByLookupId({
      userId,
      authUserId,
      origin,
      lookupId: fundraiserUser.blackbaud_lookup_id,
    }).catch(() => null);
    addFundraiserCandidate(candidates, exactLookupMatch?.blackbaudConstituentId);
  }

  if (fundraiserUser.email) {
    const exactEmailMatch = await findBlackbaudConstituentByEmail({
      userId,
      authUserId,
      origin,
      email: fundraiserUser.email,
    }).catch(() => null);
    addFundraiserCandidate(candidates, exactEmailMatch?.blackbaudConstituentId);
  }

  const query = fundraiserUser.name || fundraiserUser.email;
  if (query) {
    const normalizedName = String(fundraiserUser?.name || "").trim().toLowerCase();
    const normalizedEmail = String(fundraiserUser?.email || "").trim().toLowerCase();
    const matches = await searchBlackbaudConstituents({
      userId,
      authUserId,
      origin,
      query,
    }).catch(() => []);

    const exactSearchMatch =
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
    addFundraiserCandidate(candidates, exactSearchMatch?.blackbaudConstituentId);
  }

  return candidates;
}

async function resolveActionFundraiserId({
  currentUser,
  fundraiserUser,
  origin,
  apiUserId,
}) {
  const authUserId = currentUser?.id || apiUserId || fundraiserUser?.id;
  const userId = apiUserId || currentUser?.id || fundraiserUser?.id;
  const candidates = await resolveFundraiserCandidates({
    fundraiserUser,
    authUserId,
    origin,
    apiUserId: userId,
  });

  if (candidates.length === 0 && fundraiserUser?.id) {
    const storedIdentity = await getUserFundraiserIdentity(fundraiserUser.id);
    if (storedIdentity) {
      const storedCandidates = await resolveFundraiserCandidates({
        fundraiserUser: storedIdentity,
        authUserId,
        origin,
        apiUserId: userId,
      });
      for (const candidate of storedCandidates) {
        addFundraiserCandidate(candidates, candidate);
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const fundraiserRecord = await getBlackbaudFundraiserById({
        userId,
        authUserId,
        origin,
        fundraiserId: candidate,
      });
      if (fundraiserRecord?.fundraiserId) {
        return fundraiserRecord.fundraiserId;
      }
    } catch {
      continue;
    }
  }

  return candidates[0] || null;
}

export async function resolveActionFundraiserIds({
  currentUser,
  primaryFundraiserUser,
  additionalFundraiserUserId,
  origin,
  apiUserId,
}) {
  const fundraiserIds = [];
  const primaryUser = primaryFundraiserUser || currentUser;

  const primaryFundraiserId = await resolveActionFundraiserId({
    currentUser,
    fundraiserUser: primaryUser,
    origin,
    apiUserId,
  });
  if (primaryFundraiserId) {
    addFundraiserCandidate(fundraiserIds, primaryFundraiserId);
  }

  const normalizedAdditionalUserId = String(additionalFundraiserUserId || "").trim();
  if (
    normalizedAdditionalUserId &&
    normalizedAdditionalUserId !== String(primaryUser?.id || "")
  ) {
    const additionalUser = await getUserFundraiserIdentity(normalizedAdditionalUserId);
    if (additionalUser) {
      const additionalFundraiserId = await resolveActionFundraiserId({
        currentUser,
        fundraiserUser: additionalUser,
        origin,
        apiUserId,
      });
      if (additionalFundraiserId) {
        addFundraiserCandidate(fundraiserIds, additionalFundraiserId);
      }
    }
  }

  return fundraiserIds;
}
