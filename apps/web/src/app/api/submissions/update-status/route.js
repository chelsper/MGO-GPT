import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

async function getOrCreateUser(session) {
  const email = session.user.email;
  const name = session.user.name || email;

  const existing =
    await sql`SELECT id, name FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) {
    return existing[0];
  }

  const created = await sql`
    INSERT INTO users (name, email, role)
    VALUES (${name}, ${email}, 'reviewer')
    RETURNING id, name
  `;
  return created[0];
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return Response.json(
        { error: "ID and status are required" },
        { status: 400 },
      );
    }

    const validStatuses = [
      "Pending",
      "Approved",
      "Needs Clarification",
      "Ready for CRM",
    ];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    const result = await sql`
      UPDATE submissions
      SET
        status = ${status},
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
      { error: "Failed to update submission status" },
      { status: 500 },
    );
  }
}
