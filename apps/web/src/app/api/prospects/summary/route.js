import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  findBlackbaudConstituentByEmail,
  findBlackbaudConstituentByLookupId,
  listBlackbaudGifts,
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

const CLOSED_FY_GIFT_TYPES = new Set(
  [
    "one-time gift",
    "stock",
    "sold stock",
    "gift-in-kind",
    "other",
    "matching gift pledge",
    "pledge",
    "planned gift",
    "recurring gift payment",
  ].map((value) => value.toLowerCase()),
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
  return String(
    firstDefined(gift, [
      "gift_type",
      "giftType",
      "type",
      "type_name",
      "category",
    ]) || "",
  )
    .trim()
    .toLowerCase();
}

function getGiftFundraisers(gift) {
  return Array.isArray(gift?.fundraisers)
    ? gift.fundraisers
    : Array.isArray(gift?.solicitors)
      ? gift.solicitors
      : [];
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

  return gifts.reduce((sum, gift) => {
    if (!CLOSED_FY_GIFT_TYPES.has(getGiftType(gift))) {
      return sum;
    }

    const fundraisers = getGiftFundraisers(gift);
    const hasSolicitorCredit = fundraisers.some(
      (fundraiser) =>
        String(
          fundraiser?.constituent_id ||
            fundraiser?.fundraiser_id ||
            fundraiser?.id ||
            "",
        ) === fundraiserConstituentId,
    );

    if (!hasSolicitorCredit) return sum;

    const giftDate = getGiftDate(gift);
    if (!giftDate) return sum;

    const giftTimestamp = new Date(giftDate).getTime();
    if (Number.isNaN(giftTimestamp)) return sum;
    if (giftTimestamp < fiscalStart || giftTimestamp > fiscalEnd) return sum;

    const giftAmount = Number(getGiftAmount(gift) ?? 0);
    if (giftAmount > 0) {
      return sum + giftAmount;
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

    let closedThisFY = 0;

    if ((user.blackbaud_constituent_id || user.blackbaud_lookup_id) && origin) {
      closedThisFY = await getLiveBlackbaudClosedThisFY({
        user,
        authUserId,
        origin,
        fiscalYearStart,
        fiscalYearEnd,
      }).catch(() => 0);
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
