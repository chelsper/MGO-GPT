import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { acceptInvitation, getProvisioningDecision, isBootstrapAdminEmail } from "@/app/api/utils/invitations";

export default async function getOrCreateUser(session, fallbackRole = "mgo") {
  await ensureAppSchema();

  const email = session?.user?.email;
  if (!email) {
    throw new Error("Authenticated user email is required");
  }

  const name = session.user.name || email;

  const existing = await sql`
    SELECT id, name, email, role
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (existing.length > 0) {
    if (isBootstrapAdminEmail(email) && existing[0].role !== "admin") {
      const elevated = await sql`
        UPDATE users
        SET role = 'admin', updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, name, email, role
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
    INSERT INTO users (name, email, role, created_at)
    VALUES (${name}, ${email}, ${assignedRole}, NOW())
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, email, role
  `;

  if (created.length === 0) {
    throw new Error("Failed to create application user");
  }

  if (decision.kind === "invited") {
    await acceptInvitation(email);
  }

  return created[0];
}
