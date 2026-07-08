import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";

const CONSTITUENT_SUMMARY_CACHE_TTL_MS = 10 * 60 * 1000;

function isFreshSummaryCache(cachedAt) {
  if (!cachedAt) return false;
  const cachedTime = new Date(cachedAt).getTime();
  if (!Number.isFinite(cachedTime)) return false;
  return Date.now() - cachedTime <= CONSTITUENT_SUMMARY_CACHE_TTL_MS;
}

function buildSummaryCacheKey({
  constituentId,
  lookupId,
  recordId,
  name,
  includeInactive,
}) {
  return [
    "constituent-summary-v2",
    String(constituentId || "").trim(),
    String(lookupId || "").trim(),
    String(recordId || "").trim(),
    String(name || "").trim().toLowerCase(),
    includeInactive ? "include-inactive" : "active-only",
  ].join("|");
}

async function getCachedSummary({ workspaceUserId, authUserId, cacheKey }) {
  if (!workspaceUserId || !authUserId || !cacheKey) return null;

  const rows = await sql`
    SELECT payload, updated_at
    FROM blackbaud_constituent_summary_cache
    WHERE workspace_user_id = ${workspaceUserId}
      AND auth_user_id = ${authUserId}
      AND cache_key = ${cacheKey}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row?.payload || !isFreshSummaryCache(row.updated_at)) return null;
  return row.payload;
}

async function saveCachedSummary({
  workspaceUserId,
  authUserId,
  cacheKey,
  constituentId,
  payload,
}) {
  if (!workspaceUserId || !authUserId || !cacheKey || !constituentId || !payload) {
    return;
  }

  await sql`
    INSERT INTO blackbaud_constituent_summary_cache (
      workspace_user_id,
      auth_user_id,
      cache_key,
      constituent_id,
      payload,
      updated_at
    )
    VALUES (
      ${workspaceUserId},
      ${authUserId},
      ${cacheKey},
      ${String(constituentId)},
      ${JSON.stringify(payload)}::jsonb,
      NOW()
    )
    ON CONFLICT (workspace_user_id, auth_user_id, cache_key)
    DO UPDATE SET
      constituent_id = EXCLUDED.constituent_id,
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
}

function summaryResponse(payload, cacheStatus = "miss") {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "X-MGOGPT-NXT-Summary-Cache": cacheStatus,
    },
  });
}

async function tryFetchConstituentById({
  userId,
  authUserId,
  origin,
  candidateId,
}) {
  if (!candidateId) return null;

  try {
    const payload = await blackbaudApiFetch(
      `/constituent/v1/constituents/${encodeURIComponent(String(candidateId))}`,
      {
        userId,
        authUserId,
        origin,
      },
    );
    return payload || null;
  } catch (error) {
    return null;
  }
}

