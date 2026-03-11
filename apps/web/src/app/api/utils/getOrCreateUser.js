import sql from "@/app/api/utils/sql";

export default async function getOrCreateUser(session, fallbackRole = "mgo") {
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
    return existing[0];
  }

  const created = await sql`
    INSERT INTO users (name, email, role, created_at)
    VALUES (${name}, ${email}, ${fallbackRole}, NOW())
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, email, role
  `;

  if (created.length === 0) {
    throw new Error("Failed to create application user");
  }

  return created[0];
}
