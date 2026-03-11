import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;

    if (!currentPassword || !newPassword) {
      return Response.json(
        { error: "Current password and new password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return Response.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return Response.json(
        { error: "New password must include at least one letter and one number" },
        { status: 400 },
      );
    }

    const users = await sql`
      SELECT id, email FROM auth_users WHERE email = ${session.user.email} LIMIT 1
    `;

    if (users.length === 0) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const authUser = users[0];
    const accounts = await sql`
      SELECT id, password
      FROM auth_accounts
      WHERE "userId" = ${authUser.id}
        AND provider = 'credentials'
      LIMIT 1
    `;

    if (accounts.length === 0 || !accounts[0].password) {
      return Response.json(
        { error: "This account does not support password changes." },
        { status: 400 },
      );
    }

    const { verify, hash } = await import("argon2");
    const isValid = await verify(accounts[0].password, currentPassword);
    if (!isValid) {
      return Response.json(
        { error: "Current password is incorrect." },
        { status: 400 },
      );
    }

    const hashedPassword = await hash(newPassword);
    await sql`
      UPDATE auth_accounts
      SET password = ${hashedPassword}
      WHERE id = ${accounts[0].id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return Response.json(
      { error: "Failed to change password" },
      { status: 500 },
    );
  }
}