async function resolveConstituentPayload({
  userId,
  authUserId,
  origin,
  constituentId,
  lookupId,
  recordId,
  name,
}) {
  const direct = await tryFetchConstituentById({
    userId,
    authUserId,
    origin,
    candidateId: constituentId,
  });
  if (direct) {
    return direct;
  }

  const searchTerms = [lookupId, recordId, name]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const term of searchTerms) {
    try {
      const payload = await blackbaudApiFetch(
        "/constituent/v1/constituents/search",
        {
          userId,
          authUserId,
          origin,
          searchParams: {
            search_text: term,
            limit: 10,
          },
        },
      );

      const rows = Array.isArray(payload?.value)
        ? payload.value
        : Array.isArray(payload)
          ? payload
          : [];

      const normalizedTerm = term.toLowerCase();
      const exact =
        rows.find((item) => {
          const lookupMatches =
            String(item?.lookup_id || item?.lookupId || "")
              .trim()
              .toLowerCase() === normalizedTerm;
          const nameMatches =
            String(item?.name || "")
              .trim()
              .toLowerCase() === normalizedTerm;
          return lookupMatches || nameMatches;
        }) || rows[0];

      if (exact?.id) {
        const resolved = await tryFetchConstituentById({
          userId,
          authUserId,
          origin,
          candidateId: exact.id,
        });
        if (resolved) {
          return resolved;
        }
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error("Blackbaud constituent summary request failed");
}

function mapConstituent(constituent) {
  return {
    id: constituent?.id || null,
    lookupId: constituent?.lookup_id || null,
    name: constituent?.name || null,
    preferredName: constituent?.preferred_name || null,
    type: constituent?.type || null,
    email:
      constituent?.email?.primary === true ? constituent?.email?.address || null : null,
    phone:
      constituent?.phone?.primary === true ? constituent?.phone?.number || null : null,
    address:
      constituent?.address?.preferred === true
        ? constituent?.address?.formatted_address || null
        : null,
    requestsNoEmail: constituent?.requests_no_email ?? null,
    fundraiserStatus: constituent?.fundraiser_status || null,
    inactive: constituent?.inactive ?? null,
  };
}

function mapLifetimeGiving(lifetimeGiving) {
  return {
    constituentId: lifetimeGiving?.constituent_id || null,
    totalGiving: lifetimeGiving?.total_giving?.value ?? null,
    totalReceivedGiving: lifetimeGiving?.total_received_giving?.value ?? null,
    totalPledgeBalance: lifetimeGiving?.total_pledge_balance?.value ?? null,
    totalSoftCredits: lifetimeGiving?.total_soft_credits?.value ?? null,
    totalYearsGiven: lifetimeGiving?.total_years_given ?? null,
    consecutiveYearsGiven: lifetimeGiving?.consecutive_years_given ?? null,
  };
}

function mapFundraiserAssignment(assignment) {
  return {
    assignmentId: assignment?.id || null,
    fundraiserId: assignment?.fundraiser_id || null,
    fundraiserName:
      assignment?.fundraiser_name ||
      assignment?.fundraiser?.name ||
      assignment?.solicitor_name ||
      assignment?.solicitor?.name ||
      null,
    amount: assignment?.amount?.value ?? null,
    appealId: assignment?.appeal_id || null,
    campaignId: assignment?.campaign_id || null,
    fundId: assignment?.fund_id || null,
    start: assignment?.start || null,
    end: assignment?.end || null,
    type: assignment?.type || null,
  };
}

function mapPrimaryBusinessRelationship(relationships) {
  const rows = Array.isArray(relationships?.value)
    ? relationships.value
    : Array.isArray(relationships)
      ? relationships
      : [];

  const primaryBusiness = rows.find((relationship) => relationship?.is_primary_business);
  if (!primaryBusiness) {
    return null;
  }

  return {
    relationshipId: primaryBusiness?.id || null,
    organizationConstituentId: primaryBusiness?.relation_id || null,
    organizationName: primaryBusiness?.name || null,
    position: primaryBusiness?.position || null,
    type: primaryBusiness?.type || null,
    start: primaryBusiness?.start || null,
    end: primaryBusiness?.end || null,
  };
}

function mapJacksonvilleUniversityEducation(educationPayload) {
  const rows = Array.isArray(educationPayload?.value)
    ? educationPayload.value
    : Array.isArray(educationPayload)
      ? educationPayload
      : [];

  return rows
    .filter((education) => {
      const schoolName = String(
        education?.school || education?.school_name || education?.name || "",
      )
        .trim()
        .toLowerCase();

      return schoolName === "jacksonville university";
    })
    .map((education) => ({
      educationId: education?.id || null,
      school: education?.school || education?.school_name || education?.name || null,
      classOf:
        education?.class_of ||
        education?.class_year ||
        education?.year ||
        education?.date_graduated ||
        null,
      majors: Array.isArray(education?.majors)
        ? education.majors
            .map((major) =>
              typeof major === "string"
                ? major
                : major?.major || major?.name || null,
            )
            .filter(Boolean)
        : [education?.major, education?.major_1, education?.major_2].filter(Boolean),
      degrees: Array.isArray(education?.degrees)
        ? education.degrees
            .map((degree) =>
              typeof degree === "string"
                ? degree
                : degree?.degree || degree?.name || degree?.abbreviation || null,
            )
            .filter(Boolean)
        : [
            education?.degree,
            education?.degree_name,
            education?.degree_1,
            education?.degree_2,
          ].filter(Boolean),
      attribution:
        education?.education_attribution ||
        education?.attribution ||
        education?.attribute ||
        null,
      sport:
        education?.sport ||
        education?.sport_description ||
        education?.description ||
        education?.details ||
        null,
    }));
}

function firstDefined(source, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => {
      if (current == null) return undefined;
      return current[key];
    }, source);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLabel(value) {
  return compactWhitespace(value).toLowerCase();
}

function normalizeConstituencyLabel(value) {
  return normalizeLabel(value)
    .replace(/[’']/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function constituencyLabelMatches(label, target) {
  const normalizedLabel = normalizeConstituencyLabel(label);
  const normalizedTarget = normalizeConstituencyLabel(target);
  if (!normalizedLabel || !normalizedTarget) return false;
  return (
    normalizedLabel === normalizedTarget ||
    normalizedLabel.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedLabel)
  );
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function formatWholeYearsSince(dateValue) {
  if (!dateValue) return null;
  const timestamp = new Date(dateValue).getTime();
  if (Number.isNaN(timestamp)) return null;

  const years = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24 * 365.25)),
  );

  return years;
}

function formatDateLong(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatList(items) {
  const values = items.filter(Boolean);
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function formatSentenceList(items) {
  const values = items.filter(Boolean);
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function getDisplayName(constituent) {
  return (
    compactWhitespace(constituent?.preferred_name) ||
    compactWhitespace(constituent?.name) ||
    "This constituent"
  );
}

function extractConstituencyYear(value) {
  const text = compactWhitespace(value);
  if (!text) return null;
  const explicitYear = text.match(/\b(19|20)\d{2}\b/);
  if (explicitYear) return explicitYear[0];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return String(parsed.getFullYear());
}

function getConstituentGender(constituent) {
  const rawGender = firstDefined(constituent, [
    "gender",
    "gender.description",
    "gender.name",
    "gender_identity",
    "gender_identity.description",
    "gender_description",
    "sex",
  ]);
  const gender = normalizeLabel(rawGender);
  if (!gender) return null;
  if (gender === "f" || gender.includes("female") || gender.includes("woman")) {
    return "female";
  }
  if (gender === "m" || gender.includes("male") || gender.includes("man")) {
    return "male";
  }
  return null;
}

function getAlumniNoun(constituent) {
  const gender = getConstituentGender(constituent);
  if (gender === "female") return "alumna";
  if (gender === "male") return "alumnus";
  return "alum";
}

function firstConstituencyLabel(item) {
  return compactWhitespace(
    item?.description ||
      item?.name ||
      item?.constituency ||
      item?.code ||
      item?.type ||
      "",
  );
}

function mapConstituencyEntry(item) {
  const label = firstConstituencyLabel(item);
  if (!label) return null;

  return {
    label,
    normalized: normalizeConstituencyLabel(label),
    start: firstDefined(item, [
      "date_from",
      "dateFrom",
      "start",
      "start_date",
      "startDate",
      "from",
    ]),
    end: firstDefined(item, [
      "date_to",
      "dateTo",
      "end",
      "end_date",
      "endDate",
      "to",
    ]),
  };
}

function getConstituencyEntries(constituent, educationRecords) {
  const entries = [
    ...(Array.isArray(constituent?.constituencies)
      ? constituent.constituencies.map(mapConstituencyEntry)
      : []),
    ...(Array.isArray(constituent?.constituent_codes)
      ? constituent.constituent_codes.map(mapConstituencyEntry)
      : []),
  ].filter(Boolean);

  const normalized = new Set(entries.map((entry) => entry.normalized));
  const juDegrees = educationRecords.filter(
    (education) => Array.isArray(education?.degrees) && education.degrees.length > 0,
  );

  if (juDegrees.length > 0 && ![...normalized].some((value) => value.includes("alumni"))) {
    const hasBachelors = juDegrees.some((education) =>
      education.degrees.some((degree) =>
        /\b(ba|bs|bba|bfa|b\.a\.|b\.s\.)\b/i.test(String(degree || "")),
      ),
    );
    const hasGraduate = juDegrees.some((education) =>
      education.degrees.some((degree) =>
        /\b(ma|ms|mba|edd|phd|m\.a\.|m\.s\.)\b/i.test(String(degree || "")),
      ),
    );

    if (hasBachelors) {
      entries.push({
        label: "Alumni Bachelor's Degree",
        normalized: normalizeConstituencyLabel("Alumni Bachelor's Degree"),
        start: null,
        end: null,
      });
    } else if (hasGraduate) {
      entries.push({
        label: "Alumni Graduate Degree",
        normalized: normalizeConstituencyLabel("Alumni Graduate Degree"),
        start: null,
        end: null,
      });
    } else {
      entries.push({
        label: "Alumni Non-Graduate",
        normalized: normalizeConstituencyLabel("Alumni Non-Graduate"),
        start: null,
        end: null,
      });
    }
  }

  const seen = new Set();
  return entries.filter((entry) => {
    const key = [entry.normalized, entry.start || "", entry.end || ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getConstituencyLabels(constituent, educationRecords) {
  return [...new Set(getConstituencyEntries(constituent, educationRecords).map((entry) => entry.label))];
}

const PRIMARY_IDENTITY_HIERARCHY = [
  "Trustee",
  "Alumni Bachelor's Degree",
  "Alumni Graduate Degree",
  "Parent – Current",
  "Employee",
  "Alumni Non-Graduate",
  "Parent – Former",
  "Employee – Former",
  "Parent Non-Graduate",
];

function resolvePrimaryIdentity(constituencyLabels) {
  const normalized = constituencyLabels.map((label) => ({
    label,
    normalized: normalizeLabel(label),
  }));

  for (const target of PRIMARY_IDENTITY_HIERARCHY) {
    const normalizedTarget = normalizeLabel(target);
    const match = normalized.find(({ normalized: label }) =>
      label.includes(normalizedTarget.replace(/[–-]/g, "")) ||
      label.includes(normalizedTarget) ||
      normalizedTarget.includes(label),
    );
    if (match) return target;
  }

  return null;
}

function getSolicitorCoverage(assignments) {
  const coverage = {
    lead: [],
    secondary: [],
    presidential: [],
    athletics: [],
  };

  for (const assignment of assignments) {
    const type = compactWhitespace(assignment?.type);
    if (!type) continue;
    const normalized = normalizeLabel(type);
    const entry = {
      type,
      fundraiserId: assignment?.fundraiserId || null,
      fundraiserName: compactWhitespace(assignment?.fundraiserName) || null,
    };

    if (normalized.includes("lead solicitor") || normalized.includes("primary solicitor")) {
      coverage.lead.push(entry);
    } else if (normalized.includes("secondary solicitor")) {
      coverage.secondary.push(entry);
    } else if (normalized.includes("presidential")) {
      coverage.presidential.push(entry);
    } else if (normalized.includes("athletics")) {
      coverage.athletics.push(entry);
    }
  }

  return coverage;
}

function buildSolicitorCoverageSentence(assignments, workspaceUser) {
  const coverage = getSolicitorCoverage(assignments);
  const workspaceName = compactWhitespace(
    workspaceUser?.name || workspaceUser?.full_name || workspaceUser?.display_name,
  );
  const workspaceConstituentId = String(
    workspaceUser?.blackbaud_constituent_id || "",
  ).trim();

  const describeRole = (entries, label) => {
    if (!entries.length) return null;
    const matchingEntry =
      entries.find((entry) => {
        const fundraiserId = String(entry?.fundraiserId || "").trim();
        if (workspaceConstituentId && fundraiserId && fundraiserId === workspaceConstituentId) {
          return true;
        }
        return (
          workspaceName &&
          entry?.fundraiserName &&
          normalizeLabel(entry.fundraiserName) === normalizeLabel(workspaceName)
        );
      }) || entries[0];

    if (!matchingEntry) return null;
    const isWorkspaceMatch =
      (workspaceConstituentId &&
        String(matchingEntry?.fundraiserId || "").trim() === workspaceConstituentId) ||
      (workspaceName &&
        matchingEntry?.fundraiserName &&
        normalizeLabel(matchingEntry.fundraiserName) === normalizeLabel(workspaceName));

    if (isWorkspaceMatch) {
      return `you are the ${label}`;
    }
    if (matchingEntry.fundraiserName) {
      return `${matchingEntry.fundraiserName} is the ${label}`;
    }
    return `there is a ${label}`;
  };

  const parts = [
    describeRole(coverage.lead, "lead solicitor"),
    describeRole(coverage.secondary, "secondary solicitor"),
    describeRole(coverage.presidential, "presidential solicitor"),
    describeRole(coverage.athletics, "athletics solicitor"),
  ].filter(Boolean);

  if (!parts.length) return null;
  const [first, ...rest] = parts;
  if (!rest.length) {
    return `${first.charAt(0).toUpperCase()}${first.slice(1)}.`;
  }
  return `${first.charAt(0).toUpperCase()}${first.slice(1)}. ${rest
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}.`)
    .join(" ")}`;
}

function buildGivingSentence({ name, lifetimeGiving, lastGiftDate }) {
  const totalGivingValue = Number(lifetimeGiving?.totalGiving);
  const consecutiveYears = lifetimeGiving?.consecutiveYearsGiven ?? null;
  const yearsSinceLastGift = formatWholeYearsSince(lastGiftDate);
  const lifetime = totalGivingValue > 0 ? formatCurrency(totalGivingValue) : null;

  if (!lifetime && !consecutiveYears && yearsSinceLastGift == null) {
    return null;
  }

  const openingParts = [];
  if (consecutiveYears) {
    openingParts.push(
      `has given consistently over ${consecutiveYears} consecutive year${
        consecutiveYears === 1 ? "" : "s"
      }`,
    );
  } else if (lifetime) {
    openingParts.push("has meaningful giving on record");
  }

  if (lifetime) {
    openingParts.push(`with lifetime support totaling ${lifetime}`);
  }

  let sentence = openingParts.length
    ? `${openingParts.join(" ")}`
    : `has lifetime support totaling ${lifetime}`;

  sentence = `${name} ${sentence}`;

  sentence += ".";

  if (!consecutiveYears && !lifetime && yearsSinceLastGift !== null) {
    sentence +=
      yearsSinceLastGift === 0
        ? " The most recent gift was made within the past year."
        : ` The last gift was ${yearsSinceLastGift} year${
            yearsSinceLastGift === 1 ? "" : "s"
          } ago.`;
  }

  return sentence;
}

function buildPipelineSentence(proposals, assignments, workspaceUser) {
  const parts = [];

  if (proposals.length) {
    const proposalSummary = proposals
      .slice(0, 2)
      .map((proposal) => {
        const name = compactWhitespace(
          proposal.opportunity_title || proposal.prospect_name,
        );
        const stage = compactWhitespace(proposal.current_stage || proposal.ask_type);
        const amount = formatCurrency(
          proposal.estimated_amount || proposal.ask_amount,
        );
        const fy = compactWhitespace(proposal.expected_close_fy);
        return [name, amount, stage, fy].filter(Boolean).join(", ");
      })
      .filter(Boolean);

    if (proposalSummary.length) {
      parts.push(`Current pipeline includes ${proposalSummary.join("; ")}.`);
    }
  }

  const solicitorSentence = buildSolicitorCoverageSentence(assignments, workspaceUser);
  if (solicitorSentence) {
    parts.push(solicitorSentence);
  }

  return parts.length ? parts.join(" ") : null;
}

function findConstituencyEntry(entries, target) {
  return entries.find((entry) => constituencyLabelMatches(entry.label, target)) || null;
}

function isActiveConstituency(entry) {
  return Boolean(entry) && !entry.end;
}

function formatRelationshipSentence(name, phrases) {
  const values = phrases.filter(Boolean);
  if (!values.length) return null;
  return `${name} ${formatSentenceList(values)}.`;
}

export function buildIdentitySentence({
  constituent,
  constituencyEntries,
  constituencyLabels,
  educationRecords,
  spouseSummary,
  primaryBusinessRelationship,
  lifetimeGiving,
}) {
  const name = getDisplayName(constituent);
  const businessOrg = normalizeLabel(primaryBusinessRelationship?.organizationName);
  const entries =
    Array.isArray(constituencyEntries) && constituencyEntries.length
      ? constituencyEntries
      : getConstituencyEntries(constituent, educationRecords);
  const labels =
    Array.isArray(constituencyLabels) && constituencyLabels.length
      ? constituencyLabels
      : entries.map((entry) => entry.label);
  const alumnNoun = getAlumniNoun(constituent);
  const hasBachelorAlumni = entries.some((entry) =>
    constituencyLabelMatches(entry.label, "Alumni Bachelor's Degree"),
  );
  const hasGraduateAlumni = entries.some((entry) =>
    constituencyLabelMatches(entry.label, "Alumni Graduate Degree"),
  );
  const hasOrthodonticsAlumni = entries.some((entry) =>
    normalizeConstituencyLabel(entry.label).includes("orthodontics"),
  );
  const activeTrustee = entries.find(
    (entry) =>
      constituencyLabelMatches(entry.label, "Trustee") &&
      !normalizeConstituencyLabel(entry.label).includes("former") &&
      isActiveConstituency(entry),
  );
  const formerTrustee = entries.find((entry) => {
    const normalized = normalizeConstituencyLabel(entry.label);
    return (
      (constituencyLabelMatches(entry.label, "Former Trustee") ||
        normalized.includes("trustee former")) &&
      entry.end
    );
  });
  const activeEmployee =
    entries.find(
      (entry) =>
        constituencyLabelMatches(entry.label, "Employee") &&
        !normalizeConstituencyLabel(entry.label).includes("former") &&
        isActiveConstituency(entry),
    ) ||
    (businessOrg === "jacksonville university"
      ? { label: "Employee", normalized: "employee", start: null, end: null }
      : null);
  const formerEmployee = entries.find((entry) => {
    const normalized = normalizeConstituencyLabel(entry.label);
    return (
      normalized.includes("employee former") ||
      constituencyLabelMatches(entry.label, "Employee - Former") ||
      (constituencyLabelMatches(entry.label, "Employee") && Boolean(entry.end))
    );
  });
  const currentParent = findConstituencyEntry(entries, "Parent - Current");
  const formerParent = findConstituencyEntry(entries, "Parent - Former");
  const friend = findConstituencyEntry(entries, "Friend");
  const totalGiving = Number(lifetimeGiving?.totalGiving || 0);
  const hasGiving = Number.isFinite(totalGiving) && totalGiving > 0;
  const varsitySports = educationRecords
    .filter((education) => normalizeLabel(education?.attribution) === "varsity sports")
    .map((education) => compactWhitespace(education?.sport))
    .filter(Boolean);

  const phrases = [];

  if (activeTrustee) {
    phrases.push("currently serves on Jacksonville University's Board of Trustees");
  } else if (formerTrustee) {
    phrases.push("is a member of JU's Society of Trustees");
  }

  if (educationRecords.length >= 2) {
    phrases.push(
      "is a Double Dolphin, having earned both undergraduate and graduate degrees from JU",
    );
  } else if (hasBachelorAlumni && hasGraduateAlumni) {
    phrases.push(
      "is a Double Dolphin, having earned both undergraduate and graduate degrees from JU",
    );
  } else if (hasGraduateAlumni) {
    phrases.push(`is a JU graduate ${alumnNoun}`);
  } else if (hasBachelorAlumni) {
    phrases.push(`is a JU ${alumnNoun}`);
  } else if (hasOrthodonticsAlumni) {
    phrases.push(`is a JU ${alumnNoun}`);
  }

  if (spouseSummary?.isAlumniSpouse) {
    phrases.push("is part of a Dolphin Couple");
  }
  if (varsitySports.length) {
    phrases.push(`has a varsity connection in ${formatSentenceList(varsitySports)}`);
  }

  if (activeEmployee) {
    const role = compactWhitespace(primaryBusinessRelationship?.position);
    phrases.push(
      role
        ? `is a current JU employee, serving as ${role.toLowerCase()}`
        : "is a current JU employee",
    );
  } else if (formerEmployee) {
    phrases.push("previously worked at JU");
  }

  if (currentParent) {
    const expectedYear = extractConstituencyYear(currentParent.end);
    phrases.push(
      expectedYear
        ? `is the parent of a current JU student expected to graduate in ${expectedYear}`
        : "is the parent of a current JU student",
    );
  } else if (formerParent) {
    const graduationYear = extractConstituencyYear(formerParent.start);
    phrases.push(
      graduationYear
        ? `is the parent of a JU graduate from ${graduationYear}`
        : "is the parent of a JU graduate",
    );
  }

  if (friend) {
    phrases.push(hasGiving ? "is a donor and supporter of JU" : "is currently a prospect");
  }

  return formatRelationshipSentence(name, phrases);
}

function buildBusinessSentence(name, primaryBusinessRelationship) {
  if (!primaryBusinessRelationship?.organizationName && !primaryBusinessRelationship?.position) {
    return null;
  }

  const role = compactWhitespace(primaryBusinessRelationship.position);
  const organization = compactWhitespace(
    primaryBusinessRelationship.organizationName,
  );
  const isJUEmployer = normalizeLabel(organization) === "jacksonville university";

  if (organization && role) {
    if (!role || !organization) return null;
    if (isJUEmployer) {
      return `${name} serves as ${role.toLowerCase()}.`;
    }
    const article = /^[aeiou]/i.test(role) ? "an" : "a";
    return `${name} is ${article} ${role.toLowerCase()} at ${organization}.`;
  }

  if (role) {
    return `${name} serves as ${
      /^[aeiou]/i.test(role) ? "an" : "a"
    } ${role.toLowerCase()}.`;
  }

  return `${name} is connected with ${organization}.`;
}

function buildFamilySentence(familySummary) {
  if (!familySummary?.children?.length) return null;

  const groupedChildren = familySummary.children.reduce(
    (accumulator, child) => {
      const childName = compactWhitespace(child.name);
      if (!childName || !child.constituencyLabels?.length) return accumulator;
      const relationshipType = normalizeLabel(child.relationshipType);
      const constituencyText = formatSentenceList(child.constituencyLabels);
      const childDescriptor = constituencyText
        ? `${childName} (${constituencyText})`
        : childName;
      if (relationshipType === "son") {
        accumulator.sons.push(childDescriptor);
      } else if (relationshipType === "daughter") {
        accumulator.daughters.push(childDescriptor);
      } else {
        accumulator.children.push(childDescriptor);
      }
      return accumulator;
    },
    { sons: [], daughters: [], children: [] },
  );

  const familyBits = [];
  if (groupedChildren.sons.length) {
    familyBits.push(
      `${groupedChildren.sons.length === 1 ? "son" : "sons"} ${formatSentenceList(groupedChildren.sons)}`,
    );
  }
  if (groupedChildren.daughters.length) {
    familyBits.push(
      `${groupedChildren.daughters.length === 1 ? "daughter" : "daughters"} ${formatSentenceList(groupedChildren.daughters)}`,
    );
  }
  if (groupedChildren.children.length) {
    familyBits.push(formatSentenceList(groupedChildren.children));
  }

  if (!familyBits.length) return null;
  return `Additional JU connections include ${formatSentenceList(familyBits)}.`;
}

function buildEngagementSentence(eventSummary) {
  if (!eventSummary?.length) return null;
  const items = eventSummary
    .map((event) => {
      const name = compactWhitespace(event?.name);
      const date = formatDateLong(event?.date);
      return [name, date].filter(Boolean).join(" on ");
    })
    .filter(Boolean);

  if (!items.length) return null;
  return `Recent attended events include ${items.join("; ")}.`;
}

async function buildSpouseAndFamilySummary({
  userId,
  authUserId,
  origin,
  relationshipsPayload,
  educationRecords,
}) {
  const rows = Array.isArray(relationshipsPayload?.value)
    ? relationshipsPayload.value
    : Array.isArray(relationshipsPayload)
      ? relationshipsPayload
      : [];

  const normalizedRows = rows.map((relationship) => ({
    raw: relationship,
    type: normalizeLabel(
      relationship?.type ||
        relationship?.reciprocal_type ||
        relationship?.relation_type ||
        relationship?.relationship ||
        "",
    ),
    name: compactWhitespace(relationship?.name || relationship?.relation_name),
    relationId:
      relationship?.relation_id ||
      relationship?.related_constituent_id ||
      relationship?.constituent_id ||
      null,
  }));

  const spouse = normalizedRows.find(
    (relationship) => relationship.type.includes("spouse") || relationship.type.includes("husband") || relationship.type.includes("wife"),
  );

  const spouseSummary = {
    isAlumniSpouse: false,
    name: spouse?.name || null,
  };

  if (spouse?.relationId) {
    const spousePayload = await tryFetchConstituentById({
      userId,
      authUserId,
      origin,
      candidateId: spouse.relationId,
    }).catch(() => null);
    if (spousePayload) {
      const spouseConstituencies = getConstituencyLabels(spousePayload, []);
      spouseSummary.isAlumniSpouse = spouseConstituencies.some((label) =>
        normalizeLabel(label).includes("alumni"),
      );
    }
  }

  const childRows = normalizedRows.filter(
    (relationship) => relationship.type === "son" || relationship.type === "daughter",
  );

  const children = await Promise.all(
    childRows.map(async (child) => {
      let childConstituencyLabel = null;
      let childConstituencyLabels = [];
      if (child.relationId) {
        const childPayload = await tryFetchConstituentById({
          userId,
          authUserId,
          origin,
          candidateId: child.relationId,
        }).catch(() => null);
        if (childPayload) {
          childConstituencyLabels = getConstituencyLabels(childPayload, []);
          childConstituencyLabel = resolvePrimaryIdentity(childConstituencyLabels);
        }
      }

      return {
        name: child.name || "their child",
        childConstituencyLabel,
        constituencyLabels: childConstituencyLabels,
        relationshipType: child.type || null,
      };
    }),
  );

  return {
    spouse: spouseSummary,
    children: children.filter((child) => child.name),
  };
}

async function loadProposalSummary({ workspaceUserId, constituentId, currentFYNumber }) {
  const proposals = await sql`
    SELECT
      p.prospect_name,
      p.ask_amount,
      p.expected_close_fy,
      po.opportunity_title,
      po.current_stage,
      po.ask_type,
      po.estimated_amount
    FROM prospects p
    LEFT JOIN constituents c ON c.id = p.constituent_id
    LEFT JOIN prospect_opportunities po ON po.prospect_id = p.id
    WHERE p.user_id = ${workspaceUserId}
      AND COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) = ${constituentId}
      AND COALESCE(po.opportunity_status, 'Active') = 'Active'
      AND LOWER(COALESCE(po.current_stage, po.ask_type, '')) IN ('solicitation', 'cultivation', 'solicitation - verbal')
      AND CAST(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(po.expected_close_fy, p.expected_close_fy, ''), '[^0-9]', '', 'g'), 2), '') AS INTEGER) >= ${currentFYNumber}
    ORDER BY
      CAST(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(po.expected_close_fy, p.expected_close_fy, ''), '[^0-9]', '', 'g'), 2), '') AS INTEGER) ASC,
      COALESCE(po.estimated_amount, p.ask_amount, 0) DESC
    LIMIT 3
  `;

  return proposals;
}

function buildProspectSummaryNarrative({
  constituent,
  educationRecords,
  lifetimeGiving,
  primaryBusinessRelationship,
  fundraiserAssignments,
  proposalSummary,
  familySummary,
  eventSummary,
  lastGiftDate,
  workspaceUser,
}) {
  const constituencyEntries = getConstituencyEntries(constituent, educationRecords);
  const constituencyLabels = getConstituencyLabels(constituent, educationRecords);
  const name = getDisplayName(constituent);
  const identitySentence = buildIdentitySentence({
    constituent,
    constituencyEntries,
    constituencyLabels,
    educationRecords,
    spouseSummary: familySummary?.spouse,
    primaryBusinessRelationship,
    lifetimeGiving,
  });

  const businessSentence =
    normalizeLabel(primaryBusinessRelationship?.organizationName) === "jacksonville university"
      ? null
      : buildBusinessSentence(name, primaryBusinessRelationship);
  const givingSentence = buildGivingSentence({
    name,
    lifetimeGiving,
    lastGiftDate,
  });
  const pipelineSentence = buildPipelineSentence(
    proposalSummary,
    fundraiserAssignments,
    workspaceUser,
  );
  const familySentence = buildFamilySentence(familySummary);
  const engagementSentence = buildEngagementSentence(eventSummary);

  return [
    identitySentence,
    businessSentence,
    givingSentence,
    pipelineSentence,
    familySentence,
    engagementSentence,
  ]
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

async function loadBlackbaudSection(label, requestFactory) {
  try {
    const payload = await requestFactory();
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : `Failed to fetch ${label} from Blackbaud`,
    };
  }
}

async function loadOptionalSection(label, requestFactory) {
  try {
    const payload = await requestFactory();
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : `Failed to build ${label}`,
    };
  }
}

export async function GET(request, { params }) {
  const session = await auth(request);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppSchema();

  const origin = new URL(request.url).origin;
  const configIssues = getBlackbaudConfigIssues(origin);
  if (configIssues.length > 0) {
    return Response.json(
      {
        error: "Blackbaud is not configured",
        configIssues,
      },
      { status: 400 },
    );
  }

  const constituentId = String(params?.constituentId || "").trim();
  if (!constituentId) {
    return Response.json(
      { error: "A Blackbaud constituent ID is required" },
      { status: 400 },
    );
  }

  const includeInactive =
    new URL(request.url).searchParams.get("include_inactive") === "true";
  const includeRaw = new URL(request.url).searchParams.get("raw") === "true";
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  const lookupId = new URL(request.url).searchParams.get("lookupId")?.trim() || "";
  const recordId = new URL(request.url).searchParams.get("recordId")?.trim() || "";
  const name = new URL(request.url).searchParams.get("name")?.trim() || "";

  try {
    const { workspaceUser, sessionUser, isActing } = await getWorkspaceUser(session, request);
    const user = workspaceUser;
    const authUserId = isActing ? sessionUser.id : workspaceUser.id;
    const cacheKey = buildSummaryCacheKey({
      constituentId,
      lookupId,
      recordId,
      name,
      includeInactive,
    });

    if (!includeRaw && !forceRefresh) {
      const cachedSummary = await getCachedSummary({
        workspaceUserId: user.id,
        authUserId,
        cacheKey,
      });
      if (cachedSummary) {
        return summaryResponse(cachedSummary, "hit");
      }
    }

    const constituentPayload = await resolveConstituentPayload({
      userId: user.id,
      authUserId,
      origin,
      constituentId,
      lookupId,
      recordId,
      name,
    });
    const resolvedConstituentId = String(constituentPayload?.id || constituentId).trim();

    const [
      lifetimeGivingResult,
      fundraiserAssignmentsResult,
      relationshipsResult,
      educationResult,
    ] =
      await Promise.all([
        loadBlackbaudSection("lifetimeGiving", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(
              resolvedConstituentId,
            )}/givingsummary/lifetimegiving`,
            {
              userId: user.id,
              authUserId,
              origin,
            },
          ),
        ),
        loadBlackbaudSection("fundraiserAssignments", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(
              resolvedConstituentId,
            )}/fundraiserassignments`,
            {
              userId: user.id,
              authUserId,
              origin,
              searchParams: {
                include_inactive: includeInactive,
              },
            },
          ),
        ),
        loadBlackbaudSection("relationships", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(resolvedConstituentId)}/relationships`,
            {
              userId: user.id,
              authUserId,
              origin,
            },
          ),
        ),
        loadBlackbaudSection("education", () =>
          blackbaudApiFetch(
            `/constituent/v1/constituents/${encodeURIComponent(resolvedConstituentId)}/educations`,
            {
              userId: user.id,
              authUserId,
              origin,
            },
          ),
        ),
      ]);

    const constituent = constituentPayload;
    const lifetimeGiving = lifetimeGivingResult.ok
      ? lifetimeGivingResult.payload
      : null;
    const fundraiserAssignments = fundraiserAssignmentsResult.ok
      ? fundraiserAssignmentsResult.payload
      : null;
    const relationships = relationshipsResult.ok ? relationshipsResult.payload : null;
    const education = educationResult.ok ? educationResult.payload : null;

    const assignments = Array.isArray(fundraiserAssignments?.value)
      ? fundraiserAssignments.value
      : [];
    const educationRecords = mapJacksonvilleUniversityEducation(education);
    const currentYear = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
    const currentFYNumber = Number(String(currentYear).slice(-2));
    const lastGiftDate = firstDefined(lifetimeGiving, [
      "last_gift_date",
      "date_of_last_gift",
      "last_gift.date",
      "most_recent_gift_date",
    ]);
    const proposalSummaryResult = await loadOptionalSection("proposalSummary", () =>
      loadProposalSummary({
        workspaceUserId: user.id,
        constituentId: resolvedConstituentId,
        currentFYNumber,
      }),
    );
    const familySummaryResult = await loadOptionalSection("familySummary", () =>
      buildSpouseAndFamilySummary({
        userId: user.id,
        authUserId,
        origin,
        relationshipsPayload: relationships,
        educationRecords,
      }),
    );
    const proposalSummary = proposalSummaryResult.ok ? proposalSummaryResult.payload : [];
    const familySummary = familySummaryResult.ok
      ? familySummaryResult.payload
      : { spouse: null, children: [] };
    const eventSummary = [];
    const mappedConstituent = mapConstituent(constituent);
    const mappedLifetimeGiving = mapLifetimeGiving(lifetimeGiving);
    const mappedAssignments = assignments.map(mapFundraiserAssignment);
    const mappedPrimaryBusinessRelationship = mapPrimaryBusinessRelationship(relationships);
    const prospectSummaryNarrative = buildProspectSummaryNarrative({
      constituent,
      educationRecords,
      lifetimeGiving: mappedLifetimeGiving,
      primaryBusinessRelationship: mappedPrimaryBusinessRelationship,
      fundraiserAssignments: mappedAssignments,
      proposalSummary,
      familySummary,
      eventSummary,
      lastGiftDate,
      workspaceUser,
    });

    const responsePayload = {
      constituentId,
      includeInactive,
      mapped: {
        constituent: mappedConstituent,
        lifetimeGiving: mappedLifetimeGiving,
        fundraiserAssignments: mappedAssignments,
        primaryBusinessRelationship: mappedPrimaryBusinessRelationship,
        jacksonvilleUniversityEducation: educationRecords,
        proposalSummary,
        familySummary,
        eventSummary,
        prospectSummaryNarrative,
      },
      warnings: {
        lifetimeGiving: lifetimeGivingResult.ok ? null : lifetimeGivingResult.error,
        fundraiserAssignments: fundraiserAssignmentsResult.ok
          ? null
          : fundraiserAssignmentsResult.error,
        relationships: relationshipsResult.ok ? null : relationshipsResult.error,
        education: educationResult.ok ? null : educationResult.error,
        proposalSummary: proposalSummaryResult.ok ? null : proposalSummaryResult.error,
        familySummary: familySummaryResult.ok ? null : familySummaryResult.error,
      },
      ...(includeRaw
        ? {
            raw: {
              constituent,
              lifetimeGiving,
              fundraiserAssignments,
              relationships,
              education,
            },
          }
        : {}),
    };

    if (!includeRaw) {
      await saveCachedSummary({
        workspaceUserId: user.id,
        authUserId,
        cacheKey,
        constituentId: resolvedConstituentId,
        payload: responsePayload,
      }).catch((cacheError) => {
        console.error("Blackbaud constituent summary cache write error:", cacheError);
      });
    }

    return summaryResponse(responsePayload, "miss");
  } catch (error) {
    console.error("Blackbaud constituent summary error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch Blackbaud constituent summary",
      },
      { status: 500 },
    );
  }
}
