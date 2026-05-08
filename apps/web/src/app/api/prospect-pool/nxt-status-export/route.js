import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  buildProspectPoolExportRows,
  serializeProspectPoolExportRows,
} from "../workflow";

export async function GET() {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);
    if (!isReviewerRole(currentUser.role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const audits = await sql`
      SELECT
        audit.*
      FROM prospect_pool_assignment_audits audit
      WHERE audit.nxt_sync_status IN ('pending', 'failed', 'manual_required')
      ORDER BY audit.assigned_at DESC, audit.id DESC
    `;

    const exportRows = buildProspectPoolExportRows(audits);
    const csv = serializeProspectPoolExportRows(exportRows);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prospect-pool-nxt-status-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting prospect pool NXT queue:", error);
    return Response.json(
      { error: error?.message || "Failed to export NXT status queue" },
      { status: 500 },
    );
  }
}
