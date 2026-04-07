import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";

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

function getConstituencyLabels(constituent, educationRecords) {
  const rawValues = [
    constituent?.type,
    ...(Array.isArray(constituent?.constituencies)
      ? constituent.constituencies.flatMap((item) => [
          item?.description,
          item?.name,
          item?.constituency,
          item?.type,
        ])
      : []),
    ...(Array.isArray(constituent?.constituent_codes)
      ? constituent.constituent_codes.flatMap((item) => [
          item?.description,
          item?.name,
          item?.constituency,
          item?.code,
        ])
      : []),
  ]
    .map((value) => compactWhitespace(value))
    .filter(Boolean);

  const labels = [...new Set(rawValues)];
  const normalized = new Set(labels.map(normalizeLabel));
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
      labels.push("Alumni Bachelor's Degree");
    } else if (hasGraduate) {
      labels.push("Alumni Graduate Degree");
    } else {
      labels.push("Alumni Non-Graduate");
    }
  }

  return [...new Set(labels)];
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

    if (normalized.includes("lead solicitor") || normalized.includes("primary solicitor")) {
      coverage.lead.push(type);
    } else if (normalized.includes("secondary solicitor")) {
      coverage.secondary.push(type);
    } else if (normalized.includes("presidential")) {
      coverage.presidential.push(type);
    } else if (normalized.includes("athletics")) {
      coverage.athletics.push(type);
    }
  }

  return coverage;
}

function buildSolicitorCoverageSentence(assignments) {
  const coverage = getSolicitorCoverage(assignments);
  const parts = [];

  if (coverage.lead.length) parts.push("lead solicitor coverage");
  if (coverage.secondary.length) parts.push("secondary solicitor coverage");
  if (coverage.presidential.length) parts.push("presidential coverage");
  if (coverage.athletics.length) parts.push("athletics coverage");

  if (!parts.length) return null;
  return `Solicitor coverage includes ${formatList(parts)}.`;
}

function buildGivingSentence({ lifetimeGiving, lastGiftDate }) {
  const parts = [];
  const lifetime = formatCurrency(lifetimeGiving?.totalGiving);
  const received = formatCurrency(lifetimeGiving?.totalReceivedGiving);
  const pledgeBalance = formatCurrency(lifetimeGiving?.totalPledgeBalance);
  const softCredits = formatCurrency(lifetimeGiving?.totalSoftCredits);
  const consecutiveYears = lifetimeGiving?.consecutiveYearsGiven ?? null;
  const yearsSinceLastGift = formatWholeYearsSince(lastGiftDate);

  if (lifetime) {
    const supportParts = [];
    if (received) supportParts.push(`${received} in cash and gifts received`);
    if (pledgeBalance) supportParts.push(`${pledgeBalance} in pledge balance`);
    const supportMix = supportParts.length
      ? `, including ${formatList(supportParts)}`
      : "";
    parts.push(`Lifetime giving totals ${lifetime}${supportMix}.`);
  }

  if (consecutiveYears) {
    parts.push(
      `${consecutiveYears} consecutive year${consecutiveYears === 1 ? "" : "s"} of giving are on record, including soft credits.`,
    );
  }

  if (yearsSinceLastGift !== null) {
    parts.push(
      yearsSinceLastGift === 0
        ? "The last gift was made within the past year."
        : `${yearsSinceLastGift} year${yearsSinceLastGift === 1 ? "" : "s"} have passed since the last gift.`,
    );
  }

  if (softCredits && Number(lifetimeGiving?.totalSoftCredits) > 0) {
    parts.push(`Soft-credit support totals ${softCredits}.`);
  }

  return parts.length ? parts.join(" ") : null;
}

function buildPipelineSentence(proposals, assignments) {
  const parts = [];

  if (proposals.length) {
    const proposalSummary = proposals
      .map((proposal) => {
        const amount = formatCurrency(proposal.estimated_amount || proposal.ask_amount);
        const fy = compactWhitespace(proposal.expected_close_fy);
        const stage = compactWhitespace(proposal.current_stage || proposal.ask_type);
        const name = compactWhitespace(proposal.opportunity_title || proposal.prospect_name);

        return [name, stage, amount, fy].filter(Boolean).join(" · ");
      })
      .slice(0, 3);

    parts.push(`Open proposals include ${proposalSummary.join("; ")}.`);
  }

  const solicitorSentence = buildSolicitorCoverageSentence(assignments);
  if (solicitorSentence) {
    parts.push(solicitorSentence);
  }

  return parts.length ? parts.join(" ") : null;
}

