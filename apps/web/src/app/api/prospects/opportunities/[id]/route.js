import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { syncProspectAskAmount } from "@/app/api/utils/prospectOpportunities";
import {
  buildBlackbaudOpportunityPayload,
  updateBlackbaudOpportunity,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

export async function PUT(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(
      session,
      request,
    );
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const authUserId = isActing ? sessionUser.id : user.id;
    const origin = request?.url ? new URL(request.url).origin : null;

    const opportunityId = params.id;
    const body = await request.json();
    const {
      title,
      currentStage,
      estimatedAmount,
      askDate,
      expectedDate,
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
    const nextOpportunityStatus =
      opportunityStatus || existing.opportunity_status || "Active";
    const nextLatestNotes =
      latestNotes?.trim() ? latestNotes.trim() : existing.latest_notes;
    const nextTitle = title?.trim() || existing.title;
    const nextStage = currentStage || existing.current_stage;
    const nextClosedAmount =
      nextOpportunityStatus === "Closed – Gift Secured"
        ? (closedAmount ?? nextEstimatedAmount ?? existing.closed_amount ?? 0)
        : nextOpportunityStatus === "Closed – Declined"
          ? 0
          : nextOpportunityStatus === "Active"
            ? null
            : existing.closed_amount;
    const normalizedCloseDate =
      closeDate || (nextOpportunityStatus !== "Active"
        ? new Date().toISOString().slice(0, 10)
        : existing.close_date || null);
    const nextCloseDate =
      nextOpportunityStatus === "Active"
        ? null
        : nextOpportunityStatus === "Closed – Gift Secured" || nextOpportunityStatus === "Closed – Declined"
          ? normalizedCloseDate
          : existing.close_date;
    const nextDeclineReason =
      nextOpportunityStatus === "Closed – Declined"
        ? declineReason?.trim() || existing.decline_reason || null
        : nextOpportunityStatus === "Active"
          ? null
          : existing.decline_reason;

    if (existing.blackbaud_opportunity_id) {
      const blackbaudPayload = buildBlackbaudOpportunityPayload({
        title: nextTitle,
        currentStage: nextStage,
        estimatedAmount: nextEstimatedAmount,
        askDate: askDate || existing.ask_date || null,
        expectedDate: expectedDate || existing.expected_date || null,
        opportunityStatus: nextOpportunityStatus,
        closedAmount: nextClosedAmount,
        closeDate: nextCloseDate,
      });

      if (Object.keys(blackbaudPayload).length > 0) {
        try {
          await updateBlackbaudOpportunity({
            userId: user.id,
            authUserId,
            origin,
            opportunityId: existing.blackbaud_opportunity_id,
            payload: blackbaudPayload,
          });
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error && error.message
                  ? `Could not update NXT opportunity: ${error.message}`
                  : "Could not update NXT opportunity",
            },
            { status: 502 },
          );
        }
      }
    }

    const updatedRows = await sql`
      UPDATE prospect_opportunities
      SET
        title = ${nextTitle},
        current_stage = ${nextStage},
        opportunity_status = ${nextOpportunityStatus},
        estimated_amount = ${nextEstimatedAmount},
        ask_date = ${askDate || existing.ask_date || null},
        expected_date = ${expectedDate || existing.expected_date || null},
        latest_notes = ${nextLatestNotes},
        closed_amount = ${nextClosedAmount},
        close_date = ${nextCloseDate},
        decline_reason = ${nextDeclineReason},
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *
    `;

    const updated = updatedRows[0];
    await syncProspectAskAmount(updated.prospect_id);

    return Response.json({
      ...updated,
      blackbaudSync: existing.blackbaud_opportunity_id
        ? {
            status: "synced",
            opportunityId: existing.blackbaud_opportunity_id,
          }
        : {
            status: "local-only",
          },
    });
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
