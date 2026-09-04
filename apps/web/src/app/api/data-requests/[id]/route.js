import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { normalizeDataRequestStatus } from "@/app/api/utils/dataRequests";

export async function PATCH(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser } = await getWorkspaceUser(session, request);
    const user = new URL(request.url).searchParams.get("view") === "reviewer" && isReviewerRole(sessionUser?.role)
      ? sessionUser : workspaceUser;
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (!isReviewerRole(user.role)) {
      return Response.json(
        { error: "Forbidden — Advancement Services only" },
        { status: 403 },
      );
    }

    const requestId = Number(params?.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return Response.json({ error: "Invalid data request ID" }, { status: 400 });
    }

    const body = await request.json();
    const status = normalizeDataRequestStatus(body?.status);
    const reviewerNotes =
      typeof body?.reviewerNotes === "string" ? body.reviewerNotes.trim() || null : null;

    const updated = await sql`
      UPDATE data_change_requests
      SET
        status = ${status},
        reviewer_notes = ${reviewerNotes},
        reviewed_by = ${user.id},
        reviewed_at = CASE
          WHEN ${status} IN ('Completed', 'Declined') THEN NOW()
          ELSE reviewed_at
        END,
        updated_at = NOW()
      WHERE id = ${requestId}
      RETURNING *
    `;

    if (updated.length === 0) {
      return Response.json({ error: "Data request not found" }, { status: 404 });
    }

    return Response.json(updated[0]);
  } catch (error) {
    console.error("Error updating data request:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update data request" },
      { status: 500 },
    );
  }
}
