import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

async function normalizeActiveProspectOrder(userId) {
  const activeProspects = await sql`
    SELECT id
    FROM prospects
    WHERE user_id = ${userId} AND status = 'Active'
    ORDER BY
      CASE WHEN priority_order IS NULL THEN 1 ELSE 0 END,
      priority_order ASC,
      created_at ASC
  `;

  if (activeProspects.length === 0) {
    return;
  }

  await sql.transaction(
    activeProspects.map((prospect, index) => sql`
      UPDATE prospects
      SET priority_order = ${index + 1}
      WHERE id = ${prospect.id}
    `),
  );
}

// POST reorder prospects (swap two positions)
export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });

    await normalizeActiveProspectOrder(user.id);

    const body = await request.json();
    const { prospectId, direction } = body;

    if (!prospectId || !direction) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get the current prospect
    const current = await sql`
      SELECT id, priority_order FROM prospects
      WHERE id = ${prospectId} AND user_id = ${user.id} AND status = 'Active'
      LIMIT 1
    `;

    if (current.length === 0) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    const currentOrder = current[0].priority_order;

    let neighbor;
    if (direction === "up") {
      // Find the prospect with the next lower priority_order
      neighbor = await sql`
        SELECT id, priority_order FROM prospects
        WHERE user_id = ${user.id} AND status = 'Active' AND priority_order < ${currentOrder}
        ORDER BY priority_order DESC
        LIMIT 1
      `;
    } else {
      // Find the prospect with the next higher priority_order
      neighbor = await sql`
        SELECT id, priority_order FROM prospects
        WHERE user_id = ${user.id} AND status = 'Active' AND priority_order > ${currentOrder}
        ORDER BY priority_order ASC
        LIMIT 1
      `;
    }

    if (neighbor.length === 0) {
      return Response.json({ message: "Already at boundary" });
    }

    const neighborOrder = neighbor[0].priority_order;
    const neighborId = neighbor[0].id;

    // Swap the two orders using a transaction
    await sql.transaction([
      sql`UPDATE prospects SET priority_order = ${neighborOrder} WHERE id = ${prospectId}`,
      sql`UPDATE prospects SET priority_order = ${currentOrder} WHERE id = ${neighborId}`,
    ]);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error reordering prospects:", error);
    return Response.json({ error: "Failed to reorder" }, { status: 500 });
  }
}
