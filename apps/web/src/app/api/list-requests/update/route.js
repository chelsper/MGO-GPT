import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { isReviewerRole } from "@/utils/workspaceRoles";

const VALID_STATUSES = [
  "Pending",
  "Needs Clarification",
  "Complete",
  "Completed",
  "Approved",
  "Ready for CRM",
];
const VALID_PRIORITIES = [1, 2, 3];

function normalizeListRequestStatus(status) {
  const normalized = String(status || "").trim();
  if (!normalized) return null;
  if (normalized === "Needs Clarification") return "Needs Clarification";
  if (["Complete", "Completed", "Approved"].includes(normalized)) return "Complete";
  if (["Pending", "Ready for CRM"].includes(normalized)) return "Pending";
  return null;
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reviewer = await getOrCreateUser(session, "reviewer");
    if (!isReviewerRole(reviewer.role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { id, status, queuePriority, reviewerNotes } = body;
    const notesProvided = typeof reviewerNotes === "string";
    const normalizedNotes = notesProvided ? reviewerNotes.trim() : null;
    const normalizedStatus = status ? normalizeListRequestStatus(status) : null;
    const normalizedPriority =
      typeof queuePriority === "number" ? queuePriority : Number(queuePriority);

    if (!id) {
      return Response.json({ error: "ID is required" }, { status: 400 });
    }
    if (status && (!VALID_STATUSES.includes(status) || !normalizedStatus)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    if (
      queuePriority !== undefined &&
      (!Number.isInteger(normalizedPriority) ||
        !VALID_PRIORITIES.includes(normalizedPriority))
    ) {
      return Response.json({ error: "Invalid queue priority" }, { status: 400 });
    }
    if (!status && queuePriority === undefined && !notesProvided) {
      return Response.json(
        { error: "Status, queue priority, or reviewer notes are required" },
        { status: 400 },
      );
    }

    if (normalizedStatus === "Needs Clarification" && !normalizedNotes) {
      const existing = await sql`
        SELECT reviewer_notes
        FROM list_requests
        WHERE id = ${id}
        LIMIT 1
      `;
      const existingNotes = String(existing[0]?.reviewer_notes || "").trim();
      if (!existingNotes) {
        return Response.json(
          { error: "Add reviewer notes with the clarification question." },
          { status: 400 },
        );
      }
    }

    const result = await sql`
      UPDATE list_requests
      SET
        status = COALESCE(${normalizedStatus}, status),
        queue_priority = COALESCE(${Number.isInteger(normalizedPriority) ? normalizedPriority : null}, queue_priority),
        reviewer_notes = CASE
          WHEN ${notesProvided} THEN ${normalizedNotes || null}
          ELSE reviewer_notes
        END,
        reviewer_notes_updated_at = CASE
          WHEN ${notesProvided} THEN NOW()
          ELSE reviewer_notes_updated_at
        END,
        reviewed_by = ${reviewer.id},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "List request not found" }, { status: 404 });
    }

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error updating list request:", error);
    return Response.json(
      { error: error?.message || "Failed to update list request" },
      { status: 500 },
    );
  }
}
