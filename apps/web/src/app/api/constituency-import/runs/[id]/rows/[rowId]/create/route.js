import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { newRecordContactPayload, ImportReviewRequired } from "@/utils/newConstituentImport";
import { canReviewNewImportRecord, getReviewedNonmatchIds, rejectedImportMatchPreview } from "@/utils/importMatchReview";
import { prepareNewRecordReview, reviewedCreationBlocker, duplicateReviewFailure, reviewLocalImportDuplicate } from "@/app/api/utils/reviewedConstituentCreate";
import { buildNewConstituentReviewWrites } from "@/app/api/constituency-import/preview/route";
import {
  claimConstituentCreateLease, renewConstituentCreateLease, releaseConstituentCreateLease,
  checkClearNonmatch, configuredNameFormatPayload,
  markConstituentCreateStarted,
  recordCreatedConstituent,
  recordRejectedConstituentCreate,
} from "@/app/api/utils/safeConstituentCreate";

function cleanText(value) {
  return String(value || "").trim();
}

function parseBirthDate(value) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!isoMatch && !usMatch) return undefined;

  const year = Number(isoMatch?.[1] ?? usMatch?.[3]);
  const month = Number(isoMatch?.[2] ?? usMatch?.[1]);
  const day = Number(isoMatch?.[3] ?? usMatch?.[2]);
  const currentTwoDigitYear = new Date().getUTCFullYear() % 100;
  const resolvedYear = year < 100 ? (year <= currentTwoDigitYear ? 2000 + year : 1900 + year) : year;
  const date = new Date(Date.UTC(resolvedYear, month - 1, day));
  if (
    date.getUTCFullYear() !== resolvedYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { y: resolvedYear, m: month, d: day };
}

function getPreview(row) {
  return row?.preview && typeof row.preview === "object" ? row.preview : {};
}

function canCreateNewRecord(preview) {
  return ["potential_new", "ready_new"].includes(cleanText(preview?.intentDisposition?.key));
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
        { error: "Only Advancement Services users can create NXT constituents from an import." },
        { status: 403 },
      ),
    };
  }
  return { user };
}

