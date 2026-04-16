import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  findBlackbaudConstituentByEmail,
  findBlackbaudConstituentByLookupId,
  listBlackbaudGifts,
  searchBlackbaudConstituents,
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

function normalizeGiftToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const CLOSED_FY_GIFT_TYPES = new Set(
  [
    "Donation",
    "Stock",
    "SoldStock",
    "Other",
    "RecurringGiftPayment",
    "PlannedGift",
    "Pledge",
    "GiftInKind",
    "MatchingGiftPledge",
  ].map(normalizeGiftToken),
);

function getGiftAmount(gift) {
  return firstDefined(gift, [
    "amount.value",
    "gift_amount.value",
    "giftAmount.value",
    "amount",
    "gift_amount",
    "giftAmount",
    "payments.0.amount.value",
  ]);
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

function getGiftType(gift) {
  return normalizeGiftToken(
    firstDefined(gift, [
      "gift_type",
      "giftType",
      "type",
      "type_name",
      "category",
    ]) || "",
  );
}

function getGiftFundraisers(gift) {
  const candidates = [];

  const arrayPaths = [
    "fundraisers",
    "solicitors",
    "gift_fundraisers",
    "giftFundraisers",
    "gift_fundraiser",
    "giftFundraiser",
    "gift_fundraiser_names",
    "giftFundraiserNames",
    "fundraiser_credits",
    "fundraiserCredits",
    "solicitor_credits",
    "solicitorCredits",
  ];

  for (const path of arrayPaths) {
    const value = getNestedValue(gift, path);
    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  }

  const singlePaths = [
    "fundraiser",
    "solicitor",
    "gift_fundraiser",
    "giftFundraiser",
    "gift_fundraiser_name",
    "giftFundraiserName",
    "gift_fundraiser.full_name",
    "giftFundraiser.fullName",
  ];

  for (const path of singlePaths) {
    const value = getNestedValue(gift, path);
    if (typeof value === "string" && value.trim()) {
      candidates.push({ fundraiser_name: value.trim() });
    } else if (value && typeof value === "object") {
      candidates.push(value);
    }
  }

  return candidates.filter(Boolean);
}

function normalizePersonName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function getGiftFundraiserName(fundraiser) {
  const direct = String(
    firstDefined(fundraiser, [
      "fundraiser_name",
      "fundraiserName",
      "name",
      "full_name",
      "fullName",
      "display_name",
      "displayName",
    ]) || "",
  ).trim();

  if (direct) {
    return direct;
  }

  const first = String(
    firstDefined(fundraiser, ["first_name", "firstName", "first"]) || "",
  ).trim();
  const middle = String(
    firstDefined(fundraiser, ["middle_name", "middleName", "middle"]) || "",
  ).trim();
  const last = String(
    firstDefined(fundraiser, ["last_name", "lastName", "last"]) || "",
  ).trim();

  return [first, middle, last].filter(Boolean).join(" ").trim();
}

function isWorkspaceFundraiserMatch(fundraiser, workspaceUser, fundraiserIdentitySet) {
  const fundraiserId = String(
    fundraiser?.constituent_id || fundraiser?.fundraiser_id || fundraiser?.id || "",
  ).trim();
  if (fundraiserId && fundraiserIdentitySet.has(fundraiserId)) {
    return true;
  }

  const workspaceTokens = normalizePersonName(
    workspaceUser?.name || workspaceUser?.full_name || workspaceUser?.display_name,
  );
  const fundraiserTokens = normalizePersonName(getGiftFundraiserName(fundraiser));

  if (workspaceTokens.length < 2 || fundraiserTokens.length < 2) {
    return false;
  }

  const workspaceFirst = workspaceTokens[0];
  const workspaceLast = workspaceTokens[workspaceTokens.length - 1];
  const fundraiserFirst = fundraiserTokens[0];
  const fundraiserLast = fundraiserTokens[fundraiserTokens.length - 1];

  if (workspaceFirst === fundraiserFirst && workspaceLast === fundraiserLast) {
    return true;
  }

  const workspaceFull = workspaceTokens.join(" ");
  const fundraiserFull = fundraiserTokens.join(" ");

  return (
    fundraiserFull.includes(workspaceFull) ||
    workspaceFull.includes(fundraiserFull) ||
    fundraiserLast === workspaceLast
  );
}

function addFundraiserCandidate(candidates, fundraiserId) {
  const normalizedId = String(fundraiserId || "").trim();
  if (!normalizedId || candidates.has(normalizedId)) {
    return;
  }
  candidates.add(normalizedId);
}

async function resolveWorkspaceFundraiserIdentitySet({ user, authUserId, origin }) {
  const candidates = new Set();

  addFundraiserCandidate(candidates, user?.blackbaud_constituent_id);
  addFundraiserCandidate(candidates, user?.blackbaud_lookup_id);

  if (user?.blackbaud_lookup_id) {
    const lookupMatch = await findBlackbaudConstituentByLookupId({
      userId: user.id,
      authUserId,
      origin,
      lookupId: user.blackbaud_lookup_id,
    }).catch(() => null);

    if (lookupMatch?.blackbaudConstituentId) {
      addFundraiserCandidate(candidates, lookupMatch.blackbaudConstituentId);
    }
  }

  if (user?.email) {
    const emailMatch = await findBlackbaudConstituentByEmail({
      userId: user.id,
      authUserId,
      origin,
      email: user.email,
    }).catch(() => null);

    if (emailMatch?.blackbaudConstituentId) {
      addFundraiserCandidate(candidates, emailMatch.blackbaudConstituentId);
    }
  }

  const matches = await searchBlackbaudConstituents({
    userId: user.id,
    authUserId,
    origin,
    query: user?.name || user?.email,
  }).catch(() => []);

  const normalizedName = String(user?.name || "").trim().toLowerCase();
  const normalizedEmail = String(user?.email || "").trim().toLowerCase();

  for (const match of matches) {
    const matchName = String(match?.name || "").trim().toLowerCase();
    const matchEmail = String(match?.email || "").trim().toLowerCase();
    const exactName = normalizedName && matchName === normalizedName;
    const exactEmail = normalizedEmail && matchEmail === normalizedEmail;
    if (exactName || exactEmail) {
      addFundraiserCandidate(
        candidates,
        match?.blackbaudConstituentId || match?.id || null,
      );
    }
  }

  return candidates;
}

async function getLiveBlackbaudClosedThisFY({
  user,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
  debug = false,
}) {
  const fundraiserIdentitySet = await resolveWorkspaceFundraiserIdentitySet({
    user,
    authUserId,
    origin,
  });

  const gifts = await listBlackbaudGifts({
    userId: user.id,
    authUserId,
    origin,
    searchParams: {
      limit: 500,
    },
  }).catch(() => []);

  const fiscalStart = new Date(`${fiscalYearStart}T00:00:00Z`).getTime();
  const fiscalEnd = new Date(`${fiscalYearEnd}T23:59:59Z`).getTime();
  const workspaceFundraiserName =
    user?.name || user?.full_name || user?.display_name || null;

  let closedTotal = 0;
  const debugRows = [];

  for (const gift of gifts) {
    const giftType = getGiftType(gift);
    const typeAllowed = CLOSED_FY_GIFT_TYPES.has(giftType);
    const fundraisers = getGiftFundraisers(gift);
    const matchingFundraisers = fundraisers.filter((fundraiser) =>
      isWorkspaceFundraiserMatch(fundraiser, user, fundraiserIdentitySet),
    );
    const hasSolicitorCredit = matchingFundraisers.length > 0;
    const giftDate = getGiftDate(gift);
    const giftTimestamp = giftDate ? new Date(giftDate).getTime() : Number.NaN;
    const inFiscalYear =
      !Number.isNaN(giftTimestamp) &&
      giftTimestamp >= fiscalStart &&
      giftTimestamp <= fiscalEnd;
    const giftAmount = Number(getGiftAmount(gift) ?? 0);
    const included =
      typeAllowed && hasSolicitorCredit && inFiscalYear && giftAmount > 0;

    if (included) {
      closedTotal += giftAmount;
    }

    if (debug && debugRows.length < 50) {
      debugRows.push({
        id: gift?.id || null,
        date: giftDate || null,
        amount: giftAmount || 0,
        giftType: giftType || null,
        fundraisers: fundraisers.map((fundraiser) => ({
          id:
            fundraiser?.constituent_id ||
            fundraiser?.fundraiser_id ||
            fundraiser?.id ||
            null,
          name: getGiftFundraiserName(fundraiser) || null,
          raw: fundraiser,
        })),
        matchingFundraisers: matchingFundraisers.map((fundraiser) => ({
          id:
            fundraiser?.constituent_id ||
            fundraiser?.fundraiser_id ||
            fundraiser?.id ||
            null,
          name: getGiftFundraiserName(fundraiser) || null,
        })),
        included,
        exclusionReason: included
          ? null
          : !typeAllowed
            ? "gift_type_not_allowed"
            : !hasSolicitorCredit
              ? "no_matching_fundraiser"
              : !inFiscalYear
                ? "outside_fiscal_year"
                : giftAmount <= 0
                  ? "no_amount"
                  : "excluded",
      });
    }
  }

  if (debug) {
    return {
      closedTotal,
      debug: {
        workspaceFundraiserName,
        workspaceFundraiserIdentitySet: Array.from(fundraiserIdentitySet),
        totalGiftRowsFetched: gifts.length,
        countedGiftRows: debugRows.filter((row) => row.included).length,
        sampledGifts: debugRows,
      },
    };
  }

  return closedTotal;
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
    const debug = request?.url
      ? new URL(request.url).searchParams.get("debug") === "1"
      : false;

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

    let closedThisFY = 0;
    let closedDebug = null;

    if (origin) {
      const closedPayload = await getLiveBlackbaudClosedThisFY({
        user,
        authUserId,
        origin,
        fiscalYearStart,
        fiscalYearEnd,
        debug,
      }).catch(() => (debug ? { closedTotal: 0, debug: null } : 0));

      if (debug) {
        closedThisFY = Number(closedPayload?.closedTotal || 0);
        closedDebug = closedPayload?.debug || null;
      } else {
        closedThisFY = Number(closedPayload || 0);
      }
    }

    return Response.json({
      activeCount: parseInt(activeResult[0].active_count) || 0,
      totalAskPipeline: parseFloat(activeResult[0].total_pipeline) || 0,
      closedThisFY,
      currentFY,
      ...(debug ? { closedDebug } : {}),
    });
  } catch (error) {
    console.error("Error fetching prospect summary:", error);
    return Response.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
