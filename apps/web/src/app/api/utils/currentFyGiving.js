const EXCLUDED_FUND_NAMES = new Set(["credit card processing fee"]);

const RECEIVED_GIFT_TYPES = new Set([
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

const COMMITTED_GIFT_TYPES = new Set([
  "pledge",
  "recurringgift",
  "matchinggiftpledge",
  "plannedgift",
  "plannedgiving",
]);

const PLANNED_GIFT_TYPES = new Set(["plannedgift", "plannedgiving"]);

export function isPledgePaymentGiftType(value) {
  const giftType = normalizeToken(value);
  return (
    giftType === "pledgepayment" ||
    giftType === "pledgepaycash" ||
    giftType.startsWith("pledgepayment") ||
    giftType.startsWith("pledgepaycash")
  );
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toAmount(value) {
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

function getGiftType(gift) {
  return normalizeToken(
    getTextFromMaybeObject(
      firstDefined(gift, ["gift_type", "giftType", "type", "type_name", "category"]),
    ),
  );
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
  for (const path of [
    "soft_credits",
    "softCredits",
    "recognition_credits",
    "recognitionCredits",
    "recognitions",
  ]) {
    const value = getNestedValue(gift, path);
    if (Array.isArray(value)) rows.push(...value);
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

function getTextFromMaybeObject(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim() || null;
  }
  if (typeof value === "object") {
    const label = firstDefined(value, [
      "name",
      "description",
      "fund_name",
      "fundName",
      "fund_description",
      "fundDescription",
      "value",
      "id",
    ]);
    return String(label || "").trim() || null;
  }
  return null;
}

function isExcludedFund(gift) {
  const labels = [];
  for (const path of [
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
  ]) {
    const label = getTextFromMaybeObject(getNestedValue(gift, path));
    if (label) labels.push(label);
  }

  for (const path of ["funds", "designations", "payments.0.applications", "applications"]) {
    const rows = getNestedValue(gift, path);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const label =
        getTextFromMaybeObject(row?.fund) ||
        getTextFromMaybeObject(row?.designation) ||
        getTextFromMaybeObject(row);
      if (label) labels.push(label);
    }
  }

  return labels.some((label) => EXCLUDED_FUND_NAMES.has(normalizeText(label)));
}

function roundCurrency(value) {
  return Number(value.toFixed(2));
}

function addAmount(summary, key, amount, giftId, countedGiftIds) {
  if (amount == null || amount <= 0) return false;

  const normalizedGiftId = giftId ? String(giftId) : null;
  if (normalizedGiftId && countedGiftIds.has(normalizedGiftId)) {
    return false;
  }

  summary[key] += amount;
  if (normalizedGiftId) countedGiftIds.add(normalizedGiftId);
  return true;
}

function recordLatestReceivedGift(summary, { date, amount }) {
  if (amount == null || amount <= 0) return;

  const giftTime = new Date(date).getTime();
  if (!Number.isFinite(giftTime)) return;

  const currentLatestTime = summary.lastGiftDate
    ? new Date(summary.lastGiftDate).getTime()
    : Number.NaN;

  if (!Number.isFinite(currentLatestTime) || giftTime > currentLatestTime) {
    summary.lastGiftDate = String(date);
    summary.lastGiftAmount = amount;
  }
}

export function getCurrentFiscalYearWindow({ now = new Date(), fiscalYearStartMonth = 7 } = {}) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const startMonth = Math.min(12, Math.max(1, Number(fiscalYearStartMonth || 7)));
  const nowYear = safeNow.getUTCFullYear();
  const nowMonth = safeNow.getUTCMonth() + 1;
  const startYear = nowMonth >= startMonth ? nowYear : nowYear - 1;
  const fiscalYear = startMonth === 1 ? startYear : startYear + 1;

  return {
    startDate: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
    endDate: formatDateOnly(safeNow),
    fiscalYear,
    yearLabel: `FY${String(fiscalYear).slice(-2)}`,
  };
}

export function calculateCurrentFiscalYearGiving({
  constituentIds = [],
  gifts = [],
  now = new Date(),
  fiscalYearStartMonth = 7,
} = {}) {
  const period = getCurrentFiscalYearWindow({ now, fiscalYearStartMonth });
  const requestedIds = new Set(
    constituentIds.map((value) => String(value || "").trim()).filter(Boolean),
  );
  const byConstituentId = Object.fromEntries(
    Array.from(requestedIds, (constituentId) => [
      constituentId,
      {
        // Hard-credit totals are kept separate from recognition totals so
        // reports can distinguish legal gift revenue from acknowledgment credit.
        hardReceived: 0,
        hardCommitted: 0,
        softReceived: 0,
        softCommitted: 0,
        recognizedReceived: 0,
        recognizedCommitted: 0,
        plannedGifts: 0,
        receivedGiftCount: 0,
        committedGiftCount: 0,
        plannedGiftCount: 0,
        lastGiftDate: null,
        lastGiftAmount: null,
      },
    ]),
  );
  const startTime = new Date(`${period.startDate}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${period.endDate}T23:59:59.999Z`).getTime();
  const countedGiftIds = {
    hardReceived: new Map(),
    hardCommitted: new Map(),
    softReceived: new Map(),
    softCommitted: new Map(),
    received: new Map(),
    committed: new Map(),
    planned: new Map(),
  };
  const acknowledgmentCredits = [];
  const acknowledgmentCreditKeys = new Set();

  for (const gift of gifts) {
    const giftTime = new Date(getGiftDate(gift)).getTime();
    if (!Number.isFinite(giftTime) || giftTime < startTime || giftTime > endTime) {
      continue;
    }
    if (isExcludedFund(gift)) continue;

    const giftType = getGiftType(gift);
    const isReceived =
      RECEIVED_GIFT_TYPES.has(giftType) || isPledgePaymentGiftType(giftType);
    const isCommitted = COMMITTED_GIFT_TYPES.has(giftType);
    const isPlannedGift = PLANNED_GIFT_TYPES.has(giftType);
    if (!isReceived && !isCommitted) continue;

    const directId = String(getGiftConstituentId(gift) || "").trim();
    const directAmount = toAmount(getGiftAmount(gift));
    const recognizedAmounts = new Map();
    const softRecognitionAmounts = new Map();
    const giftId =
      gift?.id ||
      gift?.gift_id ||
      gift?.giftId ||
      `${giftType}:${getGiftDate(gift)}:${directId || "unknown"}`;

    if (directId && requestedIds.has(directId) && directAmount != null && directAmount > 0) {
      recognizedAmounts.set(directId, directAmount);
      const directSummary = byConstituentId[directId];

      if (isReceived) {
        const counted = countedGiftIds.hardReceived.get(directId) || new Set();
        addAmount(directSummary, "hardReceived", directAmount, giftId, counted);
        countedGiftIds.hardReceived.set(directId, counted);
      }

      if (isCommitted) {
        const counted = countedGiftIds.hardCommitted.get(directId) || new Set();
        addAmount(directSummary, "hardCommitted", directAmount, giftId, counted);
        countedGiftIds.hardCommitted.set(directId, counted);
      }
    }

    for (const credit of getRecognitionCreditRows(gift)) {
      const constituentId = String(getRecognitionCreditConstituentId(credit) || "").trim();
      const amount = toAmount(getRecognitionCreditAmount(credit));

      if (
        isReceived &&
        directId &&
        constituentId &&
        constituentId !== directId &&
        amount != null &&
        amount > 0
      ) {
        const acknowledgmentKey = `${giftId}:${directId}:${constituentId}`;
        if (!acknowledgmentCreditKeys.has(acknowledgmentKey)) {
          acknowledgmentCreditKeys.add(acknowledgmentKey);
          acknowledgmentCredits.push({
            giftId: String(giftId),
            hardCreditConstituentId: directId,
            recipientConstituentId: constituentId,
            amount,
            date: getGiftDate(gift),
          });
        }
      }

      // A direct gift amount is the authoritative recognition amount for its recipient.
      if (
        !constituentId ||
        constituentId === directId ||
        !requestedIds.has(constituentId) ||
        amount == null ||
        amount <= 0
      ) {
        continue;
      }
      recognizedAmounts.set(constituentId, (recognizedAmounts.get(constituentId) || 0) + amount);
      softRecognitionAmounts.set(
        constituentId,
        (softRecognitionAmounts.get(constituentId) || 0) + amount,
      );
    }

    for (const [constituentId, amount] of recognizedAmounts) {
      const summary = byConstituentId[constituentId];
      const giftId = gift?.id || `${giftType}:${getGiftDate(gift)}:${constituentId}`;

      if (isReceived) {
        const counted = countedGiftIds.received.get(constituentId) || new Set();
        const isNewGift = addAmount(summary, "recognizedReceived", amount, giftId, counted);
        countedGiftIds.received.set(constituentId, counted);
        if (softRecognitionAmounts.has(constituentId)) {
          const softCounted = countedGiftIds.softReceived.get(constituentId) || new Set();
          addAmount(summary, "softReceived", amount, giftId, softCounted);
          countedGiftIds.softReceived.set(constituentId, softCounted);
        }
        if (isNewGift) {
          summary.receivedGiftCount += 1;
          recordLatestReceivedGift(summary, {
            date: getGiftDate(gift),
            amount,
          });
        }
      }

      if (isCommitted) {
        const counted = countedGiftIds.committed.get(constituentId) || new Set();
        const isNewGift = addAmount(summary, "recognizedCommitted", amount, giftId, counted);
        countedGiftIds.committed.set(constituentId, counted);
        if (softRecognitionAmounts.has(constituentId)) {
          const softCounted = countedGiftIds.softCommitted.get(constituentId) || new Set();
          addAmount(summary, "softCommitted", amount, giftId, softCounted);
          countedGiftIds.softCommitted.set(constituentId, softCounted);
        }
        if (isNewGift) summary.committedGiftCount += 1;
      }

      if (isPlannedGift) {
        const counted = countedGiftIds.planned.get(constituentId) || new Set();
        const isNewGift = addAmount(summary, "plannedGifts", amount, giftId, counted);
        countedGiftIds.planned.set(constituentId, counted);
        if (isNewGift) summary.plannedGiftCount += 1;
      }
    }
  }

  for (const summary of Object.values(byConstituentId)) {
    summary.recognizedReceived = roundCurrency(summary.recognizedReceived);
    summary.recognizedCommitted = roundCurrency(summary.recognizedCommitted);
    summary.plannedGifts = roundCurrency(summary.plannedGifts);
    summary.hardReceived = roundCurrency(summary.hardReceived);
    summary.hardCommitted = roundCurrency(summary.hardCommitted);
    summary.softReceived = roundCurrency(summary.softReceived);
    summary.softCommitted = roundCurrency(summary.softCommitted);
    if (summary.lastGiftAmount != null) {
      summary.lastGiftAmount = roundCurrency(summary.lastGiftAmount);
    }
  }

  return {
    period,
    byConstituentId,
    acknowledgmentCredits: acknowledgmentCredits.map((credit) => ({
      ...credit,
      amount: roundCurrency(credit.amount),
    })),
  };
}
