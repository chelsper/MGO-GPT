import {
  getDefaultGivingSocietyConfigurations,
  normalizeGivingSocietyConfigurations,
} from "./givingSocietyDefinitions.js";

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
  "realizedplannedgiftrevenue",
  "recurringgiftpayment",
  "recurringgiftpaycash",
  "soldstock",
  "stock",
]);

const PLANNED_GIFT_TYPE_TOKENS = new Set([
  "plannedgift",
  "plannedgiving",
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

export const ANNUAL_GIVING_SOCIETY_TIERS =
  getDefaultGivingSocietyConfigurations();

const ANNUAL_SUPPORTED_COUNT_SOURCES = new Set([
  "received_revenue",
  "recognition_credit",
  "planned_gift",
]);

const LIFETIME_SUPPORTED_COUNT_SOURCES = new Set([
  "received_revenue",
  "recognition_credit",
  "committed",
  "planned_gift",
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

function getAnnualDefinitionWindow(definition, now) {
  const endDate = formatDateOnly(now);
  if (definition.periodBasis === "fiscal_year") {
    const startMonth = Math.min(
      12,
      Math.max(1, Number(definition.fiscalYearStartMonth || 7)),
    );
    const nowTime = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const fiscalStartThisYear = Date.UTC(
      now.getUTCFullYear(),
      startMonth - 1,
      1,
    );
    const startYear =
      nowTime >= fiscalStartThisYear
        ? now.getUTCFullYear()
        : now.getUTCFullYear() - 1;
    const fiscalYear =
      startMonth === 1
        ? startYear
        : startYear + 1;

    return {
      startDate: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
      endDate,
      year: fiscalYear,
      yearLabel: `FY${String(fiscalYear).slice(-2)}`,
      yearBasis: "fiscal",
      periodBasis: "fiscal_year",
    };
  }

  const year = now.getUTCFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate,
    year,
    yearLabel: String(year),
    yearBasis: "calendar",
    periodBasis: "calendar_year",
  };
}

function getEarliestAnnualStartDate(definitions, now) {
  const startDates = definitions
    .filter((definition) => definition.active !== false && definition.basis === "annual")
    .map((definition) => getAnnualDefinitionWindow(definition, now).startDate)
    .filter(Boolean)
    .sort();

  return startDates[0] || `${now.getUTCFullYear()}-01-01`;
}

function needsFullGiftHistory(definitions) {
  return definitions.some(
    (definition) =>
      definition.active !== false &&
      definition.basis === "lifetime" &&
      definition.countSources.includes("planned_gift"),
  );
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

function getGiftId(gift) {
  return String(
    firstDefined(gift, ["id", "gift_id", "giftId", "gift.id", "gift.gift_id"]) || "",
  ).trim();
}

function normalizeGiftIdSet(value) {
  return new Set(
    (value instanceof Set ? [...value] : Array.isArray(value) ? value : [])
      .map((giftId) => String(giftId || "").trim())
      .filter(Boolean),
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

function isPlannedGift(gift) {
  return PLANNED_GIFT_TYPE_TOKENS.has(getGiftTypeToken(gift));
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

function getGiftConstituentContext(gift, constituentId) {
  const recognitionCredits = getRecognitionCreditRows(gift).filter((credit) =>
    constituentIdsMatch(getRecognitionCreditConstituentId(credit), constituentId),
  );
  const directConstituentId = getGiftConstituentId(gift);
  const directMatches = directConstituentId
    ? constituentIdsMatch(directConstituentId, constituentId)
    : recognitionCredits.length === 0;

  return { recognitionCredits, directMatches };
}

function isPlannedGiftForConstituent(gift, constituentId, context = null) {
  if (!isPlannedGift(gift)) return false;
  const { recognitionCredits, directMatches } =
    context || getGiftConstituentContext(gift, constituentId);
  return directMatches || recognitionCredits.length > 0;
}

function sourceIsSupported(source, basis = "annual") {
  return basis === "lifetime"
    ? LIFETIME_SUPPORTED_COUNT_SOURCES.has(source)
    : ANNUAL_SUPPORTED_COUNT_SOURCES.has(source);
}

function definitionMatchesTotal(definition, total) {
  if (total < definition.minimumAmount) return false;
  if (definition.maximumAmount == null) return true;
  return total <= definition.maximumAmount;
}

function definitionQualifies({ definition, supportedCountSources, qualifyingAmount, plannedGiftCount }) {
  const amountSources = supportedCountSources.filter((source) => source !== "planned_gift");
  const amountQualified =
    amountSources.length > 0 && definitionMatchesTotal(definition, qualifyingAmount);
  const plannedGiftQualified =
    supportedCountSources.includes("planned_gift") && plannedGiftCount > 0;

  return {
    qualifies: amountQualified || plannedGiftQualified,
    qualificationMode:
      plannedGiftQualified && !amountQualified ? "planned_gift" : "amount",
  };
}

function getDisplaySocietyResults(societyResults) {
  if (!societyResults.length) return [];
  const [primarySociety, ...additionalSocieties] = societyResults;
  return [
    primarySociety,
    ...additionalSocieties.filter((society) => society.displayAlongside),
  ];
}

function calculateGivingTotalsForWindow({
  constituentId,
  gifts = [],
  startDate,
  endDate,
  realizedPlannedGiftIds = [],
}) {
  const startTime = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${endDate}T23:59:59.999Z`).getTime();
  let receivedRevenueTotal = 0;
  let recognitionCreditTotal = 0;
  let receivedRevenueGiftCount = 0;
  let recognitionCreditGiftCount = 0;
  let plannedGiftCount = 0;
  const countedGiftIds = new Set();
  const countedPlannedGiftIds = new Set();
  const realizedPlannedGiftIdSet = normalizeGiftIdSet(realizedPlannedGiftIds);

  for (const gift of gifts) {
    const giftDate = getGiftDate(gift);
    const giftTime = giftDate ? new Date(giftDate).getTime() : Number.NaN;
    if (!Number.isFinite(giftTime) || giftTime < startTime || giftTime > endTime) {
      continue;
    }

    const context = getGiftConstituentContext(gift, constituentId);
    const { recognitionCredits, directMatches } = context;

    const giftId = getGiftId(gift);
    if (
      isPlannedGiftForConstituent(gift, constituentId, context) &&
      !realizedPlannedGiftIdSet.has(giftId)
    ) {
      plannedGiftCount += 1;
      if (giftId) {
        countedGiftIds.add(giftId);
        countedPlannedGiftIds.add(giftId);
      }
    }

    if (!isReceivedRevenueGift(gift)) continue;

    if (directMatches) {
      const amount = toFiniteAmount(getGiftAmount(gift));
      if (amount != null && amount > 0) {
        receivedRevenueTotal += amount;
        receivedRevenueGiftCount += 1;
        if (giftId) countedGiftIds.add(giftId);
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
      if (giftId) countedGiftIds.add(giftId);
    }
  }

  return {
    receivedRevenueTotal: Number(receivedRevenueTotal.toFixed(2)),
    recognitionCreditTotal: Number(recognitionCreditTotal.toFixed(2)),
    qualifyingGiftCount:
      countedGiftIds.size ||
      receivedRevenueGiftCount + recognitionCreditGiftCount + plannedGiftCount,
    receivedRevenueGiftCount,
    recognitionCreditGiftCount,
    plannedGiftCount,
    plannedGiftIds: Array.from(countedPlannedGiftIds),
  };
}

function calculatePlannedGiftPresence({
  constituentId,
  gifts = [],
  realizedPlannedGiftIds = [],
} = {}) {
  const plannedGiftIds = new Set();
  let plannedGiftCount = 0;
  const realizedPlannedGiftIdSet = normalizeGiftIdSet(realizedPlannedGiftIds);

  for (const gift of gifts) {
    const giftId = getGiftId(gift);
    if (
      !isPlannedGiftForConstituent(gift, constituentId) ||
      realizedPlannedGiftIdSet.has(giftId)
    ) {
      continue;
    }
    plannedGiftCount += 1;
    if (giftId) plannedGiftIds.add(giftId);
  }

  return {
    plannedGiftCount,
    plannedGiftIds: Array.from(plannedGiftIds),
  };
}

function getLifetimeGivingAmount(lifetimeGiving, source) {
  if (!lifetimeGiving) return 0;

  const value = (() => {
    if (source === "committed") {
      return firstDefined(lifetimeGiving, [
        "totalGiving",
        "total_giving.value",
        "total_giving",
      ]);
    }
    if (source === "received_revenue") {
      return firstDefined(lifetimeGiving, [
        "totalReceivedGiving",
        "total_received_giving.value",
        "total_received_giving",
      ]);
    }
    if (source === "recognition_credit") {
      return firstDefined(lifetimeGiving, [
        "totalSoftCredits",
        "total_soft_credits.value",
        "total_soft_credits",
      ]);
    }
    return null;
  })();

  const amount = toFiniteAmount(value);
  return amount != null && amount > 0 ? amount : 0;
}

function calculateLifetimeGivingTotals(lifetimeGiving) {
  return {
    committedTotal: Number(getLifetimeGivingAmount(lifetimeGiving, "committed").toFixed(2)),
    receivedRevenueTotal: Number(getLifetimeGivingAmount(lifetimeGiving, "received_revenue").toFixed(2)),
    recognitionCreditTotal: Number(getLifetimeGivingAmount(lifetimeGiving, "recognition_credit").toFixed(2)),
  };
}

function calculateLifetimeGivingSocieties({
  societyDefinitions,
  lifetimeGiving,
  gifts = [],
  constituentId,
  realizedPlannedGiftIds = [],
} = {}) {
  const definitions = normalizeGivingSocietyConfigurations(societyDefinitions)
    .filter((definition) => definition.active !== false && definition.basis === "lifetime");
  const totals = calculateLifetimeGivingTotals(lifetimeGiving);
  const plannedGiftPresence = calculatePlannedGiftPresence({
    constituentId,
    gifts,
    realizedPlannedGiftIds,
  });

  const societyResults = definitions
    .map((definition) => {
      const supportedCountSources =
        definition.countSources.filter((source) => sourceIsSupported(source, "lifetime"));
      const unsupportedCountSources =
        definition.countSources.filter((source) => !sourceIsSupported(source, "lifetime"));
      const qualifyingAmount = Number(
        (
          (supportedCountSources.includes("committed")
            ? totals.committedTotal
            : 0) +
          (supportedCountSources.includes("received_revenue")
            ? totals.receivedRevenueTotal
            : 0) +
          (supportedCountSources.includes("recognition_credit")
            ? totals.recognitionCreditTotal
            : 0)
        ).toFixed(2),
      );

      const { qualifies, qualificationMode } = definitionQualifies({
        definition,
        supportedCountSources,
        qualifyingAmount,
        plannedGiftCount: plannedGiftPresence.plannedGiftCount,
      });

      if (!qualifies) return null;

      return {
        key: definition.key,
        label: definition.name,
        name: definition.name,
        minimum: definition.minimumAmount,
        maximum: definition.maximumAmount,
        hierarchy: definition.displayOrder,
        displayAlongside: definition.displayAlongside,
        basis: definition.basis,
        periodBasis: definition.periodBasis,
        year: null,
        yearLabel: "Lifetime",
        yearBasis: "lifetime",
        startDate: null,
        endDate: null,
        countSources: definition.countSources,
        supportedCountSources,
        unsupportedCountSources,
        qualifyingAmount,
        qualificationMode,
        plannedGiftCount: plannedGiftPresence.plannedGiftCount,
        plannedGiftIds: plannedGiftPresence.plannedGiftIds,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.hierarchy !== right.hierarchy) return left.hierarchy - right.hierarchy;
      return right.qualifyingAmount - left.qualifyingAmount;
    });

  return {
    committedTotal: totals.committedTotal,
    receivedRevenueTotal: totals.receivedRevenueTotal,
    recognitionCreditTotal: totals.recognitionCreditTotal,
    combinedLifetimeGiving: societyResults[0]?.qualifyingAmount ?? Number(
      (
        totals.committedTotal +
        totals.receivedRevenueTotal +
        totals.recognitionCreditTotal
      ).toFixed(2),
    ),
    primarySociety: societyResults[0] || null,
    societies: societyResults,
  };
}

export function calculateAnnualGivingSocieties({
  constituentId,
  gifts = [],
  now = new Date(),
  societyDefinitions,
  lifetimeGiving = null,
  realizedPlannedGiftIds = [],
} = {}) {
  const definitions = normalizeGivingSocietyConfigurations(societyDefinitions);
  const annualDefinitions = definitions
    .filter((definition) => definition.active !== false && definition.basis === "annual");
  const activeAnnualDefinitions = annualDefinitions.length
    ? annualDefinitions
    : getDefaultGivingSocietyConfigurations();
  const lifetimeSummary = calculateLifetimeGivingSocieties({
    societyDefinitions: definitions,
    lifetimeGiving,
    gifts,
    constituentId,
    realizedPlannedGiftIds,
  });
  const totalsByWindow = new Map();

  const societyResults = activeAnnualDefinitions
    .map((definition) => {
      const window = getAnnualDefinitionWindow(definition, now);
      const windowKey = `${window.startDate}:${window.endDate}`;
      if (!totalsByWindow.has(windowKey)) {
        totalsByWindow.set(
          windowKey,
          calculateGivingTotalsForWindow({
            constituentId,
            gifts,
            startDate: window.startDate,
            endDate: window.endDate,
            realizedPlannedGiftIds,
          }),
        );
      }

      const totals = totalsByWindow.get(windowKey);
      const supportedCountSources =
        definition.countSources.filter((source) => sourceIsSupported(source, "annual"));
      const unsupportedCountSources =
        definition.countSources.filter((source) => !sourceIsSupported(source, "annual"));
      const qualifyingAmount = Number(
        (
          (supportedCountSources.includes("received_revenue")
            ? totals.receivedRevenueTotal
            : 0) +
          (supportedCountSources.includes("recognition_credit")
            ? totals.recognitionCreditTotal
            : 0)
        ).toFixed(2),
      );

      const { qualifies, qualificationMode } = definitionQualifies({
        definition,
        supportedCountSources,
        qualifyingAmount,
        plannedGiftCount: totals.plannedGiftCount,
      });

      if (!qualifies) return null;

      return {
        key: definition.key,
        label: definition.name,
        name: definition.name,
        minimum: definition.minimumAmount,
        maximum: definition.maximumAmount,
        hierarchy: definition.displayOrder,
        displayAlongside: definition.displayAlongside,
        basis: definition.basis,
        periodBasis: definition.periodBasis,
        year: window.year,
        yearLabel: window.yearLabel,
        yearBasis: window.yearBasis,
        startDate: window.startDate,
        endDate: window.endDate,
        countSources: definition.countSources,
        supportedCountSources,
        unsupportedCountSources,
        qualifyingAmount,
        qualificationMode,
        plannedGiftCount: totals.plannedGiftCount,
        plannedGiftIds: totals.plannedGiftIds,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.hierarchy !== right.hierarchy) return left.hierarchy - right.hierarchy;
      return right.qualifyingAmount - left.qualifyingAmount;
    });

  const primarySociety = societyResults[0] || null;
  const displayedAnnualSocieties = getDisplaySocietyResults(societyResults);
  const primaryWindow = primarySociety
    ? {
        startDate: primarySociety.startDate,
        endDate: primarySociety.endDate,
        year: primarySociety.year,
        yearLabel: primarySociety.yearLabel,
        yearBasis: primarySociety.yearBasis,
        periodBasis: primarySociety.periodBasis,
      }
    : getAnnualDefinitionWindow(activeAnnualDefinitions[0], now);
  const primaryTotals = totalsByWindow.get(
    `${primaryWindow.startDate}:${primaryWindow.endDate}`,
  ) || calculateGivingTotalsForWindow({
    constituentId,
    gifts,
    startDate: primaryWindow.startDate,
    endDate: primaryWindow.endDate,
    realizedPlannedGiftIds,
  });
  const combinedAnnualGiving =
    primarySociety?.qualifyingAmount ??
    Number(
      (
        primaryTotals.receivedRevenueTotal + primaryTotals.recognitionCreditTotal
      ).toFixed(2),
    );

  const displayedLifetimeSocieties = getDisplaySocietyResults(lifetimeSummary.societies);
  const combinedSocieties = [...displayedAnnualSocieties, ...displayedLifetimeSocieties]
    .sort((left, right) => {
      if (left.hierarchy !== right.hierarchy) return left.hierarchy - right.hierarchy;
      if (left.basis !== right.basis) return left.basis === "annual" ? -1 : 1;
      return right.qualifyingAmount - left.qualifyingAmount;
    });

  return {
    year: primaryWindow.year,
    yearLabel: primaryWindow.yearLabel,
    yearBasis: primaryWindow.yearBasis,
    periodBasis: primaryWindow.periodBasis,
    startDate: primaryWindow.startDate,
    endDate: primaryWindow.endDate,
    receivedRevenueTotal: primaryTotals.receivedRevenueTotal,
    recognitionCreditTotal: primaryTotals.recognitionCreditTotal,
    combinedAnnualGiving,
    qualifyingGiftCount: primaryTotals.qualifyingGiftCount,
    receivedRevenueGiftCount: primaryTotals.receivedRevenueGiftCount,
    recognitionCreditGiftCount: primaryTotals.recognitionCreditGiftCount,
    plannedGiftCount: primaryTotals.plannedGiftCount,
    plannedGiftIds: primaryTotals.plannedGiftIds,
    primarySociety,
    primaryAnnualSociety: primarySociety,
    primaryLifetimeSociety: lifetimeSummary.primarySociety,
    annualSocieties: displayedAnnualSocieties,
    lifetimeSocieties: displayedLifetimeSocieties,
    allQualifiedAnnualSocieties: societyResults,
    allQualifiedLifetimeSocieties: lifetimeSummary.societies,
    societies: combinedSocieties,
    lifetimeGiving: {
      committedTotal: lifetimeSummary.committedTotal,
      receivedRevenueTotal: lifetimeSummary.receivedRevenueTotal,
      recognitionCreditTotal: lifetimeSummary.recognitionCreditTotal,
      combinedLifetimeGiving: lifetimeSummary.combinedLifetimeGiving,
    },
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
  societyDefinitions,
  lifetimeGiving,
  loadLifetimeGiving,
  resolveRealizedPlannedGiftIds,
} = {}) {
  if (!listGifts) {
    throw new Error("A Blackbaud gift list function is required");
  }
  if (!constituentId) {
    throw new Error("A Blackbaud constituent ID is required");
  }

  const definitions = normalizeGivingSocietyConfigurations(societyDefinitions);
  const startGiftDate = getEarliestAnnualStartDate(definitions, now);
  const giftSearchParams = {
    constituent_id: String(constituentId),
    ...(needsFullGiftHistory(definitions)
      ? {}
      : {
          start_gift_date: startGiftDate,
          end_gift_date: formatDateOnly(now),
        }),
  };
  const [gifts, resolvedLifetimeGiving] = await Promise.all([
    listGifts({
      userId,
      authUserId,
      origin,
      searchParams: giftSearchParams,
      pageLimit: 500,
      maxPages: 20,
    }),
    lifetimeGiving !== undefined
      ? Promise.resolve(lifetimeGiving)
      : typeof loadLifetimeGiving === "function"
        ? Promise.resolve().then(loadLifetimeGiving).catch(() => null)
        : Promise.resolve(null),
  ]);
  const realizedPlannedGiftIds =
    typeof resolveRealizedPlannedGiftIds === "function"
      ? await Promise.resolve()
          .then(() => resolveRealizedPlannedGiftIds(gifts))
          .catch(() => new Set())
      : new Set();

  return calculateAnnualGivingSocieties({
    constituentId,
    gifts,
    now,
    societyDefinitions: definitions,
    lifetimeGiving: resolvedLifetimeGiving,
    realizedPlannedGiftIds,
  });
}
