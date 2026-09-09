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
import { canChangeImportMatch, getImportMatchCandidates, getSelectedImportMatchId, getReviewedNonmatchIds, rejectedImportMatchPreview } from "@/utils/importMatchReview";
import { IMPORT_MATCH_CRITERIA_VERSION, qualifyImportMatchCandidates } from "@/utils/importMatchEvidence";
import { checkClearNonmatch } from "@/app/api/utils/safeConstituentCreate";

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
    /Selected NXT record marked not a match/i,
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

    if (!["select", "reject", "suggestions"].includes(action)) {
      return Response.json({ error: "Choose a valid manual match action." }, { status: 400 });
    }

    const constituentId = cleanText(body?.constituentId);
    if (action !== "suggestions" && !constituentId) {
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
    if (!canChangeImportMatch(row)) {
      return Response.json(
        { error: "A created record, an in-progress or uncertain creation, or a completed/attempted NXT write cannot have its match changed. Open NXT to verify it instead." },
        { status: 409 },
      );
    }

    const preview = getPreview(row);
    if (action === "suggestions") {
      if (preview.matchCriteriaVersion === IMPORT_MATCH_CRITERIA_VERSION && preview.matchSuggestionsCheckedAt) {
        return Response.json({ results: getImportMatchCandidates(row), criteriaVersion: IMPORT_MATCH_CRITERIA_VERSION });
      }
      let candidates = getImportMatchCandidates(row);
      let notice = "";
      const input = preview.input || {};
      if (input.duplicateCheckVersion === 1) {
        // Recover legacy holds with the same read-only duplicate checks. This
        // action never invokes constituent creation or approves a nonmatch.
        notice = await checkClearNonmatch({ input, rowId: routeParams.rowId, runId: routeParams.runId,
          credentials: { userId: authResult.user.id, authUserId: authResult.user.id, origin },
          reviewedCandidateIds: getReviewedNonmatchIds(row),
          onCandidates: (matches) => { candidates = [...candidates, ...matches]; } }) || "";
      } else {
        const query = cleanText(input.lookupId || input.blackbaudConstituentId || input.constituentName || input.email || [input.firstName, input.lastName].filter(Boolean).join(" "));
        if (query.length < 2) return Response.json({ error: "There is not enough identifying information to load suggestions. Correct the staged CSV values or search NXT below." }, { status: 400 });
        candidates = qualifyImportMatchCandidates(input, await searchCandidates({ user: authResult.user, origin, query }));
      }
      const nextPreview = { ...preview, matchCandidates: candidates, matchCriteriaVersion: IMPORT_MATCH_CRITERIA_VERSION,
        newRecordReview: null, matchSuggestionsCheckedAt: new Date().toISOString() };
      const saved = await sql`
        UPDATE constituency_import_rows SET preview = ${JSON.stringify(nextPreview)}::jsonb, updated_at = NOW()
        WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
          AND status = ${row.status} AND applied_at IS NULL
          AND created_blackbaud_constituent_id IS NULL AND create_request_started_at IS NULL
          AND create_approved_at IS NOT DISTINCT FROM ${row.create_approved_at || null}::timestamptz
          AND preview IS NOT DISTINCT FROM ${JSON.stringify(row.preview)}::jsonb
          AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
        RETURNING id
      `;
      if (!saved.length) return Response.json({ error: "The import row changed while suggestions loaded. Reload it before continuing." }, { status: 409 });
      return Response.json({ results: getImportMatchCandidates(nextPreview), notice, criteriaVersion: IMPORT_MATCH_CRITERIA_VERSION });
    }
    if (action === "reject") {
      const selectedId = getSelectedImportMatchId(row);
      const candidate = getImportMatchCandidates(row).find((entry) => entry.blackbaudConstituentId === constituentId);
      if (selectedId !== constituentId && !candidate) {
        return Response.json({ error: "The selected match changed. Reload this row before rejecting a match." }, { status: 409 });
      }
      const decision = {
        decision: "rejected", constituentId,
        name: cleanText(candidate?.name || preview.match?.name), lookupId: cleanText(candidate?.lookupId || preview.match?.lookupId),
        reviewedAt: new Date().toISOString(), reviewedByUserId: String(authResult.user.id),
      };
      const keepSelection = Boolean(selectedId && selectedId !== constituentId);
      const matchCandidates = getImportMatchCandidates(row, { includeRejected: true });
      const nextPreview = keepSelection ? { ...preview, matchCandidates }
        : rejectedImportMatchPreview({ ...preview, matchCandidates }, decision);
      nextPreview.rejectedMatches = [...(preview.rejectedMatches || []), decision];
      const previousResult = row.blackbaud_result || {};
      const nextResult = { ...previousResult, matchDecisions: [...(previousResult.matchDecisions || []), decision] };
      if (keepSelection) {
        const changed = await sql`
          UPDATE constituency_import_rows
          SET preview = ${JSON.stringify(nextPreview)}::jsonb, blackbaud_result = ${JSON.stringify(nextResult)}::jsonb, updated_at = NOW()
          WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
            AND status = ${row.status} AND applied_at IS NULL
            AND created_blackbaud_constituent_id IS NULL AND create_request_started_at IS NULL
            AND create_approved_at IS NOT DISTINCT FROM ${row.create_approved_at || null}::timestamptz
            AND preview IS NOT DISTINCT FROM ${JSON.stringify(row.preview)}::jsonb
            AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
          RETURNING id
        `;
        if (!changed.length) return Response.json({ error: "This row changed. Reload before rejecting a suggestion." }, { status: 409 });
        return Response.json({ status: row.status, match: preview.match, message: "Suggestion marked not a match. Your selected record and review choices were kept. No NXT changes were made." });
      }
      const changed = await sql`
        UPDATE constituency_import_rows SET status = 'Needs Review', match_status = 'unresolved',
          match_method = 'Reviewer rejected NXT match', confidence = 0,
          matched_blackbaud_constituent_id = NULL, matched_lookup_id = NULL,
          preview = ${JSON.stringify(nextPreview)}::jsonb, requested_writes = '[]'::jsonb,
          blackbaud_result = ${JSON.stringify(nextResult)}::jsonb, blackbaud_error = NULL,
          create_approved_at = NULL, create_approved_by_user_id = NULL,
          quick_create_status = 'review', updated_at = NOW()
        WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
          AND status = ${row.status} AND applied_at IS NULL
          AND created_blackbaud_constituent_id IS NULL AND create_request_started_at IS NULL
          AND create_approved_at IS NOT DISTINCT FROM ${row.create_approved_at || null}::timestamptz
          AND preview IS NOT DISTINCT FROM ${JSON.stringify(row.preview)}::jsonb
          AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
        RETURNING id
      `;
      if (!changed.length) return Response.json({ error: "This row changed while you were reviewing it. Reload before trying again." }, { status: 409 });
      await refreshRunSummary(routeParams.runId);
      return Response.json({ status: "Needs Review", match: null, message: `${nextPreview.intentDisposition.message} No NXT changes were made.` });
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
    const targetChanged = getSelectedImportMatchId(row) !== verifiedMatch.blackbaudConstituentId ||
      cleanText(preview.match?.lookupId) !== verifiedMatch.lookupId || Boolean(preview.identityVerification);
    let writePlan = targetChanged ? [] : getWritePlan(row);
    const profileWrites = profileLoaded
      ? buildProfileDetailWrites(input, detailedMatch, targetChanged ? {} : getFieldReviewDecisions(preview, writePlan))
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
      matchReview: { decision: "selected", constituentId: verifiedMatch.blackbaudConstituentId },
      identityVerification: null,
      contactReviewDecisions: {},
      fieldReviewDecisions: targetChanged ? {} : preview.fieldReviewDecisions || {},
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

    const changed = await sql`
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
        create_approved_at = NULL, create_approved_by_user_id = NULL,
        updated_at = NOW()
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
        AND status = ${row.status} AND applied_at IS NULL
        AND created_blackbaud_constituent_id IS NULL AND create_request_started_at IS NULL
        AND create_approved_at IS NOT DISTINCT FROM ${row.create_approved_at || null}::timestamptz
        AND preview IS NOT DISTINCT FROM ${JSON.stringify(row.preview)}::jsonb
        AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
      RETURNING id
    `;
    if (!changed.length) return Response.json({ error: "This row changed while you were choosing a match. Reload before trying again." }, { status: 409 });
    await refreshRunSummary(routeParams.runId);

    return Response.json({
      message: `${reason} No NXT changes were made.`,
      match: verifiedMatch,
      status: "Needs Review",
    });
  } catch (error) {
    console.error("Import match review failed", { errorClass: error?.name, httpStatus: error?.httpStatus });
    if (isBlackbaudQuotaExceededError(error)) {
      return Response.json(
        { error: `NXT match lookup is paused. ${getQuotaPauseNotice(error)}` },
        { status: 429 },
      );
    }
    const status = Number(error?.httpStatus) === 429 || /(?:429|Too Many Requests|Rate limit)/i.test(error?.message || "") ? 429 : 500;
    const message = "Could not load or save NXT match suggestions. This row remains in review; check the connection or try again.";
    return Response.json({ error: message }, { status });
  }
}
