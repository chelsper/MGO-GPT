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

    const user = await getOrCreateUser(session);
    const body = await request.json();
    const { id, clarificationResponse } = body;
    const responseText = String(clarificationResponse || "").trim();

    if (!id) {
      return Response.json({ error: "ID is required" }, { status: 400 });
    }

    if (!responseText) {
      return Response.json(
        { error: "Clarification response is required" },
        { status: 400 },
      );
    }

    const existing = await sql`
      SELECT id, notes
      FROM submissions
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    const currentNotes = String(existing[0].notes || "").trim();
    const clarificationBlock = `Clarification Response (${new Date().toLocaleString()}):\n${responseText}`;
    const nextNotes = currentNotes
      ? `${currentNotes}\n\n${clarificationBlock}`
      : clarificationBlock;

    const result = await sql`
      UPDATE submissions
      SET
        notes = ${nextNotes},
        status = 'Pending',
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    `;

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error resubmitting submission:", error);
    return Response.json(
      { error: error?.message || "Failed to resubmit submission" },
      { status: 500 },
    );
  }
}
