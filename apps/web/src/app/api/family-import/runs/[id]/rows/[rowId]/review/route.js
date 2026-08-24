import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";
import {
  getFamilyImportRow,
  normalizeFamilyReview,
  parseFamilyRouteParams,
  refreshFamilyImportRunSummary,
  requireFamilyImportReviewer,
  serializeFamilyImportRow,
} from "@/app/api/family-import/utils";
import { getFamilyRowReadiness } from "@/utils/familyImport";

export async function PATCH(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireFamilyImportReviewer(request);
    if (authResult.error) return authResult.error;

    const parsedParams = parseFamilyRouteParams(params);
    if (parsedParams.error || !parsedParams.rowId) {
      return Response.json({ error: parsedParams.error || "Invalid family import row ID." }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    if (!body?.review || typeof body.review !== "object") {
      return Response.json({ error: "Provide the row review to save." }, { status: 400 });
    }

    const row = await getFamilyImportRow(parsedParams.runId, parsedParams.rowId);
    if (!row) {
      return Response.json({ error: "Family import row not found." }, { status: 404 });
    }
    if (row.status === "Applied") {
      return Response.json(
        { error: "Applied family rows are locked to preserve the NXT audit trail." },
        { status: 409 },
      );
    }

    const input = row.input && typeof row.input === "object" ? row.input : JSON.parse(row.input || "{}");
    const previousReview = row.review && typeof row.review === "object" ? row.review : JSON.parse(row.review || "{}");
    const review = normalizeFamilyReview(body.review, previousReview);
    const readiness = getFamilyRowReadiness(input, review);
    const nextStatus = readiness.ready ? "Ready" : "Needs Review";

    await sql`
      UPDATE family_import_rows
      SET
        status = ${nextStatus},
        review = ${JSON.stringify(review)}::jsonb,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE id = ${parsedParams.rowId}
        AND run_id = ${parsedParams.runId}
    `;
    const summary = await refreshFamilyImportRunSummary(parsedParams.runId);
    const updated = await getFamilyImportRow(parsedParams.runId, parsedParams.rowId);

    return Response.json({ row: serializeFamilyImportRow(updated), summary });
  } catch (error) {
    console.error("Error saving Family Import review:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save Family Import review." },
      { status: 500 },
    );
  }
}
