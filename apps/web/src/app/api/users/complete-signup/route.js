import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { acceptInvitation, getProvisioningDecision } from "@/app/api/utils/invitations";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email } = body;
    const userRole = "mgo";
    const userEmail = session.user.email;

    if (email && email !== userEmail) {
      return Response.json({ error: "Email mismatch" }, { status: 400 });
    }

    // Check if user already exists in users table
    const existing = await sql`
      SELECT id FROM users WHERE email = ${userEmail}
    `;

    if (existing.length > 0) {
      return Response.json({ success: true, user: existing[0] });
    }

    const decision = await getProvisioningDecision(userEmail);
    if (decision.kind === "none") {
      return Response.json(
        { error: "An administrator must invite this email address before it can access the app" },
        { status: 403 },
      );
    }

    // Create user in users table
    const result = await sql`
      INSERT INTO users (name, email, role, created_at)
      VALUES (${name}, ${userEmail}, ${decision.kind === "bootstrap-admin" ? "admin" : userRole}, NOW())
      RETURNING id, name, email, role
    `;

    if (decision.kind === "invited") {
      await acceptInvitation(userEmail);
    }

    return Response.json({ success: true, user: result[0] });
  } catch (error) {
    console.error("Complete signup error:", error);
    return Response.json(
      { error: "Failed to complete signup" },
      { status: 500 },
    );
  }
}
