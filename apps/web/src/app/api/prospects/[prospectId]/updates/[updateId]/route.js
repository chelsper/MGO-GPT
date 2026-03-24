import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

export async function PUT(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { prospectId, updateId } = params;
    const body = await request.json();
    const updateDate = body?.updateDate || null;
    const updateNotes = body?.updateNotes?.trim() || "";

    if (!updateNotes) {
      return Response.json(
        { error: "Update notes are required" },
        { status: 400 },
      );
    }

    const result = await sql`
      UPDATE prospect_updates pu
      SET
        update_date = ${updateDate || new Date().toISOString().split("T")[0]},
        update_notes = ${updateNotes},
        created_at = pu.created_at
      FROM prospects p
      WHERE pu.id = ${updateId}
        AND pu.prospect_id = ${prospectId}
        AND p.id = pu.prospect_id
        AND p.user_id = ${user.id}
      RETURNING pu.*
    `;

    if (result.length === 0) {
      return Response.json({ error: "Update not found" }, { status: 404 });
    }

    await sql`
      UPDATE prospects
      SET updated_at = NOW()
      WHERE id = ${prospectId} AND user_id = ${user.id}
    `;

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error updating progress update:", error);
    return Response.json(
      { error: "Failed to update progress update" },
      { status: 500 },
    );
  }
}
