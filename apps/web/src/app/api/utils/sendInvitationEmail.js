import { randomUUID } from "node:crypto";
import sql from "@/app/api/utils/sql";

const JU_PROJECT = "prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY";
const SIGN_IN = "https://www.jumgogpt.app/account/signin";

export function invitationEmailConfiguration(env = process.env) {
  const address = String(env.RESEND_FROM_EMAIL || "").trim();
  return Boolean(
    env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_ID === JU_PROJECT &&
    (env.WORKSPACE_EMAIL_DOMAIN || "ju.edu").toLowerCase() === "ju.edu" &&
    env.OKTA_CLIENT_ID && env.OKTA_CLIENT_SECRET && env.OKTA_ISSUER &&
    env.RESEND_API_KEY &&
    ["notifications@jumgogpt.app", "jumgogpt <notifications@jumgogpt.app>"].includes(address.toLowerCase()),
  );
}

export function buildInvitationEmail(email) {
  const subject = "You're invited to JUMGOGPT - sign in with JU OKTA";
  const steps = [
    `Open ${SIGN_IN}`,
    'Select "Continue with Jacksonville University SSO".',
    "On the JU OKTA sign-in screen, use your existing Jacksonville University username and password. Complete your normal MFA verification if prompted.",
  ];
  const note = "You do not need to create a new account or a separate JUMGOGPT password. Only enter your JU password on the university's OKTA sign-in screen, never in an email.";
  const help = "Use the JU account associated with this invitation. If you cannot access the app, contact the administrator who invited you. This is an automated, send-only email; replies are not monitored.";
  return {
    from: "JUMGOGPT <notifications@jumgogpt.app>",
    to: [email],
    subject,
    text: `You've been invited to JUMGOGPT, Jacksonville University's advancement workspace.\n\n${steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\n${note}\n\n${help}`,
    html: `<div style="font-family:Georgia,serif;max-width:600px;margin:auto;color:#172c26;padding:32px"><p style="color:#007a59;font-family:Arial,sans-serif;font-weight:bold;letter-spacing:2px">JUMGOGPT</p><h1 style="font-size:30px">Your JU workspace is ready</h1><p>You've been invited to Jacksonville University's advancement workspace.</p><p style="margin:28px 0"><a href="${SIGN_IN}" style="display:inline-block;background:#007a59;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif">Sign in to JUMGOGPT</a></p><ol><li>Open JUMGOGPT using the button above.</li><li>Select <strong>Continue with Jacksonville University SSO</strong>.</li><li>On the JU OKTA screen, use your existing JU username and password, then complete your normal MFA verification if prompted.</li></ol><p>${note}</p><p style="font-size:14px;color:#53645e">${help}</p><p style="font-size:13px">If the button does not work: <a href="${SIGN_IN}">${SIGN_IN}</a></p></div>`,
  };
}

// A durable claim prevents double-clicks or repeated invite requests from sending twice.
// Uncertain outcomes remain blocked, including after provider idempotency expires.
export async function sendInvitationEmail(invitationId, { resend = false } = {}) {
  const attemptId = randomUUID();
  try {
    const rows = await sql`
      UPDATE user_invitations
      SET invitation_email = jsonb_build_object(
        'status', 'sending', 'attemptId', ${attemptId}::text,
        'attemptedAt', NOW())
      WHERE id = ${invitationId}
        AND accepted_at IS NULL AND revoked_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(users.email) = LOWER(user_invitations.email))
        AND (invitation_email IS NULL OR (
          ${resend} AND invitation_email->>'status' IN ('accepted', 'failed', 'skipped')
          AND (invitation_email->>'attemptedAt')::timestamptz < NOW() - INTERVAL '60 seconds'
        ))
      RETURNING email, invitation_email
    `;
    if (!rows.length) {
      const current = await sql`
        SELECT invitation_email FROM user_invitations
        WHERE id = ${invitationId} AND accepted_at IS NULL AND revoked_at IS NULL
      `;
      return current[0]?.invitation_email || { status: "unavailable" };
    }
    const email = String(rows[0].email || "").trim().toLowerCase();
    let delivery = { status: "skipped" };
    if (invitationEmailConfiguration() && email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@ju\.edu$/i.test(email)) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `ju-invitation/${invitationId}/${attemptId}`,
          },
          body: JSON.stringify(buildInvitationEmail(email)),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const result = await response.json().catch(() => null);
          delivery = typeof result?.id === "string" && result.id
            ? { status: "accepted", messageId: result.id }
            : { status: "unknown" };
        } else {
          delivery = { status: response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status) ? "failed" : "unknown" };
        }
      } catch {
        delivery = { status: "unknown" };
      }
    }
    const saved = await sql`
      UPDATE user_invitations
      SET invitation_email = invitation_email || ${JSON.stringify(delivery)}::jsonb
      WHERE id = ${invitationId} AND invitation_email->>'attemptId' = ${attemptId}
      RETURNING invitation_email
    `;
    return saved[0]?.invitation_email || { status: "unknown" };
  } catch {
    // Access is already saved. Never expose credentials/provider payloads or resend here.
    console.error("Invitation email status could not be recorded; administrator verification required.");
    return { status: "unknown" };
  }
}
