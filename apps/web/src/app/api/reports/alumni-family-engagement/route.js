import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  getCachedReportSnapshot,
  getReportCacheHeaders,
  saveReportSnapshot,
  shouldBypassReportCache,
} from "@/app/api/utils/reportCache";
import {
  getReportRefreshUser,
  isAuthorizedReportRefreshRequest,
} from "@/app/api/utils/reportRefresh";
import {
  getBlackbaudConfigIssues,
  listBlackbaudConstituentCodes,
  listBlackbaudGifts,
} from "@/app/api/utils/blackbaud";
import {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";
import {
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
  getAlumniDonorConfigurationFingerprint,
  getAlumniDonorCountRows,
  GIFT_TYPE_OPTIONS,
  normalizeAlumniDonorConfiguration,
} from "@/app/api/utils/alumniDonorConfiguration";

export const maxDuration = 300;

const MAX_GIFT_PAGES = 20;
const GIFT_PAGE_LIMIT = 500;
const CONSTITUENCY_LOOKUP_CONCURRENCY = 2;
const CONSTITUENCY_MEMBERSHIP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY = "report:alumni-family-engagement";
// The old export name is kept so any internal reference remains compatible;
// these are now direct NXT count rows rather than saved queries.
export const ALUMNI_DONOR_TOTAL_QUERIES = getAlumniDonorCountRows(
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
);

const DEFAULT_REPORT_TITLE = "Alumni & Family Engagement";
const DEFAULT_REPORT_DESCRIPTION =
  "Alumni donor totals from configured NXT gifts and constituency codes.";

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStringValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value !== "object") return "";

  const candidates = [
    value.description,
    value.name,
    value.value,
    value.label,
    value.type,
    value.code,
  ];
  for (const candidate of candidates) {
    const text = getStringValue(candidate);
    if (text) return text;
  }
  return "";
}

function getGiftRecipientId(gift) {
  const candidates = [
    gift?.constituent_id,
    gift?.constituentId,
    gift?.constituent?.id,
    gift?.constituent?.constituent_id,
    gift?.donor_id,
    gift?.donorId,
    gift?.donor?.id,
  ];
  for (const candidate of candidates) {
    const id = getStringValue(candidate);
    if (id) return id;
  }
  return "";
}

function getGiftTypeKey(gift) {
  const rawGiftType = getStringValue(
    gift?.gift_type ?? gift?.giftType ?? gift?.type ?? gift?.type_name ?? gift?.category,
  );
  const giftType = normalizeText(rawGiftType);
  if (giftType.includes("recurring")) return "recurring-gift-payment";
  if (giftType.includes("matching")) return "matching-gift-payment";
  if (giftType.includes("pledge") && giftType.includes("payment")) return "pledge-payment";
  if (giftType.includes("pledge")) return "pledge";
  if (giftType.includes("in kind")) return "gift-in-kind";
  if (giftType.includes("stock") || giftType.includes("securit") || giftType.includes("property")) {
    return "stock-property";
  }
  if (giftType.includes("donation") || giftType.includes("cash") || giftType === "gift") {
    return "donation";
  }
  return "other";
}

function getConstituencyCodeLabel(code) {
  if (!code || typeof code !== "object") return getStringValue(code);
  const candidates = [
    code.description,
    code.constituency_code,
    code.constituencyCode,
    code.constituent_code,
    code.constituentCode,
    code.code,
    code.name,
    code.value,
  ];
  for (const candidate of candidates) {
    const label = getStringValue(candidate);
    if (label) return label;
  }
  return "";
}

function getReportPresentation(access, donorConfiguration) {
  return {
    title: String(access?.title || "").trim() || DEFAULT_REPORT_TITLE,
    description:
      String(access?.description || "").trim() || DEFAULT_REPORT_DESCRIPTION,
    sourceKey: donorConfiguration.sourceKey,
    sourceLabel: donorConfiguration.sourceLabel,
  };
}

function getPublicDonorDefinition(donorConfiguration) {
  return {
    sourceKey: donorConfiguration.sourceKey,
    sourceLabel: donorConfiguration.sourceLabel,
    constituencies: donorConfiguration.constituencies,
    giftTypes: donorConfiguration.giftTypes.map((key) => ({
      key,
      label: GIFT_TYPE_OPTIONS.find((option) => option.key === key)?.label || key,
    })),
  };
}

