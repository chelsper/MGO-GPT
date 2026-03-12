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
    const {
      title,
      currentStage,
      estimatedAmount,
      latestNotes,
      opportunityStatus,
      closedAmount,
      closeDate,
      declineReason,
    } = body;

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

    const nextEstimatedAmount =
      estimatedAmount !== undefined ? estimatedAmount : existing.estimated_amount;
    const normalizedCloseDate =
      closeDate || (opportunityStatus && opportunityStatus !== "Active"
        ? new Date().toISOString().slice(0, 10)
        : existing.close_date || null);

    const updatedRows = await sql`
      UPDATE prospect_opportunities
      SET
        title = ${title?.trim() || existing.title},
        current_stage = ${currentStage || existing.current_stage},
        opportunity_status = ${opportunityStatus || existing.opportunity_status || "Active"},
        estimated_amount = ${nextEstimatedAmount},
        latest_notes = ${
          latestNotes?.trim() ? latestNotes.trim() : existing.latest_notes
        },
        closed_amount = CASE
          WHEN ${opportunityStatus} = 'Closed – Gift Secured'
            THEN ${closedAmount ?? nextEstimatedAmount ?? existing.closed_amount ?? 0}
          WHEN ${opportunityStatus} = 'Closed – Declined'
            THEN 0
          WHEN ${opportunityStatus} = 'Active'
            THEN NULL
          ELSE existing.closed_amount
        END,
        close_date = CASE
          WHEN ${opportunityStatus} = 'Closed – Gift Secured'
            THEN ${normalizedCloseDate}
          WHEN ${opportunityStatus} = 'Closed – Declined'
            THEN ${normalizedCloseDate}
          WHEN ${opportunityStatus} = 'Active'
            THEN NULL
          ELSE existing.close_date
        END,
        decline_reason = CASE
          WHEN ${opportunityStatus} = 'Closed – Declined'
            THEN ${declineReason?.trim() || existing.decline_reason || null}
          WHEN ${opportunityStatus} = 'Active'
            THEN NULL
          ELSE existing.decline_reason
        END,
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
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to update linked opportunity",
      },
      { status: 500 },
    );
  }
}
