import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  buildActingUserCookie,
  clearActingUserCookie,
  getActingUserIdFromRequest,
} from "@/app/api/utils/getWorkspaceUser";
import { isAdminRole } from "@/utils/workspaceRoles";

async function requireAdminSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session || !session.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getOrCreateUser(session, "admin");
  if (!isAdminRole(user.role)) {
    return {
      error: Response.json({ error: "Forbidden — admins only" }, { status: 403 }),
    };
  }

  return { session, user };
}

export async function GET(request) {
  const { error, user } = await requireAdminSession();
  if (error) return error;

  const actingUserId = getActingUserIdFromRequest(request);
  if (!actingUserId) {
    return Response.json({ actingUser: null, adminUser: user });
  }

  const rows = await sql`
    SELECT id, name, email, role, active, blackbaud_lookup_id
    FROM users
    WHERE id = ${actingUserId} AND role = 'mgo' AND active = TRUE
    LIMIT 1
  `;

  const response = Response.json({
    adminUser: user,
    actingUser: rows[0] || null,
  });

  if (!rows[0]) {
    response.headers.append("Set-Cookie", clearActingUserCookie());
  }

  return response;
}

export async function POST(request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = await request.json();
  const userId = Number(body?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return Response.json({ error: "Valid MGO user id is required." }, { status: 400 });
  }

  const rows = await sql`
    SELECT id, name, email, role, active, blackbaud_lookup_id
    FROM users
    WHERE id = ${userId} AND role = 'mgo' AND active = TRUE
    LIMIT 1
  `;

  if (!rows[0]) {
    return Response.json({ error: "Active MGO user not found." }, { status: 404 });
  }

  const response = Response.json({ actingUser: rows[0] });
  response.headers.append("Set-Cookie", buildActingUserCookie(userId));
  return response;
}

export async function DELETE() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const response = Response.json({ ok: true, actingUser: null });
  response.headers.append("Set-Cookie", clearActingUserCookie());
  return response;
}