function attachReportPresentation({ cachedPayload, donorConfiguration, presentation, countRows }) {
  if (!cachedPayload) return null;

  const configurationFingerprint = getAlumniDonorConfigurationFingerprint(donorConfiguration);
  if (cachedPayload.configurationFingerprint !== configurationFingerprint) return null;

  const cachedTotals = Array.isArray(cachedPayload?.totals) ? cachedPayload.totals : [];
  if (cachedTotals.length !== countRows.length) return null;

  const totalsByKey = new Map(
    cachedTotals.map((total) => [String(total?.key || "").trim(), total]),
  );
  if (countRows.some((row) => !totalsByKey.has(row.key))) return null;

  const { constituencyMembershipCache: ignoredMembershipCache, ...publicPayload } = cachedPayload;
  return {
    ...publicPayload,
    report: presentation,
    donorDefinition: getPublicDonorDefinition(donorConfiguration),
    configurationFingerprint,
    totals: countRows.map((row) => ({
      ...totalsByKey.get(row.key),
      key: row.key,
      label: row.label,
      fiscalYearStart: row.fiscalYearStart,
      fiscalYearEnd: row.fiscalYearEnd,
    })),
  };
}

function getReusableMembershipCache(cachedPayload) {
  const entries = cachedPayload?.constituencyMembershipCache;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return {};

  const cutoff = Date.now() - CONSTITUENCY_MEMBERSHIP_TTL_MS;
  return Object.fromEntries(
    Object.entries(entries).flatMap(([constituentId, entry]) => {
      const cachedAt = Date.parse(String(entry?.cachedAt || ""));
      if (!Array.isArray(entry?.codes) || !Number.isFinite(cachedAt) || cachedAt < cutoff) {
        return [];
      }
      return [[String(constituentId), {
        codes: entry.codes.map((code) => String(code || "").trim()).filter(Boolean),
        cachedAt: new Date(cachedAt).toISOString(),
      }]];
    }),
  );
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, () => worker()),
  );
  return results;
}

async function buildDirectDonorTotals({ user, origin, donorConfiguration, cachedPayload }) {
  const countRows = getAlumniDonorCountRows(donorConfiguration);
  const selectedGiftTypes = new Set(donorConfiguration.giftTypes);
  const recipientIdsByRow = new Map();
  const allRecipientIds = new Set();
  let giftRowsRead = 0;
  let selectedGiftRows = 0;
  let rowsMissingRecipient = 0;

  // Refresh count rows serially so a manual refresh remains gentle on the
  // shared Blackbaud quota even when a builder adds several fiscal years.
  for (const row of countRows) {
    const result = await listBlackbaudGifts({
      userId: user.id,
      authUserId: user.id,
      origin,
      searchParams: {
        start_gift_date: row.fiscalYearStart,
        end_gift_date: row.fiscalYearEnd,
      },
      pageLimit: GIFT_PAGE_LIMIT,
      maxPages: MAX_GIFT_PAGES,
      includePageMetadata: true,
    });
    const gifts = Array.isArray(result) ? result : result?.gifts || [];
    if (!Array.isArray(result) && result?.hasMore) {
      throw new Error(
        `${row.label} exceeds ${(MAX_GIFT_PAGES * GIFT_PAGE_LIMIT).toLocaleString("en-US")} gift rows. ` +
          "Narrow its fiscal period or gift types before refreshing so the saved count is complete.",
      );
    }

    giftRowsRead += gifts.length;
    const recipientIds = new Set();
    gifts.forEach((gift) => {
      if (!selectedGiftTypes.has(getGiftTypeKey(gift))) return;
      selectedGiftRows += 1;
      const recipientId = getGiftRecipientId(gift);
      if (!recipientId) {
        rowsMissingRecipient += 1;
        return;
      }
      recipientIds.add(recipientId);
      allRecipientIds.add(recipientId);
    });
    recipientIdsByRow.set(row.key, recipientIds);
  }

  const membershipCache = getReusableMembershipCache(cachedPayload);
  const missingRecipientIds = Array.from(allRecipientIds).filter((id) => !membershipCache[id]);
  const cachedAt = new Date().toISOString();

  await mapWithConcurrency(
    missingRecipientIds,
    CONSTITUENCY_LOOKUP_CONCURRENCY,
    async (constituentId) => {
      const codes = await listBlackbaudConstituentCodes({
        userId: user.id,
        authUserId: user.id,
        origin,
        constituentId,
      });
      membershipCache[constituentId] = {
        codes: codes.map(getConstituencyCodeLabel).filter(Boolean),
        cachedAt,
      };
    },
  );

  const selectedConstituencies = new Set(
    donorConfiguration.constituencies.map((code) => normalizeText(code)).filter(Boolean),
  );
  const totals = countRows.map((row) => {
    const recipientIds = recipientIdsByRow.get(row.key) || new Set();
    const total = Array.from(recipientIds).filter((constituentId) =>
      (membershipCache[constituentId]?.codes || []).some((code) =>
        selectedConstituencies.has(normalizeText(code)),
      ),
    ).length;

    return {
      key: row.key,
      label: row.label,
      fiscalYearStart: row.fiscalYearStart,
      fiscalYearEnd: row.fiscalYearEnd,
      total,
    };
  });

  const warnings = [];
  if (rowsMissingRecipient) {
    warnings.push(
      `${rowsMissingRecipient.toLocaleString("en-US")} selected NXT gift row(s) had no constituent recipient and were not counted.`,
    );
  }

  return {
    totals,
    totalRows: totals.reduce((sum, total) => sum + total.total, 0),
    warnings,
    refreshMetrics: {
      giftRowsRead,
      selectedGiftRows,
      uniqueGiftRecipients: allRecipientIds.size,
      refreshedConstituencyMemberships: missingRecipientIds.length,
    },
    constituencyMembershipCache: membershipCache,
  };
}

