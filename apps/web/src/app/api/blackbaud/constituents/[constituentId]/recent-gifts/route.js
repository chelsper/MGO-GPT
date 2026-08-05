import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { listBlackbaudGifts } from "@/app/api/utils/blackbaud";

const EXCLUDED_GIFT_FUNDS = new Set(["credit card processing fee"]);

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

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
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

function getGiftAmount(gift) {
  return firstDefined(gift, [
    "amount.value",
    "amount",
    "gift_amount.value",
    "gift_amount",
    "giftAmount.value",
    "giftAmount",
    "payments.0.amount.value",
    "payments.0.amount",
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
    const label = getTextFromMaybeObject(getNestedValue(gift, path));
    if (
      label &&
      !fundNames.some((existing) => normalizeText(existing) === normalizeText(label))
    ) {
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
      if (
        label &&
        !fundNames.some((existing) => normalizeText(existing) === normalizeText(label))
      ) {
        fundNames.push(label);
      }
    }
  }

  return fundNames;
}

function mapGift(gift) {
  const id = firstDefined(gift, ["id", "gift_id", "giftId"]);
  if (!id) return null;

  const fundNames = getGiftFundNames(gift);
  const amount = Number(getGiftAmount(gift));

  return {
    id: String(id),
    date: getGiftDate(gift) || null,
    amount: Number.isFinite(amount) ? amount : null,
    type: getGiftTypeLabel(gift),
    fund: fundNames[0] || null,
    funds: fundNames,
  };
}

function isExcludedGift(gift) {
  return getGiftFundNames(gift).some((fundName) =>
    EXCLUDED_GIFT_FUNDS.has(normalizeText(fundName)),
  );
}

export async function GET(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(
      session,
      request,
    );
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const blackbaudConstituentId = String(params.constituentId || "").trim();
    if (!blackbaudConstituentId) {
      return Response.json(
        { error: "Blackbaud constituent ID is required" },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 5), 1), 10);
    const origin = url.origin;
    const gifts = await listBlackbaudGifts({
      userId: user.id,
      authUserId: isActing ? sessionUser?.id || user.id : user.id,
      origin,
      searchParams: {
        constituent_id: blackbaudConstituentId,
      },
      pageLimit: 100,
      maxPages: 2,
    });

    const recentGifts = gifts
      .filter((gift) => getGiftDate(gift))
      .filter((gift) => !isExcludedGift(gift))
      .map(mapGift)
      .filter(Boolean)
      .sort((left, right) => {
        const rightDate = new Date(right.date).getTime();
        const leftDate = new Date(left.date).getTime();
        return (
          (Number.isFinite(rightDate) ? rightDate : 0) -
          (Number.isFinite(leftDate) ? leftDate : 0)
        );
      })
      .slice(0, limit);

    return Response.json({ gifts: recentGifts });
  } catch (error) {
    console.error("Error fetching recent Blackbaud gifts:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to fetch recent gifts",
      },
      { status: 500 },
    );
  }
}