async function refreshRunSummary(runId) {
  const rows = await sql`
    SELECT status
    FROM constituency_import_rows
    WHERE run_id = ${runId}
  `;
  const summary = summarizeRows(rows);
  const nextStatus = summary.failed > 0 || summary.needsReview > 0 || summary.ready > 0
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

async function returnToReview({ rowId, message, result = null, preflight = false }) {
  await sql`
    UPDATE constituency_import_rows
    SET
      status = 'Needs Review',
      blackbaud_error = ${message},
      blackbaud_result = CASE WHEN blackbaud_result->'reviewedNewApproval' IS NOT NULL
        THEN jsonb_build_object('reviewedNewApproval', blackbaud_result->'reviewedNewApproval') || COALESCE(${result ? JSON.stringify(result) : null}::jsonb, '{}'::jsonb)
        ELSE ${result ? JSON.stringify(result) : null}::jsonb END,
      create_approved_at = CASE WHEN ${preflight} AND create_request_started_at IS NULL THEN NULL ELSE create_approved_at END,
      create_approved_by_user_id = CASE WHEN ${preflight} AND create_request_started_at IS NULL THEN NULL ELSE create_approved_by_user_id END,
      updated_at = NOW()
    WHERE id = ${rowId}
  `;
}

export async function POST(request, { params }) {
  let lease = null;
  let claimedRowId = null;
  let createAttempted = false;
  const mode = new URL(request.url).searchParams.get("mode");
  const quick = mode === "clear_nonmatches";
  const reviewed = mode === "reviewed_new";
  const checkOnly = mode === "review_new_check";
  const localReview = ["review_local_check", "review_local_reject"].includes(mode);
  try {
    await ensureAppSchema();

    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const runId = cleanText(params?.id);
    const rowId = cleanText(params?.rowId);
    if (!/^\d+$/.test(runId) || !/^\d+$/.test(rowId)) {
      return Response.json({ error: "Invalid import run or row ID" }, { status: 400 });
    }

    const runs = await sql`
      SELECT id, defaults, status
      FROM constituency_import_runs
      WHERE id = ${runId}
      LIMIT 1
    `;
    if (!runs[0]) {
      return Response.json({ error: "Import run not found" }, { status: 404 });
    }
    if ((quick || reviewed || checkOnly || localReview) && (!["new", "mixed"].includes(runs[0].defaults?.importIntent) || runs[0].status === "preparing")) {
      return Response.json({ error: "Finish preparing a New or Mixed import before creating clear nonmatches." }, { status: 409 });
    }

    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE id = ${rowId} AND run_id = ${runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return Response.json({ error: "Import row not found" }, { status: 404 });
    }

    const preview = getPreview(row);
    if (localReview) return await reviewLocalImportDuplicate({ row, runId, user: authResult.user,
      origin: new URL(request.url).origin, body: await request.json().catch(() => ({})), reject: mode === "review_local_reject" });
    if (checkOnly) {
      if (!canReviewNewImportRecord(row)) return Response.json({ error: "This row is matched, skipped, or locked by an NXT operation. Reopen its review; do not create another record." }, { status: 409 });
      return await prepareNewRecordReview({ row, runId, user: authResult.user, origin: new URL(request.url).origin });
    }
    const body = reviewed ? await request.json().catch(() => ({})) : {};
    if (reviewed) {
      const blocker = reviewedCreationBlocker(row, body);
      if (blocker) return Response.json({ error: blocker, held: true }, { status: 409 });
    }
    const reviewedNewApproval = reviewed ? {
      approvedAt: new Date().toISOString(), approvedByUserId: String(authResult.user.id),
      note: String(body.reviewNote || "").trim(), rejectedConstituentIds: getReviewedNonmatchIds(row),
      localDuplicateDecisions: preview.reviewedLocalDuplicates || [],
      checkToken: preview.newRecordReview.token, checkedAt: preview.newRecordReview.checkedAt,
    } : null;
    const input = preview.input && typeof preview.input === "object" ? preview.input : {};
    const externalSourceId = cleanText(input.externalConstituentId);
    const targetConstituency = cleanText(input.targetConstituency);
    const suppliedNxtIdentifier = {
      blackbaudConstituentId: cleanText(input.blackbaudConstituentId) || null,
      lookupId: cleanText(input.lookupId) || null,
    };
    const suppliedNxtIdentifierSummary = [
      suppliedNxtIdentifier.blackbaudConstituentId
        ? `System ID ${suppliedNxtIdentifier.blackbaudConstituentId}`
        : null,
      suppliedNxtIdentifier.lookupId
        ? `Lookup ID ${suppliedNxtIdentifier.lookupId}`
        : null,
    ].filter(Boolean).join(" and ");
    const requestedNxtLookupId = reviewed ? null : suppliedNxtIdentifier.lookupId || null;
    if (!reviewed && !canCreateNewRecord(preview)) {
      return Response.json(
        { error: "Only an unmatched new-record candidate can be created from this endpoint." },
        { status: 409 },
      );
    }
    if (cleanText(row.created_blackbaud_constituent_id)) {
      return Response.json(
        { error: "This row already created an NXT record. Apply the staged updates instead of creating it again." },
        { status: 409 },
      );
    }
    if (row.create_request_started_at) {
      return Response.json({ error: "An earlier create request has an uncertain outcome. Reconcile this row with NXT; creating it again is blocked.", held: true }, { status: 409 });
    }
    if (quick && row.quick_create_status) {
      return Response.json({ error: "This row was already checked. It remains saved for individual review.", held: true }, { status: 409 });
    }
    if (!["Needs Review", "Ready"].includes(row.status) || row.matched_blackbaud_constituent_id) {
      return Response.json({ error: "This row has changed or is already matched. Reopen it for review.", held: true }, { status: 409 });
    }
    async function invalidInput(message) {
      if (quick) {
        await sql`UPDATE constituency_import_rows SET quick_create_status = 'review', blackbaud_error = ${message}, status = 'Needs Review' WHERE id = ${rowId} AND status IN ('Ready', 'Needs Review')`;
        await refreshRunSummary(runId);
      }
      return Response.json({ error: message, held: quick }, { status: 400 });
    }
    const firstName = cleanText(input.firstName);
    const lastName = cleanText(input.lastName);
    if (!firstName || !lastName) {
      return invalidInput("First Name and Last Name are required before a new individual NXT record can be created.");
    }

    const birthdate = parseBirthDate(input.birthDate);
    if (cleanText(input.birthDate) && !birthdate) {
      return invalidInput("Birth Date must use a valid MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD value before a new NXT record can be created.");
    }

    lease = await claimConstituentCreateLease();
    if (!lease) return Response.json({ error: "Another import is creating a constituent. Resume shortly; this row has not been changed.", paused: true }, { status: 423 });

    const lockedRows = await sql`
      UPDATE constituency_import_rows
      SET
        status = 'Creating',
        create_approved_at = NOW(),
        create_approved_by_user_id = ${authResult.user.id},
        blackbaud_result = CASE WHEN ${reviewed} THEN COALESCE(blackbaud_result, '{}'::jsonb) || ${JSON.stringify({ reviewedNewApproval })}::jsonb ELSE blackbaud_result END,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE
        id = ${rowId}
        AND run_id = ${runId}
        AND status IN ('Needs Review', 'Ready')
        AND created_blackbaud_constituent_id IS NULL
        AND create_request_started_at IS NULL
        AND applied_at IS NULL
        AND matched_blackbaud_constituent_id IS NULL
        AND blackbaud_result IS NOT DISTINCT FROM ${row.blackbaud_result == null ? null : JSON.stringify(row.blackbaud_result)}::jsonb
        AND create_approved_at IS NOT DISTINCT FROM ${row.create_approved_at || null}::timestamptz
        AND preview = ${JSON.stringify(preview)}::jsonb
      RETURNING *
    `;
    if (!lockedRows[0]) {
      return Response.json(
        { error: "This row is already being created, has changed, or needs a refreshed preview." },
        { status: 409 },
      );
    }
    claimedRowId = rowId;

    const origin = new URL(request.url).origin;
    const credentials = { userId: authResult.user.id, authUserId: authResult.user.id, origin };
    let newRecordFields = {};
    try {
      newRecordFields = await configuredNameFormatPayload(input, credentials);
      let matchCandidates = [];
      let localDuplicate = null;
      const reason = await checkClearNonmatch({ input, rowId, runId, credentials,
        ...(reviewed ? { reviewedCandidateIds: getReviewedNonmatchIds(row), reviewedLocalDuplicates: preview.reviewedLocalDuplicates || [] } : {}),
        onCandidates: (candidates) => { matchCandidates = candidates; },
        onLocalDuplicate: (found) => { localDuplicate = found; } });
      if (reason) {
        await returnToReview({ rowId, message: reason, preflight: true,
          result: { ...(row.blackbaud_result || {}), type: "import_duplicate_review", matchCandidates, localDuplicate, duplicateCheckAt: new Date().toISOString() } });
        if (reviewed) await sql`UPDATE constituency_import_rows SET preview = jsonb_set(preview, '{newRecordReview}', ${JSON.stringify({ status: "blocked", message: reason, nextAction: reason.startsWith("Another import row") ? "review_batch" : "review_matches" })}::jsonb) WHERE id = ${rowId} AND status = 'Needs Review'`;
        await sql`UPDATE constituency_import_rows SET quick_create_status = 'review' WHERE id = ${rowId}`;
        await refreshRunSummary(runId);
        return Response.json({ error: reason, held: true }, { status: 409 });
      }
      if (quick && Object.values(preview.contactReviewDecisions || {}).some((kind) => Object.keys(kind || {}).length > 0)) {
        throw new ImportReviewRequired("Saved contact review choices require individual review.");
      }
      if (quick) newRecordFields = { ...newRecordFields, ...newRecordContactPayload(input) };
    } catch (error) {
      const status = Number(error.httpStatus || error.status);
      const paused = [401, 403, 429].includes(status) || error.retryAfterMs > 0 || /quota|not connected/i.test(error.message || "");
      const message = paused
        ? "NXT duplicate checking is paused. No record was created. Resume when the connection or quota is available."
        : error instanceof ImportReviewRequired
          ? `${error.message} No NXT record was created.`
          : "This row needs review because its duplicate checks, contact selections, or NXT name format could not be confirmed. No NXT record was created.";
      await returnToReview({ rowId, message, preflight: true });
      if (reviewed) {
        const failure = duplicateReviewFailure(error);
        await sql`UPDATE constituency_import_rows SET preview = jsonb_set(preview, '{newRecordReview}', ${JSON.stringify({ status: "blocked", ...failure })}::jsonb) WHERE id = ${rowId} AND status = 'Needs Review'`;
      }
      if (quick && !paused) await sql`UPDATE constituency_import_rows SET quick_create_status = 'review' WHERE id = ${rowId}`;
      await refreshRunSummary(runId);
      return Response.json({ error: message, held: !paused, paused, retryAfterMs: error.retryAfterMs || null }, { status: paused ? 429 : 409 });
    }
    const createPayload = {
      type: "Individual",
      first: firstName,
      last: lastName,
      // Preserve a requested NXT Lookup ID; NXT assigns system record IDs on creation.
      ...(requestedNxtLookupId ? { lookup_id: requestedNxtLookupId } : {}),
    };
    if (cleanText(input.preferredName)) createPayload.preferred_name = cleanText(input.preferredName);
    if (cleanText(input.title)) createPayload.title = cleanText(input.title);
    if (cleanText(input.gender)) createPayload.gender = cleanText(input.gender);
    if (cleanText(input.ethnicity)) createPayload.ethnicity = cleanText(input.ethnicity);
    if (cleanText(input.suffix)) createPayload.suffix = cleanText(input.suffix);
    if (birthdate) createPayload.birthdate = birthdate;
    Object.assign(createPayload, newRecordFields);

    let createResult;
    try {
      await renewConstituentCreateLease(lease);
      // Persist BEFORE POST. A lost response or DB failure must never lead to
      // automatically replaying a non-idempotent constituent creation.
      await markConstituentCreateStarted(rowId, preview);
      createAttempted = true;
      createResult = await blackbaudApiFetch("/constituent/v1/constituents", {
        userId: authResult.user.id,
        authUserId: authResult.user.id,
        origin,
        method: "POST",
        body: createPayload,
        maxRetries: 0,
        timeoutMs: 20000,
      });
    } catch (error) {
      const confirmedRejection = createAttempted && [400, 401, 403, 409, 422, 429].includes(Number(error.httpStatus));
      if (confirmedRejection) await recordRejectedConstituentCreate(rowId);
      const message = confirmedRejection
        ? `NXT rejected the create request (HTTP ${error.httpStatus}). No new record was created. Review the row's field values, NXT types, and connection before a manual retry.`
        : createAttempted
        ? "The create request did not return a confirmed result. Check NXT and reconcile this row before any further creation; automatic retry is blocked."
        : "The row or creation lock changed before sending to NXT. No create request was sent; review this row before retrying.";
      await returnToReview({
        rowId,
        message,
        preflight: confirmedRejection || !createAttempted,
        result: {
          createApprovedByUserId: authResult.user.id,
          createApprovedByEmail: authResult.user.email,
          createFailedAt: new Date().toISOString(),
        },
      });
      if (reviewed && (confirmedRejection || !createAttempted)) {
        await sql`UPDATE constituency_import_rows SET preview = jsonb_set(preview, '{newRecordReview}', ${JSON.stringify({ status: "blocked", message, nextAction: confirmedRejection && [400, 422].includes(Number(error.httpStatus)) ? "correct_csv" : "retry" })}::jsonb) WHERE id = ${rowId} AND status = 'Needs Review' AND create_request_started_at IS NULL`;
      }
      if (quick) await sql`UPDATE constituency_import_rows SET quick_create_status = ${createAttempted && !confirmedRejection ? "uncertain" : "review"} WHERE id = ${rowId}`;
      await refreshRunSummary(runId);
      return Response.json({ error: message, held: true, paused: [401, 403, 429].includes(Number(error.httpStatus || error.status)) || error.retryAfterMs > 0 }, { status: 502 });
    }

    const createdConstituentId = cleanText(
      createResult?.id || createResult?.constituent_id || createResult?.constituentId,
    );
    const createdLookupId = cleanText(createResult?.lookup_id || createResult?.lookupId);
    const resolvedCreatedLookupId = createdLookupId || requestedNxtLookupId;
    if (!createdConstituentId) {
      const message = "NXT accepted the create request but did not return a constituent ID. No retry was attempted; reconcile this row in NXT before creating anything else.";
      await returnToReview({
        rowId,
        message,
        result: {
          createApprovedByUserId: authResult.user.id,
          createApprovedByEmail: authResult.user.email,
          createAttemptedAt: new Date().toISOString(),
          createResult,
        },
      });
      if (quick) await sql`UPDATE constituency_import_rows SET quick_create_status = 'uncertain' WHERE id = ${rowId}`;
      await refreshRunSummary(runId);
      return Response.json({ error: message, held: true }, { status: 502 });
    }

    await recordCreatedConstituent(rowId, createdConstituentId);

    const createdMatch = { blackbaudConstituentId: createdConstituentId, raw: { id: createdConstituentId, type: "Individual" } };
    const sourceWrites = reviewed ? buildNewConstituentReviewWrites(input, createdMatch) : (Array.isArray(row.requested_writes) ? row.requested_writes : []);
    const writePlan = sourceWrites.map((write) => {
      if (!["education_relationship", "organization_relationship"].includes(write?.type)) {
        return write;
      }
      const { requiresReview, validationMessage, ...rest } = write;
      const shouldClearMatchRequirement = /confirmed matched individual/i.test(validationMessage || "");
      return {
        ...rest,
        recordType: "Individual",
        ...(shouldClearMatchRequirement ? {} : { requiresReview, validationMessage }),
      };
    });
    const nextStatus = reviewed && writePlan.some((write) => write.requiresReview) ? "Needs Review" : "Ready";
    const nextPreview = {
      ...(reviewed ? rejectedImportMatchPreview(preview, null) : preview),
      ...(reviewed ? { matchReview: { decision: "created", ...reviewedNewApproval }, newRecordReview: { status: "created" },
        deferredHydration: { detail: Boolean(input.nameUpdate || input.individualProfileUpdate), contacts: Boolean(input.emailUpdates?.length || input.phoneUpdates?.length || input.addressUpdates?.length), nameFormats: Boolean(input.nameFormatUpdate), educations: Boolean(input.educationRelationship), codes: Boolean(input.sourceConstituency || input.targetConstituency) } } : {}),
      status: nextStatus,
      matchStatus: "matched",
      matchMethod: "Created NXT record",
      confidence: 100,
      match: {
        blackbaudConstituentId: createdConstituentId,
        lookupId: resolvedCreatedLookupId || null,
        name: [firstName, lastName].join(" "),
        email: cleanText(input.email) || null,
        raw: { id: createdConstituentId, type: "Individual" },
      },
      intentDisposition: {
        key: "created_new_record",
        label: "NXT record created",
        allowApply: true,
        message: "An individual NXT constituent was created after the final duplicate check. Review and apply the staged updates separately.",
      },
      writePlan,
      reasons: [
        ...(reviewed ? [] : Array.isArray(preview.reasons) ? preview.reasons : []),
        "A new individual NXT constituent was created after a final duplicate check. Staged updates have not been applied yet.",
        ...(externalSourceId
          ? [`External source ID ${externalSourceId} was retained in this import audit and was not sent to NXT.`]
          : []),
        ...(requestedNxtLookupId
          ? [`The supplied NXT Lookup ID ${requestedNxtLookupId} did not resolve to an existing constituent and was assigned to the new NXT record after final duplicate checks.`]
          : []),
        ...(reviewed && suppliedNxtIdentifierSummary ? ["Original CSV NXT identifiers were retained only in the audit. NXT assigned fresh identifiers to this separately confirmed person."] : []),
        ...(!reviewed && suppliedNxtIdentifier.blackbaudConstituentId
          ? [`The supplied NXT System ID ${suppliedNxtIdentifier.blackbaudConstituentId} did not resolve and was retained only in this import audit; NXT assigned the new system record ID.`]
          : []),
      ],
    };

    await sql`
      UPDATE constituency_import_rows
      SET
        status = ${nextStatus},
        match_status = 'matched',
        match_method = 'Created NXT record',
        confidence = 100,
        matched_blackbaud_constituent_id = ${createdConstituentId},
        matched_lookup_id = ${resolvedCreatedLookupId || null},
        constituent_name = ${[firstName, lastName].join(" ")},
        preview = ${JSON.stringify(nextPreview)}::jsonb,
        requested_writes = ${JSON.stringify(writePlan)}::jsonb,
        created_blackbaud_constituent_id = ${createdConstituentId},
        created_blackbaud_lookup_id = ${resolvedCreatedLookupId || null},
        quick_create_status = ${quick ? "created" : null},
        blackbaud_result = ${JSON.stringify({
          ...(reviewedNewApproval ? { reviewedNewApproval } : {}),
          createApprovedByUserId: authResult.user.id,
          createApprovedByEmail: authResult.user.email,
          createdAt: new Date().toISOString(),
          createdConstituentId,
          createdLookupId: resolvedCreatedLookupId || null,
          requestedNxtLookupId,
          externalSourceId: externalSourceId || null,
          unresolvedNxtIdentifier: suppliedNxtIdentifierSummary ? suppliedNxtIdentifier : null,
          createResult,
          configuredNameFormats: input.newRecordNameFormats || null,
          includedContactKinds: Object.keys(newRecordFields).filter((key) => ["email", "phone", "address"].includes(key)),
        })}::jsonb,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE id = ${rowId}
    `;
    await refreshRunSummary(runId);

    return Response.json({
      message: reviewed ? `Created NXT individual record for ${firstName} ${lastName} with fresh NXT identifiers. Review and apply the remaining staged updates separately.` : `Created NXT individual record for ${firstName} ${lastName}.${targetConstituency ? ` The spreadsheet constituency ${targetConstituency} remains staged for review and send.` : ""}${requestedNxtLookupId ? ` The new NXT record was assigned Lookup ID ${resolvedCreatedLookupId}.` : ""}${suppliedNxtIdentifier.blackbaudConstituentId ? ` The unresolved NXT System ID ${suppliedNxtIdentifier.blackbaudConstituentId} was retained in the import audit only; NXT assigned the new system record ID.` : ""} Review and apply its staged updates separately.`,
      createdConstituentId,
      createdLookupId: resolvedCreatedLookupId || null,
      externalSourceId: externalSourceId || null,
      unresolvedNxtIdentifier: suppliedNxtIdentifierSummary ? suppliedNxtIdentifier : null,
    });
  } catch (error) {
    console.error("Import constituent creation failed", { stage: createAttempted ? "create_or_checkpoint" : "preflight", rowId: claimedRowId, errorClass: error?.name });
    return Response.json(
      { error: createAttempted ? "Creation may have reached NXT, but its checkpoint could not be confirmed. Reconcile this row; do not create it again." : "The import could not complete this row. Reopen the saved run to check its status.", paused: true },
      { status: 500 },
    );
  } finally {
    if (lease) await releaseConstituentCreateLease(lease).catch(() => {});
  }
}
