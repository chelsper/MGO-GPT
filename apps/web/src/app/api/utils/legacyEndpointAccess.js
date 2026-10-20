import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { isAdminRole, isReviewerRole } from "@/utils/workspaceRoles";

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

export class EndpointError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function privateJson(body, init = {}) {
  return Response.json(body, { ...init, headers: { ...PRIVATE_HEADERS, ...init.headers } });
}

export function endpointFailure(error, message) {
  return privateJson(
    { error: error instanceof EndpointError ? error.message : message },
    {
      status: error instanceof EndpointError ? error.status : 503,
      ...(error instanceof EndpointError && error.status === 429
        ? { headers: { "Retry-After": "600" } } : {}),
    },
  );
}

export async function requireActiveAccount(request, { role, mutation = false } = {}) {
  const session = await auth(request);
  if (!session?.user?.email) throw new EndpointError("Please sign in to continue.", 401);
  const [user] = await sql`
    SELECT id, role, active FROM users
    WHERE LOWER(email) = LOWER(${session.user.email}) LIMIT 1
  `;
  if (!user?.id || user.active !== true) throw new EndpointError("An active app account is required.", 403);
  if ((role === "admin" && !isAdminRole(user.role)) ||
      (role === "reviewer" && !isReviewerRole(user.role))) {
    throw new EndpointError("Your account does not have access to this feature.", 403);
  }
  if (mutation) {
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) ||
        request.headers.get("sec-fetch-site") === "cross-site") {
      throw new EndpointError("Open this feature in the app before continuing.", 403);
    }
  }
  // Personal exports and usage limits follow the authenticated actor, never an
  // acting-workspace cookie, session role, or caller-supplied user ID.
  return user;
}

export async function reserveMediaUsage(user) {
  // One persistent bucket per actor, shared across serverless instances and all
  // legacy media endpoints. Expired buckets reset atomically; no new schema.
  const rows = await sql`
    INSERT INTO report_snapshots_cache (report_key, payload, updated_at)
    VALUES (${`legacy-media-usage:v1:${user.id}`}, '{"count":1}'::jsonb, NOW())
    ON CONFLICT (report_key) DO UPDATE SET
      payload = jsonb_build_object('count', CASE
        WHEN report_snapshots_cache.updated_at <= NOW() - INTERVAL '10 minutes' THEN 1
        ELSE (report_snapshots_cache.payload->>'count')::int + 1 END),
      updated_at = CASE
        WHEN report_snapshots_cache.updated_at <= NOW() - INTERVAL '10 minutes' THEN NOW()
        ELSE report_snapshots_cache.updated_at END
    WHERE report_snapshots_cache.updated_at <= NOW() - INTERVAL '10 minutes'
      OR (report_snapshots_cache.payload->>'count')::int < 60
    RETURNING report_key
  `;
  if (!rows.length) throw new EndpointError("Please wait a few minutes before processing more files.", 429);
}