function buildIdentitySentence({
  constituent,
  constituencyLabels,
  educationRecords,
  spouseSummary,
}) {
  const segments = [];
  const primaryIdentity = resolvePrimaryIdentity(constituencyLabels);
  const hasBachelorAlumni = constituencyLabels.some((label) =>
    normalizeLabel(label).includes("alumni bachelor's degree"),
  );
  const hasGraduateAlumni = constituencyLabels.some((label) =>
    normalizeLabel(label).includes("alumni graduate degree"),
  );
  const hasOrthodonticsAlumni = constituencyLabels.some((label) =>
    normalizeLabel(label).includes("orthodontics"),
  );
  const juDegrees = educationRecords.flatMap((education) => education.degrees || []);
  const juMajors = educationRecords.flatMap((education) => education.majors || []);
  const classYears = educationRecords.map((education) => education.classOf).filter(Boolean);
  const varsitySports = educationRecords
    .filter((education) => normalizeLabel(education?.attribution) === "varsity sports")
    .map((education) => compactWhitespace(education?.sport))
    .filter(Boolean);

  if (primaryIdentity) {
    segments.push(`${constituent?.name || "This constituent"} is best understood first as ${primaryIdentity.toLowerCase()}.`);
  }

  if (hasBachelorAlumni || hasGraduateAlumni || hasOrthodonticsAlumni) {
    const alumniDetails = [];
    if (juDegrees.length) alumniDetails.push(formatList(juDegrees));
    if (juMajors.length) alumniDetails.push(`majors in ${formatList(juMajors)}`);
    if (classYears.length) alumniDetails.push(`class years ${formatList(classYears.map(String))}`);
    segments.push(
      alumniDetails.length
        ? `Their Jacksonville University alumni connection includes ${alumniDetails.join(", ")}.`
        : "They have a Jacksonville University alumni connection.",
    );
  }

  if (educationRecords.length >= 2) {
    segments.push("They are a Double Dolphin.");
  }

  if (spouseSummary?.isAlumniSpouse) {
    segments.push("They are part of a Dolphin Couple.");
  }

  if (varsitySports.length) {
    segments.push(`Varsity sports affiliation on record includes ${formatList(varsitySports)}.`);
  }

  return segments.length ? segments.join(" ") : null;
}

function buildBusinessSentence(primaryBusinessRelationship) {
  if (!primaryBusinessRelationship?.organizationName && !primaryBusinessRelationship?.position) {
    return null;
  }

  if (primaryBusinessRelationship.organizationName && primaryBusinessRelationship.position) {
    return `${primaryBusinessRelationship.position} at ${primaryBusinessRelationship.organizationName}.`;
  }

  return `${primaryBusinessRelationship.position || primaryBusinessRelationship.organizationName}.`;
}

function buildFamilySentence(familySummary) {
  const parts = [];

  if (familySummary?.children?.length) {
    const childBits = familySummary.children.map((child) => {
      const constituency = child.childConstituencyLabel
        ? ` who is also connected to JU as ${child.childConstituencyLabel.toLowerCase()}`
        : "";
      return `${child.name}${constituency}`;
    });
    parts.push(`Family ties include ${formatList(childBits)}.`);
  }

  return parts.length ? parts.join(" ") : null;
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
      if (child.relationId) {
        const childPayload = await tryFetchConstituentById({
          userId,
          authUserId,
          origin,
          candidateId: child.relationId,
        }).catch(() => null);
        if (childPayload) {
          childConstituencyLabel = resolvePrimaryIdentity(
            getConstituencyLabels(childPayload, []),
          );
        }
      }

      return {
        name: child.name || "their child",
        childConstituencyLabel,
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
}) {
  const constituencyLabels = getConstituencyLabels(constituent, educationRecords);

  return [
    buildIdentitySentence({
      constituent,
      constituencyLabels,
      educationRecords,
      spouseSummary: familySummary?.spouse,
    }),
    buildBusinessSentence(primaryBusinessRelationship),
    buildGivingSentence({ lifetimeGiving, lastGiftDate }),
    buildPipelineSentence(proposalSummary, fundraiserAssignments),
    buildFamilySentence(familySummary),
    buildEngagementSentence(eventSummary),
  ]
    .filter(Boolean)
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
  const lookupId = new URL(request.url).searchParams.get("lookupId")?.trim() || "";
  const recordId = new URL(request.url).searchParams.get("recordId")?.trim() || "";
  const name = new URL(request.url).searchParams.get("name")?.trim() || "";

  try {
    const { workspaceUser, sessionUser, isActing } = await getWorkspaceUser(session, request);
    const user = workspaceUser;
    const authUserId = isActing ? sessionUser.id : workspaceUser.id;
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
    });

    return Response.json({
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
    });
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
