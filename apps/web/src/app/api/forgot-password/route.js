import sql from "@/app/api/utils/sql";
import crypto from "crypto";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "MGO VoiceLog <onboarding@resend.dev>";

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    // Always return success to avoid leaking whether an email exists
    const successResponse = Response.json({
      message:
        "If an account exists with that email, a reset link has been sent.",
    });

    // Look up user in auth_users
    const users = await sql`
      SELECT id, email, name FROM auth_users WHERE email = ${email} LIMIT 1
    `;

    if (users.length === 0) {
      // Don't reveal that the email doesn't exist
      return successResponse;
    }

    const user = users[0];

    // Check if there's a valid unexpired token already (rate limiting)
    const existingTokens = await sql`
      SELECT id FROM password_reset_tokens
      WHERE user_id = ${user.id}
        AND used = false
        AND expires_at > NOW()
        AND created_at > NOW() - INTERVAL '2 minutes'
    `;

    if (existingTokens.length > 0) {
      // Already sent a reset email recently
      return successResponse;
    }

    // Generate a secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store the token
    await sql`
      INSERT INTO password_reset_tokens (token, user_id, used, expires_at)
      VALUES (${token}, ${user.id}, false, ${expiresAt.toISOString()})
    `;

    // Build the reset link
    const baseUrl =
      process.env.NEXT_PUBLIC_CREATE_APP_URL || "http://localhost:4000";
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Send the email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error(
        "RESEND_API_KEY is not set — cannot send password reset email",
      );
      return Response.json(
        { error: "Email service is not configured" },
        { status: 500 },
      );
    }

    const firstName = user.name ? user.name.split(" ")[0] : "there";

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: bold; color: #111827; margin: 0;">MGO-GPT</h1>
        </div>
        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 8px;">Hi ${firstName},</p>
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
          We received a request to reset your password. Click the button below to choose a new one. This link will expire in 1 hour.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background-color: #6A5BFF; color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 13px; color: #9ca3af; line-height: 1.5; margin-bottom: 16px;">
          If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">
          If the button doesn't work, copy and paste this link into your browser:<br />
          <a href="${resetLink}" style="color: #6A5BFF; word-break: break-all;">${resetLink}</a>
        </p>
      </div>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [user.email],
        subject: "Reset your MGO-GPT password",
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", emailResponse.status, errorText);
      // Still return success — the token was created, and we don't want
      // to reveal whether the email exists or not
    } else {
      const result = await emailResponse.json();
      console.log("Password reset email sent, id:", result.id);
    }

    return successResponse;
  } catch (error) {
    console.error("Forgot password error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
