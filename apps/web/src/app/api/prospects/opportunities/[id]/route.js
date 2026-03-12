import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { syncProspectAskAmount } from "@/app/api/utils/prospectOpportunities";

async function getUser(session) {
  const email = session.user.email;
  const existing =
    await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  return existing[0] || null;
}

export async function PUT(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUser(session);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const opportunityId = params.id;
    const body = await request.json();
    const { title, currentStage, estimatedAmount, latestNotes } = body;

    const existingRows = await sql`
      SELECT po.*, p.user_id
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE po.id = ${opportunityId} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const existing = existingRows[0] || null;
    if (!existing) {
      return Response.json({ error: "Linked opportunity not found" }, { status: 404 });
    }

    const updatedRows = await sql`
      UPDATE prospect_opportunities
      SET
        title = ${title?.trim() || existing.title},
        current_stage = ${currentStage || existing.current_stage},
        estimated_amount = ${estimatedAmount ?? existing.estimated_amount},
        latest_notes = ${
          latestNotes?.trim() ? latestNotes.trim() : existing.latest_notes
        },
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *
    `;

    const updated = updatedRows[0];
    await syncProspectAskAmount(updated.prospect_id);

    return Response.json(updated);
  } catch (error) {
    console.error("Error updating linked opportunity:", error);
    return Response.json(
      { error: "Failed to update linked opportunity" },
      { status: 500 },
    );
  }
}
