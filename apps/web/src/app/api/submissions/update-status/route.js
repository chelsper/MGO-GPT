import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { canReviewSubmission, isSubmissionHistoryOnly } from "@/utils/submissionReview";

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session, "reviewer");
    if (!isReviewerRole(user.role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { id, status, reviewerNotes } = body;
    const notesProvided = typeof reviewerNotes === "string";
    const normalizedNotes = notesProvided ? reviewerNotes.trim() : null;

    if (!id) {
      return Response.json(
        { error: "ID is required" },
        { status: 400 },
      );
    }

    const validStatuses = [
      "Pending",
      "Approved",
      "Needs Clarification",
      "Ready for CRM",
    ];
    if (status && !validStatuses.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    if (!status && !notesProvided) {
      return Response.json(
        { error: "Status or reviewer notes are required" },
        { status: 400 },
      );
    }

    const existing = await sql`
      SELECT id, status, submission_type, interaction_type, blackbaud_sync_status, blackbaud_sync_error
      FROM submissions WHERE id = ${id} LIMIT 1
    `;
    const current = existing[0];
    if (!current) return Response.json({ error: "Submission not found" }, { status: 404 });
    if (isSubmissionHistoryOnly(current)) {
      return Response.json({ error: "This activity is in History and does not require approval. Refresh the queue to see its current status." }, { status: 409 });
    }
    if (status && !canReviewSubmission(current)) {
      return Response.json({ error: "This activity needs NXT sync follow-up, not approval. You can save notes without changing its status." }, { status: 409 });
    }

    const result = await sql`
      UPDATE submissions
      SET
        status = COALESCE(${status}, status),
        reviewer_notes = CASE
          WHEN ${notesProvided} THEN ${normalizedNotes || null}
          ELSE reviewer_notes
        END,
        reviewer_notes_updated_at = CASE
          WHEN ${notesProvided} THEN NOW()
          ELSE reviewer_notes_updated_at
        END,
        reviewed_by = ${user.id},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
        AND status IS NOT DISTINCT FROM ${current.status}
        AND submission_type IS NOT DISTINCT FROM ${current.submission_type}
        AND interaction_type IS NOT DISTINCT FROM ${current.interaction_type}
        AND blackbaud_sync_status IS NOT DISTINCT FROM ${current.blackbaud_sync_status}
        AND blackbaud_sync_error IS NOT DISTINCT FROM ${current.blackbaud_sync_error}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "This activity changed while you were reviewing it. Refresh the queue before trying again." }, { status: 409 });
    }

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error updating submission status:", error);
    return Response.json(
      { error: error?.message || "Failed to update submission review" },
      { status: 500 },
    );
  }
}
