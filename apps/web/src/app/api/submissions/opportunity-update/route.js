import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { sendSubmissionEmail } from "@/app/api/utils/sendSubmissionEmail";
import { resolveConstituent } from "@/app/api/utils/constituents";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  saveProspectOpportunity,
  syncJointSolicitationOpportunities,
} from "@/app/api/utils/prospectOpportunities";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      donorName,
      opportunityTitle,
      opportunityStage,
      askAmount,
      askDate,
      expectedDate,
      notes,
      attachments,
      constituentId,
      blackbaudConstituentId,
      createNewConstituent,
      linkedProspectId,
      linkedOpportunityId,
      createNewOpportunity,
      jointMgoUserIds,
      sharedOpportunityKey,
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
      blackbaudConstituentId,
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
        opportunity_title,
        opportunity_stage,
        ask_date,
        expected_date,
        estimated_amount,
        notes,
        joint_mgo_user_ids,
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
        ${opportunityTitle || null},
        ${opportunityStage},
        ${askDate || null},
        ${expectedDate || null},
        ${askAmount || null},
        ${notes || null},
        ${jointMgoUserIds ? JSON.stringify(jointMgoUserIds) : null},
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
        askAmount: askAmount ?? null,
        askDate: askDate || null,
        expectedDate: expectedDate || null,
        latestNotes: notes || null,
        submissionId: savedSubmission.id,
        jointMgoUserIds: [user.id, ...(jointMgoUserIds || [])],
        sharedOpportunityKey:
          sharedOpportunityKey ||
          `submission:${savedSubmission.id}:${String(opportunityTitle || donorName).toLowerCase()}`,
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

    if (Array.isArray(jointMgoUserIds) && jointMgoUserIds.length > 0) {
      await syncJointSolicitationOpportunities({
        ownerUserId: user.id,
        jointUserIds: jointMgoUserIds,
        donorName,
        blackbaudConstituentId,
        title: opportunityTitle,
        currentStage: opportunityStage,
        askAmount: askAmount ?? null,
        askDate: askDate || null,
        expectedDate: expectedDate || null,
        latestNotes: notes || null,
        submissionId: savedSubmission.id,
        sharedOpportunityKey:
          sharedOpportunityKey ||
          `submission:${savedSubmission.id}:${String(opportunityTitle || donorName).toLowerCase()}`,
      });
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
