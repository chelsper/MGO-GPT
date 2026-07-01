import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  acceptInvitation,
  getProvisioningDecision,
  isBootstrapAdminEmail,
  normalizeEmail,
} from "@/app/api/utils/invitations";

export default async function getOrCreateUser(session, fallbackRole = "mgo") {
  await ensureAppSchema();

  const rawEmail = session?.user?.email;
  const email = normalizeEmail(rawEmail);
  if (!email) {
    throw new Error("Authenticated user email is required");
  }

  const name = session.user.name || email;

  const existing = await sql`
    SELECT
      users.id,
      users.name,
      users.email,
      users.role,
      users.active,
      users.deactivated_at,
      users.blackbaud_constituent_id,
      users.blackbaud_lookup_id,
      users.blackbaud_portfolio_seeded_at,
      users.blackbaud_portfolio_seed_attempted_at,
      users.blackbaud_portfolio_seed_error
    FROM users
    LEFT JOIN blackbaud_connections bb_connection
      ON bb_connection.user_id = users.id
    WHERE LOWER(users.email) = ${email}
    ORDER BY
      CASE WHEN bb_connection.user_id IS NOT NULL THEN 0 ELSE 1 END,
      users.created_at ASC
    LIMIT 1
  `;

  if (existing.length > 0) {
    if (existing[0].active === false) {
      throw new Error("This account has been deactivated. Contact an administrator.");
    }
    await acceptInvitation(email);
    if (isBootstrapAdminEmail(email) && existing[0].role !== "admin") {
      const elevated = await sql`
        UPDATE users
        SET role = 'admin', updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING
          id,
          name,
          email,
          role,
          active,
          deactivated_at,
          blackbaud_constituent_id,
          blackbaud_lookup_id,
          blackbaud_portfolio_seeded_at,
          blackbaud_portfolio_seed_attempted_at,
          blackbaud_portfolio_seed_error
      `;
      return elevated[0] || existing[0];
    }
    return existing[0];
  }

  const decision = await getProvisioningDecision(email);
  if (decision.kind === "none") {
    throw new Error(
      "An administrator must invite this email address before it can access the app",
    );
  }

  const assignedRole =
    decision.kind === "bootstrap-admin"
      ? "admin"
      : decision.kind === "invited"
        ? decision.role
        : fallbackRole;

  const created = await sql`
    INSERT INTO users (
      name,
      email,
      role,
      blackbaud_constituent_id,
      blackbaud_lookup_id,
      created_at
    )
    VALUES (
      ${name},
      ${email},
      ${assignedRole},
      ${decision.kind === "invited" ? decision.blackbaudConstituentId || null : null},
      ${decision.kind === "invited" ? decision.blackbaudLookupId || null : null},
      NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      blackbaud_constituent_id = COALESCE(users.blackbaud_constituent_id, EXCLUDED.blackbaud_constituent_id),
      blackbaud_lookup_id = COALESCE(users.blackbaud_lookup_id, EXCLUDED.blackbaud_lookup_id)
    RETURNING
      id,
      name,
      email,
      role,
      active,
      deactivated_at,
      blackbaud_constituent_id,
      blackbaud_lookup_id,
      blackbaud_portfolio_seeded_at,
      blackbaud_portfolio_seed_attempted_at,
      blackbaud_portfolio_seed_error
  `;

  if (created.length === 0) {
    throw new Error("Failed to create application user");
  }

  if (decision.kind === "invited") {
    await acceptInvitation(email);
  }

  return created[0];
}
