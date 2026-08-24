import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";
import {
  getFamilyImportRow,
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
    const body = await request.json().catch(() => ({}));
    const row = await getFamilyImportRow(parsedParams.runId, parsedParams.rowId);
    if (!row) {
      return Response.json({ error: "Family import row not found." }, { status: 404 });
    }
    if (row.status === "Applied") {
      return Response.json({ error: "Applied family rows cannot be skipped." }, { status: 409 });
    }

    const input = row.input && typeof row.input === "object" ? row.input : JSON.parse(row.input || "{}");
    const review = row.review && typeof row.review === "object" ? row.review : JSON.parse(row.review || "{}");
    const restore = body?.restore === true;
    const nextStatus = restore
      ? getFamilyRowReadiness(input, review).ready
        ? "Ready"
        : "Needs Review"
      : "Skipped";

    await sql`
      UPDATE family_import_rows
      SET status = ${nextStatus}, updated_at = NOW()
      WHERE id = ${parsedParams.rowId}
        AND run_id = ${parsedParams.runId}
    `;
    const summary = await refreshFamilyImportRunSummary(parsedParams.runId);
    const updated = await getFamilyImportRow(parsedParams.runId, parsedParams.rowId);

    return Response.json({ row: serializeFamilyImportRow(updated), summary });
  } catch (error) {
    console.error("Error updating Family Import row status:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update Family Import row." },
      { status: 500 },
    );
  }
}
