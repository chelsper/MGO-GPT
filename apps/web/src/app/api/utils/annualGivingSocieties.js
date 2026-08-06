const EXCLUDED_ANNUAL_GIVING_FUNDS = new Set(["credit card processing fee"]);

const RECEIVED_REVENUE_GIFT_TYPE_TOKENS = new Set([
  "cash",
  "donation",
  "matchinggiftpayment",
  "matchinggiftpaycash",
  "other",
  "paycash",
  "pledgepayment",
  "pledgepaycash",
  "recurringgiftpayment",
  "recurringgiftpaycash",
  "soldstock",
  "stock",
]);

const EXCLUDED_GIFT_TYPE_TOKENS = new Set([
  "adjustment",
  "eventregistrationfee",
  "eventregistrationfees",
  "giftinkind",
  "matchinggiftpledge",
  "plannedgift",
  "pledge",
  "recurringgift",
  "writeoff",
]);

export const ANNUAL_GIVING_SOCIETY_TIERS = [
  {
    key: "presidents_society",
    label: "President's Society",
    minimum: 10000,
    maximum: null,
    hierarchy: 1,
  },
  {
    key: "order_of_the_dolphin",
    label: "Order of the Dolphin",
    minimum: 1000,
    maximum: 9999.99,
    hierarchy: 2,
  },
];

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
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeGiftToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toFiniteAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
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

function getGiftTypeToken(gift) {
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
    if (label && !fundNames.some((existing) => normalizeText(existing) === normalizeText(label))) {
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
      if (label && !fundNames.some((existing) => normalizeText(existing) === normalizeText(label))) {
        fundNames.push(label);
      }
    }
  }

  return fundNames;
}

function isExcludedGiftFund(gift) {
  return getGiftFundNames(gift).some((fundName) =>
    EXCLUDED_ANNUAL_GIVING_FUNDS.has(normalizeText(fundName)),
  );
}

function isReceivedRevenueGift(gift) {
  const giftType = getGiftTypeToken(gift);
  if (!giftType) return false;
  if (EXCLUDED_GIFT_TYPE_TOKENS.has(giftType)) return false;
  if (!RECEIVED_REVENUE_GIFT_TYPE_TOKENS.has(giftType)) return false;
  if (isExcludedGiftFund(gift)) return false;

  const amount = toFiniteAmount(getGiftAmount(gift));
  return amount != null && amount > 0;
}

function getGiftConstituentId(gift) {
  return firstDefined(gift, [
    "constituent_id",
    "constituentId",
    "constituent.id",
    "donor_id",
    "donorId",
    "donor.id",
  ]);
}

function getRecognitionCreditRows(gift) {
  const rows = [];
  const arrayPaths = [
    "soft_credits",
    "softCredits",
    "recognition_credits",
    "recognitionCredits",
    "recognitions",
  ];

  for (const path of arrayPaths) {
    const value = getNestedValue(gift, path);
    if (Array.isArray(value)) {
      rows.push(...value);
    }
  }

  return rows;
}

function getRecognitionCreditConstituentId(credit) {
  return firstDefined(credit, [
    "constituent_id",
    "constituentId",
    "constituent.id",
    "recipient_id",
    "recipientId",
    "recipient.id",
    "recognizee_id",
    "recognizeeId",
    "recognizee.id",
  ]);
}

function getRecognitionCreditAmount(credit) {
  return firstDefined(credit, [
    "amount.value",
    "amount",
    "credit_amount.value",
    "creditAmount.value",
    "soft_credit_amount.value",
    "softCreditAmount.value",
    "value",
  ]);
}

function constituentIdsMatch(left, right) {
  return String(left || "").trim() && String(left || "").trim() === String(right || "").trim();
}