async function getCurrentUser(request) {
  await ensureAppSchema();
  if (isAuthorizedReportRefreshRequest(request)) {
    return getReportRefreshUser();
  }
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

export async function GET(request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const internalRefresh = isAuthorizedReportRefreshRequest(request);
    const access = await getReportAccessForUser(ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY, user);
    if (!internalRefresh && !access.canView) {
      return Response.json(
        { error: "Alumni & Family Engagement is not shared with you." },
        { status: 403 },
      );
    }

    const donorConfiguration = normalizeAlumniDonorConfiguration(access.dataConfiguration);
    const countRows = getAlumniDonorCountRows(donorConfiguration);
    const presentation = getReportPresentation(access, donorConfiguration);
    const forceRefresh = shouldBypassReportCache(request);
    const cachedPayload = await getCachedReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY);
    const presentedCachedPayload = attachReportPresentation({
      cachedPayload,
      donorConfiguration,
      presentation,
      countRows,
    });

    if (!forceRefresh && presentedCachedPayload) {
      return Response.json(presentedCachedPayload, { headers: getReportCacheHeaders("hit") });
    }

    if (!forceRefresh) {
      return Response.json(
        {
          status: "refresh_required",
          report: presentation,
          donorDefinition: getPublicDonorDefinition(donorConfiguration),
          configurationFingerprint: getAlumniDonorConfigurationFingerprint(donorConfiguration),
          message:
            "No saved Alumni & Family Engagement snapshot matches this donor definition yet. Select Refresh data to create one.",
        },
        { headers: getReportCacheHeaders("empty") },
      );
    }

    const origin = new URL(request.url).origin;
    const configurationIssues = getBlackbaudConfigIssues(origin);
    if (configurationIssues.length) {
      return Response.json(
        { error: `Blackbaud configuration is incomplete: ${configurationIssues.join(", ")}` },
        { status: 500 },
      );
    }

    const directTotals = await buildDirectDonorTotals({
      user,
      origin,
      donorConfiguration,
      cachedPayload,
    });
    const payload = {
      status: "complete",
      generatedAt: new Date().toISOString(),
      report: presentation,
      donorDefinition: getPublicDonorDefinition(donorConfiguration),
      configurationFingerprint: getAlumniDonorConfigurationFingerprint(donorConfiguration),
      ...directTotals,
    };
    await saveReportSnapshot(ALUMNI_FAMILY_ENGAGEMENT_CACHE_KEY, payload);

    const publicPayload = attachReportPresentation({
      cachedPayload: payload,
      donorConfiguration,
      presentation,
      countRows,
    });
    return Response.json(publicPayload, { headers: getReportCacheHeaders("refresh") });
  } catch (error) {
    console.error("Alumni & Family Engagement report error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not refresh the Alumni & Family Engagement report.",
      },
      { status: 500 },
    );
  }
}
