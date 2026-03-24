import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

// POST add a progress update
export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });

    const prospectId = params.id;

    // Verify ownership
    const prospect = await sql`
      SELECT id FROM prospects WHERE id = ${prospectId} AND user_id = ${user.id} LIMIT 1
    `;
    if (prospect.length === 0) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    const body = await request.json();
    const { updateDate, updateNotes } = body;

    if (!updateNotes) {
      return Response.json(
        { error: "Update notes are required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO prospect_updates (prospect_id, update_date, update_notes)
      VALUES (${prospectId}, ${updateDate || new Date().toISOString().split("T")[0]}, ${updateNotes})
      RETURNING *
    `;

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error adding progress update:", error);
    return Response.json(
      { error: "Failed to add progress update" },
      { status: 500 },
    );
  }
}
