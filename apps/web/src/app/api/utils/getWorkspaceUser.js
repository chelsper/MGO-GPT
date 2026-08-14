import sql from "@/app/api/utils/sql";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  canUseExecutiveViewRole,
  canViewWorkspaceAsRole,
} from "@/utils/workspaceRoles";

const ACTING_USER_COOKIE = "workspace_acting_user_id";

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return new Map();
  return new Map(
    String(cookieHeader)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...rest] = part.split("=");
        return [name, decodeURIComponent(rest.join("=") || "")];
      }),
  );
}

export function getActingUserIdFromRequest(request) {
  const cookies = parseCookieHeader(request?.headers?.get?.("cookie") || "");
  const value = cookies.get(ACTING_USER_COOKIE);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function buildActingUserCookie(userId) {
  return `${ACTING_USER_COOKIE}=${encodeURIComponent(String(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
}

export function clearActingUserCookie() {
  return `${ACTING_USER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export default async function getWorkspaceUser(session, request) {
  const sessionUser = await getOrCreateUser(session);
  const actingUserId = getActingUserIdFromRequest(request);

  if (!canUseExecutiveViewRole(sessionUser.role) || !actingUserId || actingUserId === sessionUser.id) {
    return {
      sessionUser,
      workspaceUser: sessionUser,
      actingUser: null,
      isActing: false,
    };
  }

  const actingRows = await sql`
    SELECT *
    FROM users
    WHERE id = ${actingUserId}
      AND active = TRUE
    LIMIT 1
  `;

  const actingUser = actingRows[0] || null;
  if (!actingUser || !canViewWorkspaceAsRole(sessionUser.role, actingUser.role)) {
    return {
      sessionUser,
      workspaceUser: sessionUser,
      actingUser: null,
      isActing: false,
      invalidActingUserId: actingUserId,
    };
  }

  return {
    sessionUser,
    workspaceUser: actingUser,
    actingUser,
    isActing: true,
  };
}
