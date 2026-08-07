import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  blackbaudApiFetch,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function getCandidateId(candidate) {
  return cleanText(
    candidate?.blackbaudConstituentId ||
      candidate?.id ||
      candidate?.constituent_id ||
      candidate?.constituentId,
  );
}

function getCandidateLookupId(candidate) {
  return cleanText(candidate?.lookupId || candidate?.blackbaudLookupId || candidate?.lookup_id);
}

function isLikelyDuplicate(candidate, input) {
  const inputEmail = normalizeText(input.email);
  const candidateEmail = normalizeText(candidate?.email || candidate?.raw?.primary_email);
  if (inputEmail && candidateEmail && inputEmail === candidateEmail) return true;

  const inputName = normalizeText([input.firstName, input.lastName].filter(Boolean).join(" "));
  const candidateName = normalizeText(candidate?.name || candidate?.raw?.name);
  if (!inputName || !candidateName) return false;

  const [firstName, ...lastParts] = inputName.split(" ");
  const lastName = lastParts.join(" ");
  return candidateName === inputName ||
    (Boolean(firstName && lastName) && candidateName.startsWith(`${firstName} `) && candidateName.endsWith(lastName));
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

async function returnToReview({ rowId, message, result = null }) {
  await sql`
    UPDATE constituency_import_rows
    SET
      status = 'Needs Review',
      blackbaud_error = ${message},
      blackbaud_result = ${result ? JSON.stringify(result) : null}::jsonb,
      updated_at = NOW()
    WHERE id = ${rowId}
  `;
}

export async function POST(request, { params }) {
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
      SELECT id
      FROM constituency_import_runs
      WHERE id = ${runId}
      LIMIT 1
    `;
    if (!runs[0]) {
      return Response.json({ error: "Import run not found" }, { status: 404 });
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
    const input = preview.input && typeof preview.input === "object" ? preview.input : {};
    if (preview.intentDisposition?.key !== "potential_new") {
      return Response.json(
        { error: "Only an unmatched potential-new-record row can be created from this endpoint." },
        { status: 409 },
      );
    }
    if (cleanText(row.created_blackbaud_constituent_id)) {
      return Response.json(
        { error: "This row already created an NXT record. Apply the staged updates instead of creating it again." },
        { status: 409 },
      );
    }
    if (cleanText(input.blackbaudConstituentId) || cleanText(input.lookupId)) {
      return Response.json(
        { error: "This row includes an NXT identifier that did not resolve. Review the identifier before creating a new record." },
        { status: 409 },
      );
    }

    const firstName = cleanText(input.firstName);
    const lastName = cleanText(input.lastName);
    if (!firstName || !lastName) {
      return Response.json(
        { error: "First Name and Last Name are required before a new individual NXT record can be created." },
        { status: 400 },
      );
    }

    const birthdate = parseBirthDate(input.birthDate);
    if (cleanText(input.birthDate) && !birthdate) {
      return Response.json(
        { error: "Birth Date must use a valid MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD value before a new NXT record can be created." },
        { status: 400 },
      );
    }

    const lockedRows = await sql`
      UPDATE constituency_import_rows
      SET
        status = 'Creating',
        create_approved_at = NOW(),
        create_approved_by_user_id = ${authResult.user.id},
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE
        id = ${rowId}
        AND run_id = ${runId}
        AND status = 'Needs Review'
        AND created_blackbaud_constituent_id IS NULL
      RETURNING *
    `;
    if (!lockedRows[0]) {
      return Response.json(
        { error: "This row is already being created, has changed, or needs a refreshed preview." },
        { status: 409 },
      );
    }

    const origin = new URL(request.url).origin;
    let candidates;
    try {
      candidates = await searchBlackbaudConstituents({
        userId: authResult.user.id,
        authUserId: authResult.user.id,
        origin,
        query: [firstName, lastName].join(" "),
      });
    } catch (error) {
      const message = "The final NXT duplicate check failed. No new record was created; try again after the NXT search connection is available.";
      await returnToReview({
        rowId,
        message,
        result: {
          createApprovedByUserId: authResult.user.id,
          createApprovedByEmail: authResult.user.email,
          duplicateCheckFailedAt: new Date().toISOString(),
        },
      });
      await refreshRunSummary(runId);
      return Response.json({ error: message }, { status: 502 });
    }

    const duplicate = candidates.find((candidate) => isLikelyDuplicate(candidate, input));
    if (duplicate) {
      const message = `A likely NXT duplicate was found during the final check: ${cleanText(duplicate.name) || "existing constituent"}${getCandidateLookupId(duplicate) ? ` (Lookup ID ${getCandidateLookupId(duplicate)})` : ""}. No new record was created.`;
      await returnToReview({
        rowId,
        message,
        result: {
          createApprovedByUserId: authResult.user.id,
          createApprovedByEmail: authResult.user.email,
          duplicateCheckAt: new Date().toISOString(),
          duplicateCandidate: {
            constituentId: getCandidateId(duplicate),
            lookupId: getCandidateLookupId(duplicate),
            name: cleanText(duplicate.name),
          },
        },
      });
      await refreshRunSummary(runId);
      return Response.json({ error: message }, { status: 409 });
    }

    const createPayload = {
      type: "Individual",
      first: firstName,
      last: lastName,
    };
    if (cleanText(input.preferredName)) createPayload.preferred_name = cleanText(input.preferredName);
    if (cleanText(input.title)) createPayload.title = cleanText(input.title);
    if (cleanText(input.gender)) createPayload.gender = cleanText(input.gender);
    if (cleanText(input.suffix)) createPayload.suffix = cleanText(input.suffix);
    if (birthdate) createPayload.birthdate = birthdate;

    let createResult;
    try {
      createResult = await blackbaudApiFetch("/constituent/v1/constituents", {
        userId: authResult.user.id,
        authUserId: authResult.user.id,
        origin,
        method: "POST",
        body: createPayload,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "NXT rejected the create request.";
      await returnToReview({
        rowId,
        message,
        result: {
          createApprovedByUserId: authResult.user.id,
          createApprovedByEmail: authResult.user.email,
          createFailedAt: new Date().toISOString(),
        },
      });
      await refreshRunSummary(runId);
      return Response.json({ error: message }, { status: 502 });
    }

    const createdConstituentId = cleanText(
      createResult?.id || createResult?.constituent_id || createResult?.constituentId,
    );
    const createdLookupId = cleanText(createResult?.lookup_id || createResult?.lookupId);
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
      await refreshRunSummary(runId);
      return Response.json({ error: message }, { status: 502 });
    }

    const writePlan = (Array.isArray(row.requested_writes) ? row.requested_writes : []).map((write) => {
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
    const nextPreview = {
      ...preview,
      status: "Ready",
      matchStatus: "matched",
      matchMethod: "Created NXT record",
      confidence: 100,
      match: {
        blackbaudConstituentId: createdConstituentId,
        lookupId: createdLookupId || null,
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
        ...(Array.isArray(preview.reasons) ? preview.reasons : []),
        "A new individual NXT constituent was created after a final duplicate check. Staged updates have not been applied yet.",
      ],
    };

    await sql`
      UPDATE constituency_import_rows
      SET
        status = 'Ready',
        match_status = 'matched',
        match_method = 'Created NXT record',
        confidence = 100,
        matched_blackbaud_constituent_id = ${createdConstituentId},
        matched_lookup_id = ${createdLookupId || null},
        constituent_name = ${[firstName, lastName].join(" ")},
        preview = ${JSON.stringify(nextPreview)}::jsonb,
        requested_writes = ${JSON.stringify(writePlan)}::jsonb,
        created_blackbaud_constituent_id = ${createdConstituentId},
        created_blackbaud_lookup_id = ${createdLookupId || null},
        blackbaud_result = ${JSON.stringify({
          createApprovedByUserId: authResult.user.id,
          createApprovedByEmail: authResult.user.email,
          createdAt: new Date().toISOString(),
          createdConstituentId,
          createdLookupId: createdLookupId || null,
          createResult,
        })}::jsonb,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE id = ${rowId}
    `;
    await refreshRunSummary(runId);

    return Response.json({
      message: `Created NXT individual record for ${firstName} ${lastName}. Review and apply its staged updates separately.`,
      createdConstituentId,
      createdLookupId: createdLookupId || null,
    });
  } catch (error) {
    console.error("Error creating NXT constituent from import row:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create NXT constituent from import row" },
      { status: 500 },
    );
  }
}