function resolveSocieties(total) {
  return ANNUAL_GIVING_SOCIETY_TIERS
    .filter((tier) => {
      if (total < tier.minimum) return false;
      if (tier.maximum == null) return true;
      return total <= tier.maximum;
    })
    .sort((left, right) => left.hierarchy - right.hierarchy)
    .map((tier) => ({
      key: tier.key,
      label: tier.label,
      minimum: tier.minimum,
      maximum: tier.maximum,
      hierarchy: tier.hierarchy,
    }));
}

export function calculateAnnualGivingSocieties({
  constituentId,
  gifts = [],
  now = new Date(),
} = {}) {
  const year = now.getUTCFullYear();
  const startDate = `${year}-01-01`;
  const endDate = formatDateOnly(now);
  const startTime = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${endDate}T23:59:59.999Z`).getTime();

  let receivedRevenueTotal = 0;
  let recognitionCreditTotal = 0;
  let receivedRevenueGiftCount = 0;
  let recognitionCreditGiftCount = 0;
  const countedGiftIds = new Set();

  for (const gift of gifts) {
    if (!isReceivedRevenueGift(gift)) continue;

    const giftDate = getGiftDate(gift);
    const giftTime = giftDate ? new Date(giftDate).getTime() : Number.NaN;
    if (!Number.isFinite(giftTime) || giftTime < startTime || giftTime > endTime) {
      continue;
    }

    const recognitionCredits = getRecognitionCreditRows(gift).filter((credit) =>
      constituentIdsMatch(getRecognitionCreditConstituentId(credit), constituentId),
    );
    const directConstituentId = getGiftConstituentId(gift);
    const directMatches = directConstituentId
      ? constituentIdsMatch(directConstituentId, constituentId)
      : recognitionCredits.length === 0;

    if (directMatches) {
      const amount = toFiniteAmount(getGiftAmount(gift));
      if (amount != null && amount > 0) {
        receivedRevenueTotal += amount;
        receivedRevenueGiftCount += 1;
        if (gift?.id) countedGiftIds.add(String(gift.id));
      }
    }

    let recognitionAmountForGift = 0;
    for (const credit of recognitionCredits) {
      const amount = toFiniteAmount(getRecognitionCreditAmount(credit));
      if (amount != null && amount > 0) {
        recognitionAmountForGift += amount;
      }
    }

    if (recognitionAmountForGift > 0) {
      recognitionCreditTotal += recognitionAmountForGift;
      recognitionCreditGiftCount += 1;
      if (gift?.id) countedGiftIds.add(String(gift.id));
    }
  }

  const combinedAnnualGiving = Number(
    (receivedRevenueTotal + recognitionCreditTotal).toFixed(2),
  );
  const societies = resolveSocieties(combinedAnnualGiving);

  return {
    year,
    yearBasis: "calendar",
    startDate,
    endDate,
    receivedRevenueTotal: Number(receivedRevenueTotal.toFixed(2)),
    recognitionCreditTotal: Number(recognitionCreditTotal.toFixed(2)),
    combinedAnnualGiving,
    qualifyingGiftCount: countedGiftIds.size || receivedRevenueGiftCount + recognitionCreditGiftCount,
    receivedRevenueGiftCount,
    recognitionCreditGiftCount,
    primarySociety: societies[0] || null,
    societies,
    calculatedAt: now.toISOString(),
  };
}

export async function fetchAnnualGivingSocieties({
  listGifts,
  userId,
  authUserId,
  origin,
  constituentId,
  now = new Date(),
} = {}) {
  if (!listGifts) {
    throw new Error("A Blackbaud gift list function is required");
  }
  if (!constituentId) {
    throw new Error("A Blackbaud constituent ID is required");
  }

  const year = now.getUTCFullYear();
  const gifts = await listGifts({
    userId,
    authUserId,
    origin,
    searchParams: {
      constituent_id: String(constituentId),
      start_gift_date: `${year}-01-01`,
      end_gift_date: formatDateOnly(now),
    },
    pageLimit: 500,
    maxPages: 20,
  });

  return calculateAnnualGivingSocieties({
    constituentId,
    gifts,
    now,
  });
}
