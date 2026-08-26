import { listBlackbaudGifts } from "@/app/api/utils/blackbaud";

// This metric is fundraiser-credit based. It intentionally has no fiscal-year
// window and trusts explicit solicitor credit on each eligible gift record.
const LIFETIME_GIFT_TYPE_FILTERS = [
  "Donation",
  "GiftInKind",
  "MatchingGiftPayment",
  "MatchingGiftPledge",
  "Other",
  "Pledge",
  "PledgePayment",
  // This type is already returned by the deployed NXT integration. The
  // realized-revenue label is handled from the returned record rather than
  // used as an unverified list-filter value.
  "PlannedGift",
  "RecurringGift",
  "RecurringGiftPayment",
  "SoldStock",
  "Stock",
];

const ELIGIBLE_GIFT_TYPES = new Set(
  [
    "cash",
    "donation",
    "giftinkind",
    "matchinggiftpayment",
    "matchinggiftpaycash",
    "matchinggiftpledge",
    "mgpaycash",
    "other",
    "paycash",
    "plannedgift",
    "plannedgiving",
    "pledge",
    "pledgepayment",
    "pledgepaycash",
    "realizedplannedgiftrevenue",
    "recurringgift",
    "recurringgiftpayment",
    "recurringgiftpaycash",
    "soldstock",
    "stock",
    "stockproperty",
  ].map((value) => normalizeToken(value)),
);

const FULFILLMENT_PAYMENT_GIFT_TYPES = new Set([
  "pledgepayment",
  "pledgepaycash",
  "matchinggiftpayment",
  "matchinggiftpaycash",
  "mgpaycash",
  "recurringgiftpayment",
  "recurringgiftpaycash",
]);

