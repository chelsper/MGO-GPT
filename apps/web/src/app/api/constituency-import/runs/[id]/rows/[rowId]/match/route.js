import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  findBlackbaudConstituentByLookupId,
  getBlackbaudConstituentById,
  isBlackbaudQuotaExceededError,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";
import {
  buildOrganizationRelationshipWrite,
  buildProfileDetailWrites,
  hasUsableProfileSnapshot,
} from "@/app/api/constituency-import/preview/route";
import { getQuotaPauseNotice } from "@/app/api/constituency-import/quotaPause";
import { isReviewerRole } from "@/utils/workspaceRoles";

export const runtime = "nodejs";
export const maxDuration = 30;

const PROFILE_WRITE_TYPES = new Set([
  "profile_detail_review",
  "constituent_name",
  "constituent_profile",
]);

function cleanText(value) {
  return String(value || "").trim();
}

function getPreview(row) {
  return row?.preview && typeof row.preview === "object" ? row.preview : {};
}

function getWritePlan(row) {
  if (Array.isArray(row?.requested_writes) && row.requested_writes.length) {
    return row.requested_writes;
  }
  return Array.isArray(getPreview(row).writePlan) ? getPreview(row).writePlan : [];
}

function replaceWriteTypes(writePlan, types, nextWrites) {
  const next = [];
  let inserted = false;

  (Array.isArray(writePlan) ? writePlan : []).forEach((write) => {
    if (!types.has(write?.type)) {
      next.push(write);
      return;
    }
    if (!inserted) {
      next.push(...nextWrites);
      inserted = true;
    }
  });

  if (!inserted) next.push(...nextWrites);
  return next;
}

function summarizeRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      if (row.status === "Ready") summary.ready += 1;
      if (row.status === "Needs Review") summary.needsReview += 1;
      if (row.status === "Conflict") summary.conflict += 1;
      if (row.status === "Skipped") summary.skipped += 1;
      if (row.status === "Applied") summary.applied += 1;
      if (row.status === "Failed") summary.failed += 1;
      return summary;
    },
    { total: 0, ready: 0, needsReview: 0, conflict: 0, skipped: 0, applied: 0, failed: 0 },
  );
}

async function refreshRunSummary(runId) {
  const rows = await sql`
    SELECT status
    FROM constituency_import_rows
    WHERE run_id = ${runId}
  `;
  const summary = summarizeRows(rows);
  const nextStatus =
    summary.failed > 0 || summary.needsReview > 0 || summary.ready > 0
      ? "partially_applied"
      : "applied";

  await sql`
    UPDATE constituency_import_runs
    SET
      status = ${nextStatus},
      summary = ${JSON.stringify(summary)}::jsonb,
      ready_count = ${summary.ready},
      needs_review_count = ${summary.needsReview},
      conflict_count = ${summary.conflict},
      skipped_count = ${summary.skipped},
      applied_count = ${summary.applied},
      failed_count = ${summary.failed},
      updated_at = NOW()
    WHERE id = ${runId}
  `;
}

async function requireReviewer(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user) {
    return { error: Response.json({ error: "User not found" }, { status: 404 }) };
  }
  if (!isReviewerRole(user.role)) {
    return {
      error: Response.json(
        { error: "Only Advancement Services users can select an NXT import match." },
        { status: 403 },
      ),
    };
  }

  return { user };
}

function parseRouteParams(params) {
  const runId = cleanText(params?.id);
  const rowId = cleanText(params?.rowId);
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(rowId)) {
    return { error: "Invalid import run or row ID" };
  }
  return { runId, rowId };
}

function toSearchCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const blackbaudConstituentId = cleanText(
    candidate.blackbaudConstituentId || candidate.constituentId || candidate.id,
  );
  if (!blackbaudConstituentId) return null;

  return {
    blackbaudConstituentId,
    lookupId: cleanText(candidate.lookupId || candidate.blackbaudLookupId),
    name: cleanText(candidate.name) || "Unnamed constituent",
    email: cleanText(candidate.email),
    phone: cleanText(candidate.phone),
  };
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate || seen.has(candidate.blackbaudConstituentId)) return false;
    seen.add(candidate.blackbaudConstituentId);
    return true;
  });
}

function isNumericIdentifier(value) {
  return /^\d+$/.test(cleanText(value));
}

async function findExactCandidate(fetchCandidate) {
  try {
    return await fetchCandidate();
  } catch (error) {
    if (/\b404\b|not found/i.test(error instanceof Error ? error.message : "")) {
      return null;
    }
    throw error;
  }
}

