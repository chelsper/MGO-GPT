import {
  createBlackbaudAdHocQueryJob,
  downloadBlackbaudQueryResult,
  getBlackbaudGift,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";
import sql from "@/app/api/utils/sql";

// This metric is fundraiser-credit based. It intentionally has no fiscal-year
// window and trusts explicit solicitor credit on each eligible gift record.
const LIFETIME_QUERY_TYPE_ID = 18;
const LIFETIME_QUERY_POLL_INTERVAL_MS = 1000;
const LIFETIME_QUERY_MAX_WAIT_MS = 90000;
const LIFETIME_PLEDGE_WRITE_OFF_CACHE_VERSION = "v1";
const LIFETIME_PLEDGE_DETAIL_CONCURRENCY = 2;

const ELIGIBLE_GIFT_TYPES = new Set(
  [
    "cash",
    "donation",
    "giftinkind",
    "matchinggiftpayment",
    "matchinggiftpaycash",
    "matchinggiftpledge",
    "matchinggiftpledgepayment",
    "mgpaycash",
    "onetimegift",
    "other",
    "paycash",
    "paystockproperty",
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
  "matchinggiftpledgepayment",
  "mgpaycash",
  "paystockproperty",
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
    firstDefined(gift, [
      "id",
      "gift_id",
      "giftId",
      "gift_system_record_id",
      "giftSystemRecordId",
      "gift.id",
      "gift.gift_id",
    ]) || "",
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

export function getWorkspaceFundraiserIds(workspaceUser) {
  const ids = new Set();
  for (const value of [
    workspaceUser?.blackbaud_constituent_id,
    workspaceUser?.blackbaudConstituentId,
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

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function normalizeQueryHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const LIFETIME_QUERY_COLUMNS = {
  giftId: [
    "gift_system_record_id",
    "gift_system_id",
    "gift_id",
    "system_record_id",
  ],
  giftType: ["gift_type", "type"],
  giftAmount: ["gift_amount", "amount"],
  giftStatus: ["gift_status", "status"],
  pledgeBalance: ["pledge_balance", "gift_pledge_balance"],
  fundraiserId: [
    "fundraiser_system_record_id",
    "gift_fundraiser_system_record_id",
    "fundraiser_id",
    "gift_fundraiser_id",
  ],
};

function getQueryCsvValue(row, columnNames) {
  for (const columnName of columnNames) {
    if (Object.hasOwn(row, columnName)) return row[columnName];
  }
  return "";
}

function assertLifetimeQueryColumns(headers) {
  const requiredColumns = [
    ["gift ID", LIFETIME_QUERY_COLUMNS.giftId],
    ["gift type", LIFETIME_QUERY_COLUMNS.giftType],
    ["gift amount", LIFETIME_QUERY_COLUMNS.giftAmount],
    ["fundraiser system record ID", LIFETIME_QUERY_COLUMNS.fundraiserId],
  ];
  const missing = requiredColumns
    .filter(([, columnNames]) => !columnNames.some((columnName) => headers.includes(columnName)))
    .map(([label]) => label);

  if (missing.length > 0) {
    throw new Error(
      `Blackbaud lifetime query result is missing required output column${
        missing.length === 1 ? "" : "s"
      }: ${missing.join(", ")}`,
    );
  }
}

export function parseLifetimeFundraiserCreditCsv(content) {
  const rows = parseCsv(String(content || ""));
  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeQueryHeader);
  assertLifetimeQueryColumns(headers);

  const gifts = rows.slice(1).map((values) => {
    const row = Object.fromEntries(
      headers.map((header, index) => [header, String(values[index] || "").trim()]),
    );
    return {
      id: getQueryCsvValue(row, LIFETIME_QUERY_COLUMNS.giftId),
      gift_system_record_id: getQueryCsvValue(row, LIFETIME_QUERY_COLUMNS.giftId),
      gift_type: getQueryCsvValue(row, LIFETIME_QUERY_COLUMNS.giftType),
      amount: getQueryCsvValue(row, LIFETIME_QUERY_COLUMNS.giftAmount),
      gift_status: getQueryCsvValue(row, LIFETIME_QUERY_COLUMNS.giftStatus),
      pledge_balance: getQueryCsvValue(row, LIFETIME_QUERY_COLUMNS.pledgeBalance),
      fundraisers: [
        {
          fundraiser_id: getQueryCsvValue(row, LIFETIME_QUERY_COLUMNS.fundraiserId),
        },
      ],
    };
  });

  if (gifts.length > 0 && gifts.every((gift) => !getGiftId(gift))) {
    throw new Error("Blackbaud lifetime query returned rows without gift system record IDs");
  }
  return gifts;
}

export function buildLifetimeFundraiserCreditQuery(fundraiserIds) {
  const normalizedIds = [...new Set(
    (fundraiserIds instanceof Set ? [...fundraiserIds] : fundraiserIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  )];
  if (normalizedIds.length === 0) {
    throw new Error("A Blackbaud fundraiser system record ID is required");
  }

  return {
    type_id: LIFETIME_QUERY_TYPE_ID,
    format: "Dynamic",
    sql_generation_mode: "Query",
    // Each result must represent a gift/commitment row. The default
    // constituent layout can collapse a donor's history into an incomplete
    // single row and silently understate lifetime solicitor credit.
    result_layout: "MultiRow",
    select_fields: [
      { query_field_id: 212485, user_alias: "gift_system_record_id" },
      { query_field_id: 8471, user_alias: "gift_date" },
      { query_field_id: 8476, user_alias: "gift_type" },
      { query_field_id: 8469, user_alias: "gift_amount" },
      { query_field_id: 102590, user_alias: "pledge_balance" },
      { query_field_id: 15691, user_alias: "gift_status" },
      { query_field_id: 214249, user_alias: "fundraiser_system_record_id" },
      { query_field_id: 16016, user_alias: "fundraiser_name" },
    ],
    filter_fields: [
      {
        compare_type: "None",
        filter_values: normalizedIds,
        left_parenthesis: false,
        operator: normalizedIds.length === 1 ? "Equals" : "OneOf",
        query_field_id: 214249,
        right_parenthesis: false,
      },
    ],
    sort_fields: [],
    constituent_filters: {
      include_deceased: true,
      include_inactive: true,
      include_no_valid_addresses: true,
    },
    gift_processing_options: {
      // Fundraiser credit is explicit on the gift. Do not add soft or matching
      // credit recipients that were not intentionally assigned as solicitors.
      matching_gift_credit_option: "Donor",
      soft_credit_option: "Donor",
      use_gross_amount_for_covenants: false,
    },
    advanced_processing_options: {
      use_alternate_sql_code_table_fields: false,
      use_alternate_sql_multiple_attributes: false,
    },
    suppress_duplicates: true,
  };
}

function getQueryJobId(job) {
  return String(firstDefined(job, ["id", "job_id", "jobId"]) || "").trim();
}

function getQueryJobStatus(job) {
  return normalizeToken(firstDefined(job, ["status", "job_status", "jobStatus"]) || "");
}

function isCompletedQueryJob(job) {
  return ["completed", "complete", "succeeded"].includes(getQueryJobStatus(job));
}

function isFailedQueryJob(job) {
  return ["failed", "failure", "cancelled", "canceled", "error"].includes(
    getQueryJobStatus(job),
  );
}

function getQueryResultUrl(job) {
  return String(
    firstDefined(job, ["sas_uri", "read_url", "readUrl", "result_url", "resultUrl"]) || "",
  ).trim();
}

function getQueryJobRowCount(job) {
  const count = Number(firstDefined(job, ["row_count", "rowCount", "count"]));
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForBlackbaudQueryJob({ userId, authUserId, origin, jobId }) {
  const startedAt = Date.now();
  let job = null;
  while (Date.now() - startedAt < LIFETIME_QUERY_MAX_WAIT_MS) {
    job = await getBlackbaudQueryJob({ userId, authUserId, origin, jobId });
    if (isCompletedQueryJob(job)) {
      const resultUrl = getQueryResultUrl(job);
      if (!resultUrl) throw new Error("Blackbaud completed the lifetime query without a result file");
      return { resultUrl, rowCount: getQueryJobRowCount(job) };
    }
    if (isFailedQueryJob(job)) {
      throw new Error(`Blackbaud lifetime query ${getQueryJobStatus(job) || "failed"}`);
    }
    await delay(LIFETIME_QUERY_POLL_INTERVAL_MS);
  }
  throw new Error("Blackbaud lifetime query did not finish before the refresh deadline");
}

function getPledgeBalance(gift) {
  return toAmount(firstDefined(gift, ["pledge_balance", "pledgeBalance"]));
}

function getPledgeWriteOffCacheKey(workspaceUser, fundraiserIds) {
  return [
    `metric:executive-team-standings:lifetime-pledge-write-offs:${LIFETIME_PLEDGE_WRITE_OFF_CACHE_VERSION}`,
    workspaceUser?.id || "",
    [...fundraiserIds].sort().join(","),
  ].join("|");
}

async function getPledgeWriteOffLedger(cacheKey) {
  if (!cacheKey) return {};
  const rows = await sql`
    SELECT payload
    FROM report_snapshots_cache
    WHERE report_key = ${cacheKey}
    LIMIT 1
  `;
  const entries = rows[0]?.payload?.entries;
  return entries && typeof entries === "object" && !Array.isArray(entries) ? entries : {};
}

async function savePledgeWriteOffLedger(cacheKey, entries) {
  if (!cacheKey) return;
  await sql`
    INSERT INTO report_snapshots_cache (report_key, payload, updated_at)
    VALUES (
      ${cacheKey},
      ${JSON.stringify({ entries })}::jsonb,
      NOW()
    )
    ON CONFLICT (report_key)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
}

function hasCurrentPledgeWriteOffEntry(entry, gift) {
  if (!entry || typeof entry !== "object") return false;
  const giftAmount = getGiftAmount(gift);
  const pledgeBalance = getPledgeBalance(gift);
  return (
    Number(entry.giftAmount) === Number(giftAmount) &&
    (entry.pledgeBalance == null ? null : Number(entry.pledgeBalance)) === pledgeBalance &&
    Number.isFinite(Number(entry.writeOffAmount))
  );
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, worker),
  );
  return results;
}

async function resolvePledgeWriteOffs({
  gifts,
  workspaceUser,
  fundraiserIds,
  authUserId,
  origin,
}) {
  const pledgeGifts = gifts.filter((gift) => {
    const giftType = getGiftType(gift);
    return giftType === "pledge" || giftType === "matchinggiftpledge";
  });
  if (pledgeGifts.length === 0) return new Map();

  const cacheKey = getPledgeWriteOffCacheKey(workspaceUser, fundraiserIds);
  const ledger = await getPledgeWriteOffLedger(cacheKey).catch(() => ({}));
  const pending = pledgeGifts.filter((gift) => !hasCurrentPledgeWriteOffEntry(ledger[getGiftId(gift)], gift));

  const resolvedEntries = await mapWithConcurrency(
    pending,
    LIFETIME_PLEDGE_DETAIL_CONCURRENCY,
    async (gift) => {
      const giftId = getGiftId(gift);
      const detail = await getBlackbaudGift({
        userId: workspaceUser.id,
        authUserId,
        origin,
        giftId,
      });
      return [
        giftId,
        {
          giftAmount: getGiftAmount(gift),
          pledgeBalance: getPledgeBalance(gift),
          writeOffAmount: getPledgeWriteOffAmount(detail),
        },
      ];
    },
  );

  for (const [giftId, entry] of resolvedEntries) ledger[giftId] = entry;
  if (resolvedEntries.length > 0) {
    // This cache is keyed by the query-visible pledge amount and balance. A
    // changed pledge rehydrates; unchanged historic pledges do not consume
    // Blackbaud quota on every report refresh.
    await savePledgeWriteOffLedger(cacheKey, ledger).catch(() => {});
  }

  return new Map(
    pledgeGifts.map((gift) => [getGiftId(gift), Number(ledger[getGiftId(gift)]?.writeOffAmount || 0)]),
  );
}

export async function getLiveLifetimeFundraiserCredit({
  workspaceUser,
  authUserId,
  origin,
} = {}) {
  const fundraiserIds = getWorkspaceFundraiserIds(workspaceUser);
  if (!workspaceUser?.id || !origin) return null;
  if (fundraiserIds.size === 0) {
    throw new Error("No Blackbaud fundraiser system record ID is configured for this user");
  }

  const createdJob = await createBlackbaudAdHocQueryJob({
    userId: workspaceUser.id,
    authUserId,
    origin,
    query: buildLifetimeFundraiserCreditQuery(fundraiserIds),
    resultsFileName: `lifetime-fundraiser-credit-${workspaceUser.id}.csv`,
  });
  const jobId = getQueryJobId(createdJob);
  if (!jobId) throw new Error("Blackbaud did not return a lifetime query job ID");
  const { resultUrl, rowCount } = await waitForBlackbaudQueryJob({
    userId: workspaceUser.id,
    authUserId,
    origin,
    jobId,
  });
  const gifts = parseLifetimeFundraiserCreditCsv(
    await downloadBlackbaudQueryResult(resultUrl),
  );
  if (rowCount !== null && rowCount > 0 && gifts.length === 0) {
    throw new Error(
      "Blackbaud lifetime query reported results, but its CSV did not contain any gift rows",
    );
  }
  const pledgeWriteOffs = await resolvePledgeWriteOffs({
    gifts,
    workspaceUser,
    fundraiserIds,
    authUserId,
    origin,
  });
  const enrichedGifts = gifts.map((gift) => ({
    ...gift,
    ...(pledgeWriteOffs.has(getGiftId(gift))
      ? { write_off_amount: pledgeWriteOffs.get(getGiftId(gift)) }
      : {}),
  }));

  return calculateLifetimeFundraiserCredit({ gifts: enrichedGifts, fundraiserIds }).total;
}
