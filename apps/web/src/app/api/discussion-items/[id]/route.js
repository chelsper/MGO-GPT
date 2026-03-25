import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

export async function PATCH(request, { params }) {
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

    const discussionId = params.id;
    const body = await request.json();
    const {
      subject,
      body: discussionBody,
      dueDate,
      status,
      assignedUserId,
      initiativeName,
    } = body || {};

    const existing = await sql`
      SELECT id
      FROM discussion_items
      WHERE id = ${discussionId}
        AND (
          owner_user_id = ${user.id}
          OR assigned_user_id = ${user.id}
        )
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "Discussion item not found" }, { status: 404 });
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    const assign = (column, value) => {
      paramCount += 1;
      updates.push(`${column} = $${paramCount}`);
      values.push(value);
    };

    if (subject !== undefined) assign("subject", subject?.trim() || null);
    if (discussionBody !== undefined) assign("body", discussionBody?.trim() || null);
    if (dueDate !== undefined) assign("due_date", dueDate || null);
    if (status !== undefined) assign("status", status || "Open");
    if (assignedUserId !== undefined) assign("assigned_user_id", assignedUserId || null);
    if (initiativeName !== undefined) assign("initiative_name", initiativeName?.trim() || null);

    assign("updated_at", new Date().toISOString());

    paramCount += 1;
    values.push(discussionId);
    paramCount += 1;
    values.push(user.id);

    const result = await sql(
      `UPDATE discussion_items
       SET ${updates.join(", ")}
       WHERE id = $${paramCount - 1}
         AND (
           owner_user_id = $${paramCount}
           OR assigned_user_id = $${paramCount}
         )
       RETURNING *`,
      values,
    );

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error updating discussion item:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update discussion item",
      },
      { status: 500 },
    );
  }
}