async function searchCandidates({ user, origin, query }) {
  const normalizedQuery = cleanText(query);
  if (!normalizedQuery) return [];

  // A known lookup ID is the lowest-call route. Do not run both name-search
  // endpoints for a reviewer who already has an exact NXT identifier.
  if (isNumericIdentifier(normalizedQuery)) {
    const byLookupId = await findExactCandidate(() =>
      findBlackbaudConstituentByLookupId({
        userId: user.id,
        authUserId: user.id,
        origin,
        lookupId: normalizedQuery,
      }),
    );
    if (byLookupId) return uniqueCandidates([toSearchCandidate(byLookupId)].filter(Boolean));

    const bySystemId = await findExactCandidate(() =>
      getBlackbaudConstituentById({
        userId: user.id,
        authUserId: user.id,
        origin,
        constituentId: normalizedQuery,
      }),
    );
    return uniqueCandidates([toSearchCandidate(bySystemId)].filter(Boolean));
  }

  const results = await searchBlackbaudConstituents({
    userId: user.id,
    authUserId: user.id,
    origin,
    query: normalizedQuery,
  });
  return uniqueCandidates(results.map(toSearchCandidate).filter(Boolean));
}

function hasContactInput(input) {
  return Boolean(
    input?.emailUpdates?.length || input?.phoneUpdates?.length || input?.addressUpdates?.length,
  );
}

function hasConstituencyInput(input) {
  return Boolean(cleanText(input?.sourceConstituency) || cleanText(input?.targetConstituency));
}

function buildDeferredHydration(input, existing = {}) {
  const current = existing && typeof existing === "object" ? existing : {};
  return {
    ...current,
    detail: Boolean(input?.nameUpdate || input?.individualProfileUpdate),
    contacts: hasContactInput(input),
    nameFormats: Boolean(input?.nameFormatUpdate),
    educations: Boolean(input?.educationRelationship),
    codes: hasConstituencyInput(input),
  };
}

function removeDeferredMatchReasons(reasons) {
  const patterns = [
    /NXT could not confirm this match during the fast import preview/i,
    /This row is held for review and cannot be treated as a new record automatically/i,
    /No likely NXT match was found/i,
    /No NXT match selected/i,
    /No constituent identifier, lookup ID, name, or email was supplied/i,
    /Education imports require a confirmed matched individual NXT constituent/i,
    /Organization relationship imports require a confirmed matched individual NXT constituent/i,
    /Current constituency .* was not found on the NXT record/i,
    /Blackbaud \d{3} .*?(?:Too Many Requests|Rate limit)/i,
  ];
  return (Array.isArray(reasons) ? reasons : []).filter(
    (reason) => !patterns.some((pattern) => pattern.test(cleanText(reason))),
  );
}

