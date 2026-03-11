import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return Response.json(
        { error: "Token and password are required" },
        { status: 400 },
      );
    }

    // Validate password
    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }
    if (!/[a-zA-Z]/.test(password)) {
      return Response.json(
        { error: "Password must contain at least one letter" },
        { status: 400 },
      );
    }
    if (!/[0-9]/.test(password)) {
      return Response.json(
        { error: "Password must contain at least one number" },
        { status: 400 },
      );
    }

    // Find valid token
    const tokens = await sql`
      SELECT prt.*, au.id as auth_user_id, au.email
      FROM password_reset_tokens prt
      JOIN auth_users au ON prt.user_id = au.id
      WHERE prt.token = ${token}
        AND prt.used = false
        AND prt.expires_at > NOW()
    `;

    if (tokens.length === 0) {
      return Response.json(
        {
          error:
            "This reset link is invalid or has expired. Please request a new one.",
        },
        { status: 400 },
      );
    }

    const resetToken = tokens[0];

    // Lazy-load argon2 so route registration does not crash if native bindings fail at startup.
    const { hash } = await import("argon2");
    const hashedPassword = await hash(password);

    // Update user's password and mark token as used
    await sql.transaction([
      sql`
        UPDATE auth_accounts
        SET password = ${hashedPassword}
        WHERE "userId" = ${resetToken.auth_user_id} AND provider = 'credentials'
      `,
      sql`
        UPDATE password_reset_tokens
        SET used = true
        WHERE token = ${token}
      `,
    ]);

    return Response.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
