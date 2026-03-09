import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { sendSubmissionEmail } from "@/app/api/utils/sendSubmissionEmail";

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
    VALUES (${name}, ${email}, 'mgo')
    RETURNING id, name
  `;
  return created[0];
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);

    const body = await request.json();
    const { donorName, opportunityStage, estimatedAmount, notes, attachments } =
      body;

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
        opportunity_stage,
        estimated_amount,
        notes,
        attachments,
        status
      ) VALUES (
        ${user.id},
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

    // Send email notification to advancement services (non-blocking)
    sendSubmissionEmail(result[0], "opportunity_update").catch((err) =>
      console.error("Email notification failed:", err),
    );

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating opportunity update:", error);
    return Response.json(
      { error: "Failed to create opportunity update" },
      { status: 500 },
    );
  }
}
