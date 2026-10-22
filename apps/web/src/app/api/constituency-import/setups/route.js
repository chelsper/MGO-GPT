import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { normalizeImportSetup } from "@/utils/importSetups";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
const serialize = (row) => ({ id: String(row.id), revision: Number(row.revision), configuration: normalizeImportSetup(row.configuration), updatedAt: row.updated_at });

async function handle(request, method) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Unauthorized" }, 401);
    await ensureAppSchema();
    const { sessionUser: user } = await getWorkspaceUser(session, request);
    if (!user?.active || !isReviewerRole(user.role)) return reply({ error: "An active Admin or Advancement Services account is required." }, 403);
    if (method === "GET") {
      const rows = await sql`SELECT id, revision, configuration, updated_at FROM constituency_import_setups WHERE user_id = ${user.id} ORDER BY lower(name), id`;
      return reply({ setups: rows.map(serialize) });
    }
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return reply({ error: "Use this app to change import setups." }, 403);
    }
    const raw = await request.text();
    if (raw.length > 20000) return reply({ error: "This setup is too large. Save column names and import options only." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: "Invalid setup request." }, 400); }
    if (!body || typeof body !== "object") return reply({ error: "Invalid setup request." }, 400);
    if (method !== "POST" && (!/^[1-9]\d*$/.test(String(body.id || "")) || !Number.isSafeInteger(body.revision) || body.revision < 1)) {
      return reply({ error: "Reload saved setups before changing this setup." }, 400);
    }
    if (method === "DELETE") {
      const deleted = await sql`DELETE FROM constituency_import_setups WHERE id = ${body.id} AND user_id = ${user.id} AND revision = ${body.revision} RETURNING id`;
      return deleted.length ? reply({ deleted: true }) : reply({ error: "This setup changed or is no longer available. Reload your setups." }, 409);
    }
    let configuration;
    try { configuration = normalizeImportSetup(body.configuration); }
    catch (error) { return reply({ error: error.message }, 400); }
    const value = JSON.stringify(configuration);
    const rows = method === "POST"
      ? await sql`INSERT INTO constituency_import_setups (user_id, name, configuration) VALUES (${user.id}, ${configuration.name}, ${value}::jsonb) RETURNING *`
      : await sql`UPDATE constituency_import_setups SET name = ${configuration.name}, configuration = ${value}::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = ${body.id} AND user_id = ${user.id} AND revision = ${body.revision} RETURNING *`;
    if (!rows.length) return reply({ error: "This setup changed or is no longer available. Reload your setups." }, 409);
    return reply({ setup: serialize(rows[0]) }, method === "POST" ? 201 : 200);
  } catch (error) {
    if (error?.code === "23505") return reply({ error: "You already have a setup with that name. Update it or choose a different name. If a previous save was interrupted, reload your setups first." }, 409);
    return reply({ error: "Saved setups are unavailable. Retry without changing your import." }, 500);
  }
}

export const GET = (request) => handle(request, "GET");
export const POST = (request) => handle(request, "POST");
export const PUT = (request) => handle(request, "PUT");
export const DELETE = (request) => handle(request, "DELETE");