function getNestedValue(source, path) {
  return path.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function firstDefined(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function getTextFromMaybeObject(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    return getTextFromMaybeObject(
      firstDefined(value, ["description", "name", "value", "label", "id"]),
    );
  }
  return "";
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toAmount(value) {
  const normalizedValue =
    typeof value === "string" ? value.replace(/[$,]/g, "").trim() : value;
  const amount = Number(normalizedValue);
  return Number.isFinite(amount) ? amount : null;
}

function getGiftId(gift) {
  return String(
    firstDefined(gift, ["id", "gift_id", "giftId", "gift.id", "gift.gift_id"]) || "",
  ).trim();
}

function getGiftType(gift) {
  return normalizeToken(
    getTextFromMaybeObject(
      firstDefined(gift, ["gift_type", "giftType", "type", "type_name", "category"]),
    ),
  );
}

function getGiftAmount(gift) {
  return toAmount(
    firstDefined(gift, [
      "amount.value",
      "amount",
      "gift_amount.value",
      "gift_amount",
      "giftAmount.value",
      "giftAmount",
      "payments.0.amount.value",
      "payments.0.amount",
    ]),
  );
}

function normalizeAliasIds(value) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  const ids = new Set();

  for (const rawValue of rawValues) {
    const id = String(rawValue || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function getWorkspaceFundraiserIds(workspaceUser) {
  const ids = new Set();
  for (const value of [
    workspaceUser?.blackbaud_constituent_id,
    workspaceUser?.blackbaudConstituentId,
    workspaceUser?.blackbaud_lookup_id,
    workspaceUser?.blackbaudLookupId,
  ]) {
    const id = String(value || "").trim();
    if (id) ids.add(id);
  }

  for (const aliasId of normalizeAliasIds(
    workspaceUser?.blackbaud_fundraiser_alias_ids ??
      workspaceUser?.blackbaudFundraiserAliasIds,
  )) {
    ids.add(aliasId);
  }
  return ids;
}

function getFundraiserCandidates(gift) {
  const candidates = [];
  const paths = [
    "fundraisers",
    "solicitors",
    "gift_fundraisers",
    "giftFundraisers",
    "fundraiser_credits",
    "fundraiserCredits",
    "solicitor_credits",
    "solicitorCredits",
    "fundraiser",
    "solicitor",
    "gift_fundraiser",
    "giftFundraiser",
  ];

  for (const path of paths) {
    const value = getNestedValue(gift, path);
    if (Array.isArray(value)) {
      candidates.push(...value.filter(Boolean));
    } else if (value && typeof value === "object") {
      candidates.push(value);
    }
  }
  return candidates;
}

function getFundraiserId(fundraiser) {
  return String(
    firstDefined(fundraiser, [
      "fundraiser_id",
      "fundraiserId",
      "solicitor_id",
      "solicitorId",
      "constituent_id",
      "constituentId",
      "id",
    ]) || "",
  ).trim();
}

function hasExplicitFundraiserCredit(gift, fundraiserIds) {
  return getFundraiserCandidates(gift).some((fundraiser) => {
    const fundraiserId = getFundraiserId(fundraiser);
    return fundraiserId && fundraiserIds.has(fundraiserId);
  });
}

function isTruthyFlag(value) {
  return value === true || ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function isStructuredReversal(gift) {
  const booleanPaths = [
    "is_refund",
    "isRefund",
    "is_returned",
    "isReturned",
    "is_reversed",
    "isReversed",
    "is_void",
    "isVoid",
  ];
  if (booleanPaths.some((path) => isTruthyFlag(getNestedValue(gift, path)))) return true;

  const status = normalizeToken(
    getTextFromMaybeObject(
      firstDefined(gift, ["status", "gift_status", "giftStatus", "transaction_status"]),
    ),
  );
  return ["refunded", "returned", "reversed", "void", "voided"].includes(status);
}

function getPledgeWriteOffAmount(gift) {
  const directAmount = toAmount(
    firstDefined(gift, [
      "write_off_amount.value",
      "write_off_amount",
      "writeOffAmount.value",
      "writeOffAmount",
      "writeoff_amount.value",
      "writeoff_amount",
      "writeoffAmount.value",
      "writeoffAmount",
    ]),
  );
  if (directAmount !== null) return Math.max(0, directAmount);

  for (const path of ["write_offs", "writeOffs", "writeoffs"]) {
    const rows = getNestedValue(gift, path);
    if (!Array.isArray(rows)) continue;
    return rows.reduce((total, row) => {
      const amount = toAmount(
        firstDefined(row, ["amount.value", "amount", "write_off_amount.value", "value"]),
      );
      return total + Math.max(0, amount || 0);
    }, 0);
  }
  return 0;
}

function getRelationshipId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value !== "object") return "";
  return String(
    firstDefined(value, [
      "gift_id",
      "giftId",
      "parent_gift_id",
      "parentGiftId",
      "linked_gift_id",
      "linkedGiftId",
      "commitment_id",
      "commitmentId",
      "id",
      "gift.id",
      "gift.gift_id",
    ]) || "",
  ).trim();
}

function getPaymentParentIds(gift) {
  const parentIds = new Set();
  for (const path of [
    "pledge_id",
    "pledgeId",
    "parent_gift_id",
    "parentGiftId",
    "linked_gift_id",
    "linkedGiftId",
    "applied_to_gift_id",
    "appliedToGiftId",
    "commitment_id",
    "commitmentId",
    "recurring_gift_id",
    "recurringGiftId",
    "matching_gift_pledge_id",
    "matchingGiftPledgeId",
    "pledge.id",
    "pledge.gift_id",
    "recurring_gift.id",
    "recurringGift.id",
    "matching_gift_pledge.id",
    "matchingGiftPledge.id",
  ]) {
    const parentId = getRelationshipId(getNestedValue(gift, path));
    if (parentId) parentIds.add(parentId);
  }

  for (const path of [
    "linked_gifts",
    "linkedGifts",
    "related_gifts",
    "relatedGifts",
    "payment_details",
    "paymentDetails",
    "applications",
  ]) {
    const rows = getNestedValue(gift, path);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const parentId = getRelationshipId(row);
      if (parentId) parentIds.add(parentId);
    }
  }
  return parentIds;
}

function getNetAmount(gift, giftType) {
  const amount = getGiftAmount(gift);
  if (amount === null || amount <= 0) return 0;
  if (giftType !== "pledge" && giftType !== "matchinggiftpledge") return amount;
  return Math.max(0, amount - getPledgeWriteOffAmount(gift));
}

function isDirectPaymentOfIncludedCommitment({ gift, eligibleGiftsById }) {
  return Array.from(getPaymentParentIds(gift)).some((parentId) => {
    const parentGift = eligibleGiftsById.get(parentId);
    return parentGift && parentGift.netAmount > 0;
  });
}

export function calculateLifetimeFundraiserCredit({ gifts = [], fundraiserIds = [] } = {}) {
  const fundraiserIdSet = new Set(
    (fundraiserIds instanceof Set ? [...fundraiserIds] : fundraiserIds)
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const giftsById = new Map();
  const excluded = {
    duplicateGiftId: 0,
    missingGiftId: 0,
    ineligibleGiftType: 0,
    noFundraiserCredit: 0,
    reversalOrVoid: 0,
    noPositiveAmount: 0,
    linkedFulfillmentPayment: 0,
    unlinkedFulfillmentPayment: 0,
  };

  for (const gift of gifts) {
    const giftId = getGiftId(gift);
    if (!giftId) {
      excluded.missingGiftId += 1;
      continue;
    }
    if (giftsById.has(giftId)) {
      excluded.duplicateGiftId += 1;
      continue;
    }
    giftsById.set(giftId, gift);
  }

  const eligibleGiftsById = new Map();
  for (const [giftId, gift] of giftsById) {
    const giftType = getGiftType(gift);
    if (!ELIGIBLE_GIFT_TYPES.has(giftType)) {
      excluded.ineligibleGiftType += 1;
      continue;
    }
    if (isStructuredReversal(gift)) {
      excluded.reversalOrVoid += 1;
      continue;
    }
    if (!hasExplicitFundraiserCredit(gift, fundraiserIdSet)) {
      excluded.noFundraiserCredit += 1;
      continue;
    }
    const netAmount = getNetAmount(gift, giftType);
    if (netAmount <= 0) {
      excluded.noPositiveAmount += 1;
      continue;
    }
    eligibleGiftsById.set(giftId, { gift, giftType, netAmount });
  }

  let total = 0;
  const includedGiftIds = [];
  for (const [giftId, entry] of eligibleGiftsById) {
    if (FULFILLMENT_PAYMENT_GIFT_TYPES.has(entry.giftType)) {
      if (
        isDirectPaymentOfIncludedCommitment({
          gift: entry.gift,
          eligibleGiftsById,
        })
      ) {
        excluded.linkedFulfillmentPayment += 1;
      } else {
        // Payment-only records are never used as a fallback commitment. This
        // avoids double counting when an older parent record is unavailable.
        excluded.unlinkedFulfillmentPayment += 1;
      }
      continue;
    }
    total += entry.netAmount;
    includedGiftIds.push(giftId);
  }

  return {
    total,
    includedGiftIds,
    excluded,
  };
}

export async function getLiveLifetimeFundraiserCredit({
  workspaceUser,
  authUserId,
  origin,
} = {}) {
  const fundraiserIds = getWorkspaceFundraiserIds(workspaceUser);
  if (!workspaceUser?.id || !origin || fundraiserIds.size === 0) return 0;

  const result = await listBlackbaudGifts({
    userId: workspaceUser.id,
    authUserId,
    origin,
    // The Gifts API accepts repeatable gift_type parameters. Supplying an
    // array preserves that request shape through blackbaudApiFetch.
    searchParams: { gift_type: LIFETIME_GIFT_TYPE_FILTERS },
    // Match the proven page size used elsewhere in the NXT integration.
    // A provider-side maximum is safer than relying on an undocumented
    // large limit for this all-time calculation.
    pageLimit: 500,
    maxPages: 20,
    includePageMetadata: true,
  });
  const gifts = Array.isArray(result) ? result : result?.gifts;
  if (!Array.isArray(gifts) || result?.hasMore) {
    throw new Error("Lifetime fundraiser credit could not be read completely");
  }

  return calculateLifetimeFundraiserCredit({ gifts, fundraiserIds }).total;
}
