import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { isAssignableRole } from "@/utils/workspaceRoles";

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function getBootstrapAdminEmail() {
  return normalizeEmail(process.env.WORKSPACE_BOOTSTRAP_ADMIN_EMAIL);
}

export function isBootstrapAdminEmail(email) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized) && normalized === getBootstrapAdminEmail();
}

export function assertAssignableRole(role) {
  if (!isAssignableRole(role)) {
    throw new Error("Invalid role");
  }
}

export async function getPendingInvitationByEmail(email) {
  await ensureAppSchema();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const rows = await sql`
    SELECT id, email, role, invited_by, created_at, accepted_at, revoked_at
    FROM user_invitations
    WHERE email = ${normalizedEmail}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function getProvisioningDecision(email) {
  await ensureAppSchema();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { kind: "none", role: null, email: normalizedEmail };
  }

  const existingRows = await sql`
    SELECT id, role
    FROM users
    WHERE email = ${normalizedEmail}
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    return {
      kind: "existing",
      role: existingRows[0].role,
      email: normalizedEmail,
      userId: existingRows[0].id,
    };
  }

  if (isBootstrapAdminEmail(normalizedEmail)) {
    return {
      kind: "bootstrap-admin",
      role: "admin",
      email: normalizedEmail,
    };
  }

  const invitation = await getPendingInvitationByEmail(normalizedEmail);
  if (invitation) {
    return {
      kind: "invited",
      role: invitation.role,
      email: normalizedEmail,
      invitation,
    };
  }

  return {
    kind: "none",
    role: null,
    email: normalizedEmail,
  };
}

export async function acceptInvitation(email) {
  await ensureAppSchema();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  await sql`
    UPDATE user_invitations
    SET accepted_at = NOW(), updated_at = NOW()
    WHERE email = ${normalizedEmail}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
  `;
}
