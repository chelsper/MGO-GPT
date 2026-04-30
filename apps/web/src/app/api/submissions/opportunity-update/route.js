import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { sendSubmissionEmail } from "@/app/api/utils/sendSubmissionEmail";
import { resolveConstituent } from "@/app/api/utils/constituents";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  saveProspectOpportunity,
  syncJointSolicitationOpportunities,
} from "@/app/api/utils/prospectOpportunities";
import {
  buildBlackbaudOpportunityPayload,
  createBlackbaudOpportunity,
  updateBlackbaudOpportunity,
} from "@/app/api/utils/blackbaud";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser: user } = await getWorkspaceUser(session, request);
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

    const origin = new URL(request.url).origin;
    const linkedBlackbaudConstituentId =
      blackbaudConstituentId || constituent?.blackbaud_constituent_id || null;

    let existingLinkedOpportunity = null;
    if (linkedOpportunityId) {
      const linkedOpportunityRows = await sql`
        SELECT po.*, p.user_id
        FROM prospect_opportunities po
        INNER JOIN prospects p ON p.id = po.prospect_id
        WHERE po.id = ${linkedOpportunityId} AND p.user_id = ${user.id}
        LIMIT 1
      `;
      existingLinkedOpportunity = linkedOpportunityRows[0] || null;
    }

    let blackbaudOpportunity = null;
    let blackbaudSync = null;

    if (linkedBlackbaudConstituentId) {
      const blackbaudPayload = buildBlackbaudOpportunityPayload({
        blackbaudConstituentId: linkedBlackbaudConstituentId,
        title: opportunityTitle,
        currentStage: opportunityStage,
        estimatedAmount: askAmount ?? null,
        askDate: askDate || null,
        expectedDate: expectedDate || null,
      });

      try {
        if (existingLinkedOpportunity?.blackbaud_opportunity_id) {
          await updateBlackbaudOpportunity({
            userId: user.id,
            authUserId: sessionUser?.id || user.id,
            origin,
            opportunityId: existingLinkedOpportunity.blackbaud_opportunity_id,
            payload: blackbaudPayload,
          });
          blackbaudOpportunity = {
            id: String(existingLinkedOpportunity.blackbaud_opportunity_id),
          };
          blackbaudSync = {
            status: "synced",
            opportunityId: String(existingLinkedOpportunity.blackbaud_opportunity_id),
          };
        } else {
          blackbaudOpportunity = await createBlackbaudOpportunity({
            userId: user.id,
            authUserId: sessionUser?.id || user.id,
            origin,
            payload: blackbaudPayload,
          });
          blackbaudSync = blackbaudOpportunity?.id
            ? {
                status: "synced",
                opportunityId: String(blackbaudOpportunity.id),
              }
            : null;
        }
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error && error.message
                ? `Could not sync NXT opportunity: ${error.message}`
                : "Could not sync NXT opportunity",
          },
          { status: 502 },
        );
      }
    }

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
        blackbaudOpportunityId:
          blackbaudOpportunity?.id ? String(blackbaudOpportunity.id) : null,
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

    return Response.json(
      {
        ...savedSubmission,
        blackbaudSync: blackbaudSync || { status: "local-only" },
      },
      { status: 201 },
    );
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
