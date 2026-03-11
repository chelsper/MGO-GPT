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
      name,
      organization,
      email,
      phone,
      notes,
      assignToMe,
      businessCardUrl,
      attachments,
    } = body;

    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO submissions (
        user_id,
        officer_name,
        submission_type,
        constituent_name,
        organization,
        email,
        phone,
        notes,
        assign_to_me,
        business_card_url,
        attachments,
        status
      ) VALUES (
        ${user.id},
        ${user.name},
        'constituent_suggestion',
        ${name},
        ${organization || null},
        ${email || null},
        ${phone || null},
        ${notes || null},
        ${assignToMe || null},
        ${businessCardUrl || null},
        ${attachments ? JSON.stringify(attachments) : null},
        'Pending'
      )
      RETURNING *
    `;

    // Send email notification to advancement services (non-blocking)
    sendSubmissionEmail(result[0], "constituent_suggestion").catch((err) =>
      console.error("Email notification failed:", err),
    );

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating constituent suggestion:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create constituent suggestion",
      },
      { status: 500 },
    );
  }
}
