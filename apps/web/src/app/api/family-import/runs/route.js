import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";
import {
  cleanText,
  getFamilyImportRunPayload,
  requireFamilyImportReviewer,
  serializeFamilyImportRun,
} from "@/app/api/family-import/utils";
import {
  FAMILY_IMPORT_MAX_ROWS,
  createInitialFamilyReview,
  isFamilyImportCsvRowEmpty,
  normalizeFamilyImportRow,
  summarizeFamilyImportRows,
} from "@/utils/familyImport";

export const runtime = "nodejs";

function serializeRunList(rows) {
  return rows.map(serializeFamilyImportRun);
}

export async function GET(request) {
  try {
    await ensureAppSchema();
    const authResult = await requireFamilyImportReviewer(request);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const requestedId = cleanText(searchParams.get("id"));
    if (requestedId) {
      if (!/^\d+$/.test(requestedId)) {
        return Response.json({ error: "Invalid family import run ID." }, { status: 400 });
      }
      const payload = await getFamilyImportRunPayload(requestedId);
      if (!payload) {
        return Response.json({ error: "Family import run not found." }, { status: 404 });
      }
      return Response.json(payload, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }

    const requestedLimit = Number(searchParams.get("limit") || 12);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 50
      ? requestedLimit
      : 12;
    const runs = await sql`
      SELECT
        r.*,
        creator.name AS created_by_name,
        creator.email AS created_by_email
      FROM family_import_runs r
      LEFT JOIN users creator ON creator.id = r.created_by_user_id
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `;

    return Response.json(
      { runs: serializeRunList(runs) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Error fetching family import runs:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch family import runs." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    await ensureAppSchema();
    const authResult = await requireFamilyImportReviewer(request);
    if (authResult.error) return authResult.error;

    const body = await request.json().catch(() => null);
    const rawRows = Array.isArray(body?.rows) ? body.rows : [];
    const rows = rawRows.filter(
      (row) => row && typeof row === "object" && !Array.isArray(row) && !isFamilyImportCsvRowEmpty(row),
    );

    if (!rows.length) {
      return Response.json({ error: "Upload at least one non-empty family row." }, { status: 400 });
    }
    if (rows.length > FAMILY_IMPORT_MAX_ROWS) {
      return Response.json(
        { error: `Family Import supports up to ${FAMILY_IMPORT_MAX_ROWS} rows per upload.` },
        { status: 400 },
      );
    }

    // Upload is deliberately database-only. Do not add NXT lookups here: matching
    // is a reviewer-triggered, one-person-at-a-time action on the saved row.
    const normalizedRows = rows.map((row, index) => {
      const input = normalizeFamilyImportRow(row, index + 1);
      return {
        rowNumber: index + 1,
        familyKey: input.familyKey,
        input,
        review: createInitialFamilyReview(input),
        application: { parents: {}, relationships: {}, steps: [], attempts: [] },
      };
    });
    const summary = summarizeFamilyImportRows(
      normalizedRows.map(() => ({ status: "Needs Review" })),
    );

    const runs = await sql`
      INSERT INTO family_import_runs (
        created_by_user_id,
        status,
        source_filename,
        summary,
        row_count,
        ready_count,
        needs_review_count,
        skipped_count,
        applied_count,
        failed_count,
        created_at,
        updated_at
      )
      VALUES (
        ${authResult.user.id},
        'reviewing',
        ${cleanText(body?.sourceFilename) || null},
        ${JSON.stringify(summary)}::jsonb,
        ${summary.total},
        ${summary.ready},
        ${summary.needsReview},
        ${summary.skipped},
        ${summary.applied},
        ${summary.failed},
        NOW(),
        NOW()
      )
      RETURNING id
    `;
    const runId = String(runs[0]?.id || "");
    if (!runId) {
      throw new Error("Family import run could not be created.");
    }

    for (const row of normalizedRows) {
      await sql`
        INSERT INTO family_import_rows (
          run_id,
          row_number,
          family_key,
          status,
          input,
          review,
          application,
          created_at,
          updated_at
        )
        VALUES (
          ${runId},
          ${row.rowNumber},
          ${row.familyKey || null},
          'Needs Review',
          ${JSON.stringify(row.input)}::jsonb,
          ${JSON.stringify(row.review)}::jsonb,
          ${JSON.stringify(row.application)}::jsonb,
          NOW(),
          NOW()
        )
      `;
    }

    const payload = await getFamilyImportRunPayload(runId);
    return Response.json(payload, { status: 201 });
  } catch (error) {
    console.error("Error creating family import run:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create family import run." },
      { status: 500 },
    );
  }
}
