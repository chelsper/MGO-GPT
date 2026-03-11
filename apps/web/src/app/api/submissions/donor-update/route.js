import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { sendSubmissionEmail } from "@/app/api/utils/sendSubmissionEmail";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";

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
      interactionType,
      transcript,
      notes,
      nextStep,
      estimatedAmount,
      attachments,
    } = body;

    if (!donorName) {
      return Response.json(
        { error: "Donor name is required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO submissions (
        user_id,
        officer_name,
        submission_type,
        donor_name,
        interaction_type,
        transcript,
        notes,
        next_step,
        estimated_ask_amount,
        attachments,
        status
      ) VALUES (
        ${user.id},
        ${user.name},
        'donor_update',
        ${donorName},
        ${interactionType},
        ${transcript || null},
        ${notes || null},
        ${nextStep || null},
        ${estimatedAmount || null},
        ${attachments ? JSON.stringify(attachments) : null},
        'Pending'
      )
      RETURNING *
    `;

    // Send email notification to advancement services (non-blocking)
    sendSubmissionEmail(result[0], "donor_update").catch((err) =>
      console.error("Email notification failed:", err),
    );

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating donor update:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create donor update",
      },
      { status: 500 },
    );
  }
}
