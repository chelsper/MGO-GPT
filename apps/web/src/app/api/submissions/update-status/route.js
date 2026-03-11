import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session, "reviewer");

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
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
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
