import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { sendSubmissionEmail } from "@/app/api/utils/sendSubmissionEmail";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { resolveConstituent } from "@/app/api/utils/constituents";
import { saveProspectOpportunity } from "@/app/api/utils/prospectOpportunities";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);

    const body = await request.json();
    const {
      donorName,
      opportunityStage,
      estimatedAmount,
      notes,
      attachments,
      constituentId,
      createNewConstituent,
      linkedProspectId,
      linkedOpportunityId,
      createNewOpportunity,
      opportunityTitle,
    } = body;

    if (!donorName) {
      return Response.json(
        { error: "Donor name is required" },
        { status: 400 },
      );
    }

    const constituent = await resolveConstituent({
      userId: user.id,
      name: donorName,
      constituentId,
      createNew: Boolean(createNewConstituent),
    });

    const result = await sql`
      INSERT INTO submissions (
        user_id,
        constituent_id,
        prospect_id,
        prospect_opportunity_id,
        officer_name,
        submission_type,
        donor_name,
        opportunity_stage,
        estimated_amount,
        notes,
        attachments,
        status
      ) VALUES (
        ${user.id},
        ${constituent?.id || null},
        ${linkedProspectId || null},
        ${null},
        ${user.name},
        'opportunity_update',
        ${donorName},
        ${opportunityStage},
        ${estimatedAmount || null},
        ${notes || null},
        ${attachments ? JSON.stringify(attachments) : null},
        'Pending'
      )
      RETURNING *
    `;

    let savedSubmission = result[0];

    if (
      linkedProspectId &&
      (createNewOpportunity || linkedOpportunityId)
    ) {
      const linkedOpportunity = await saveProspectOpportunity({
        userId: user.id,
        prospectId: linkedProspectId,
        constituentId: constituent?.id || null,
        opportunityId: createNewOpportunity ? null : linkedOpportunityId,
        title: opportunityTitle,
        currentStage: opportunityStage,
        estimatedAmount: estimatedAmount ?? null,
        latestNotes: notes || null,
        submissionId: savedSubmission.id,
      });

      const updatedSubmission = await sql`
        UPDATE submissions
        SET
          prospect_id = ${linkedOpportunity.prospectId},
          prospect_opportunity_id = ${linkedOpportunity.opportunity?.id || null},
          updated_at = NOW()
        WHERE id = ${savedSubmission.id}
        RETURNING *
      `;

      savedSubmission = updatedSubmission[0] || savedSubmission;
    }

    // Send email notification to advancement services (non-blocking)
    sendSubmissionEmail(savedSubmission, "opportunity_update").catch((err) =>
      console.error("Email notification failed:", err),
    );

    return Response.json(savedSubmission, { status: 201 });
  } catch (error) {
    console.error("Error creating opportunity update:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create opportunity update",
      },
      { status: 500 },
    );
  }
}
