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
      SELECT id, status
      FROM list_requests
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "List request not found" }, { status: 404 });
    }

    if (existing[0].status !== "Needs Clarification") {
      return Response.json(
        { error: "This list request is not waiting on clarification." },
        { status: 400 },
      );
    }

    const result = await sql`
      WITH updated AS (
        UPDATE list_requests
        SET
          requester_response = ${responseText},
          requester_response_updated_at = NOW(),
          status = 'Pending',
          updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING *
      )
      SELECT
        updated.*,
        reviewer_user.name AS reviewer_name
      FROM updated
      LEFT JOIN users reviewer_user ON updated.reviewed_by = reviewer_user.id
    `;

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error responding to list request:", error);
    return Response.json(
      { error: error?.message || "Failed to respond to list request" },
      { status: 500 },
    );
  }
}