function getFieldReviewDecisions(preview, writePlan) {
  const deferred = (Array.isArray(writePlan) ? writePlan : []).find(
    (write) => write?.type === "profile_detail_review" && write?.fieldDecisions,
  );
  if (deferred?.fieldDecisions && typeof deferred.fieldDecisions === "object") {
    return deferred.fieldDecisions;
  }
  return preview?.fieldReviewDecisions && typeof preview.fieldReviewDecisions === "object"
    ? preview.fieldReviewDecisions
    : {};
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action).toLowerCase();
    const origin = new URL(request.url).origin;

    if (action === "search") {
      const query = cleanText(body?.query);
      if (query.length < 2) {
        return Response.json(
          { error: "Enter at least two characters of a name or an NXT ID." },
          { status: 400 },
        );
      }
      const results = await searchCandidates({ user: authResult.user, origin, query });
      return Response.json({ query, results, count: results.length });
    }

    if (action !== "select") {
      return Response.json({ error: "Choose a valid manual match action." }, { status: 400 });
    }

    const constituentId = cleanText(body?.constituentId);
    if (!constituentId) {
      return Response.json({ error: "Choose an NXT constituent before saving the match." }, { status: 400 });
    }

    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return Response.json({ error: "Import row not found" }, { status: 404 });
    if (["Applied", "Failed"].includes(row.status)) {
      return Response.json(
        { error: "A completed or failed NXT write cannot have its match changed from import review." },
        { status: 409 },
      );
    }

    // Never trust a browser-supplied search candidate. Re-read this one NXT
    // constituent so the reviewer cannot stage a write against a stale ID.
    let detailedMatch;
    try {
      detailedMatch = await getBlackbaudConstituentById({
        userId: authResult.user.id,
        authUserId: authResult.user.id,
        origin,
        constituentId,
      });
    } catch (matchError) {
      if (/\b404\b|not found/i.test(matchError instanceof Error ? matchError.message : "")) {
        return Response.json({ error: "That NXT constituent could not be found." }, { status: 404 });
      }
      throw matchError;
    }
    if (!detailedMatch?.blackbaudConstituentId) {
      return Response.json({ error: "That NXT constituent could not be verified." }, { status: 404 });
    }

    const preview = getPreview(row);
    const input = preview.input || {};
    const verifiedMatch = {
      blackbaudConstituentId: cleanText(detailedMatch.blackbaudConstituentId),
      lookupId: cleanText(detailedMatch.lookupId),
      name: cleanText(detailedMatch.name),
      email: cleanText(detailedMatch.email),
      ...(detailedMatch.raw && typeof detailedMatch.raw === "object"
        ? { raw: detailedMatch.raw }
        : {}),
    };
    const profileLoaded = hasUsableProfileSnapshot(detailedMatch);
    let writePlan = getWritePlan(row);
    const profileWrites = profileLoaded
      ? buildProfileDetailWrites(input, detailedMatch, getFieldReviewDecisions(preview, writePlan))
      : writePlan.filter((write) => PROFILE_WRITE_TYPES.has(write?.type));
    writePlan = replaceWriteTypes(writePlan, PROFILE_WRITE_TYPES, profileWrites);

    const organizationRelationshipWrite = buildOrganizationRelationshipWrite(input, detailedMatch);
    if (organizationRelationshipWrite || writePlan.some((write) => write?.type === "organization_relationship")) {
      writePlan = replaceWriteTypes(
        writePlan,
        new Set(["organization_relationship"]),
        organizationRelationshipWrite ? [organizationRelationshipWrite] : [],
      );
    }

    const deferredHydration = buildDeferredHydration(input, preview.deferredHydration);
    deferredHydration.detail = profileLoaded ? false : deferredHydration.detail;
    const reason = `Reviewer selected ${verifiedMatch.name || "this constituent"}${
      verifiedMatch.lookupId ? ` (Lookup ID ${verifiedMatch.lookupId})` : ""
    } as the NXT match. Load the remaining current NXT details for this row before sending it.`;
    const nextPreview = {
      ...preview,
      status: "Needs Review",
      nxtChecksPaused: false,
      quotaRecoveryRequired: false,
      matchStatus: "matched",
      matchMethod: "Reviewer-selected NXT match",
      confidence: 100,
      match: verifiedMatch,
      profileSnapshot: profileLoaded && detailedMatch.raw && typeof detailedMatch.raw === "object"
        ? detailedMatch.raw
        : null,
      profileSnapshotLoaded: profileLoaded,
      // A manual selection can replace a previous tentative candidate. Clear any
      // detail snapshots so data from a different NXT record is never reused.
      currentContacts: { emails: [], phones: [], addresses: [] },
      contactSnapshotStatus: { emails: false, phones: false, addresses: false },
      contactsSnapshotLoaded: false,
      currentNameFormats: {
        addressee: { id: "", value: "" },
        salutation: { id: "", value: "" },
      },
      nameFormatsSnapshotLoaded: false,
      currentCodes: [],
      currentCodeDetails: [],
      proposedCodes: [],
      codesSnapshotLoaded: false,
      currentEducations: [],
      educationsSnapshotLoaded: false,
      deferredHydration,
      writePlan,
      reasons: [...new Set([...removeDeferredMatchReasons(preview.reasons), reason])],
      intentDisposition: null,
    };
    const previousResult =
      row.blackbaud_result && typeof row.blackbaud_result === "object" ? row.blackbaud_result : {};
    const nextResult = {
      ...previousResult,
      manualMatch: {
        selectedAt: new Date().toISOString(),
        selectedByUserId: String(authResult.user.id),
        selectedByEmail: cleanText(authResult.user.email),
        constituentId: verifiedMatch.blackbaudConstituentId,
        lookupId: verifiedMatch.lookupId,
        name: verifiedMatch.name,
      },
    };

    await sql`
      UPDATE constituency_import_rows
      SET
        status = ${"Needs Review"},
        match_status = ${"matched"},
        match_method = ${"Reviewer-selected NXT match"},
        confidence = ${100},
        matched_blackbaud_constituent_id = ${verifiedMatch.blackbaudConstituentId},
        matched_lookup_id = ${verifiedMatch.lookupId || null},
        preview = ${JSON.stringify(nextPreview)}::jsonb,
        requested_writes = ${JSON.stringify(writePlan)}::jsonb,
        blackbaud_result = ${JSON.stringify(nextResult)}::jsonb,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
    `;
    await refreshRunSummary(routeParams.runId);

    return Response.json({
      message: `${reason} No NXT changes were made.`,
      match: verifiedMatch,
      status: "Needs Review",
    });
  } catch (error) {
    console.error("Error selecting a manual NXT import match:", error);
    if (isBlackbaudQuotaExceededError(error)) {
      return Response.json(
        { error: `NXT match lookup is paused. ${getQuotaPauseNotice(error)}` },
        { status: 429 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to search or select the NXT match.";
    const status = /(?:429|Too Many Requests|Rate limit)/i.test(message) ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
