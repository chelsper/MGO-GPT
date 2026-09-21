import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  getOrganizationConfiguration,
  getOrganizationSettingsHistory,
  saveOrganizationSettings,
  validateOrganizationSettings,
} from "@/app/api/utils/organizationSettings";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function requireAdminSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session?.user?.email) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }

  const user = await getOrCreateUser(session, "admin");
  if (user.active === false || !canManageWorkspaceRole(user.role)) {
    return {
      error: json(
        { error: "Forbidden - workspace administrators only" },
        403,
      ),
    };
  }

  return { user };
}

export async function GET() {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    return json({ ...await getOrganizationConfiguration(), history: await getOrganizationSettingsHistory() });
  } catch (error) {
    console.error("Organization settings GET failed");
    return json({ error: "Failed to load institution profile" }, 500);
  }
}

export async function PUT(request) {
  try {
    const { user, error } = await requireAdminSession();
    if (error) return error;

    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Save organization settings from this app." }, 403);
    const reader = request.body?.getReader();
    const parts = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 160 * 1024) { await reader.cancel(); return json({ error: "Organization settings are too large. Choose a smaller logo." }, 413); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    let body = null;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { /* Invalid input is handled by validation below. */ }
    const settings = body?.settings;
    const validationError = validateOrganizationSettings(settings);
    if (validationError) {
      return json({ error: validationError }, 400);
    }

    return json(await saveOrganizationSettings({
        settings,
        userId: user.id,
        expectedRevision: body?.expectedRevision,
      }));
  } catch (error) {
    const expected = [400, 409].includes(error?.status);
    if (!expected) console.error("Organization settings PUT failed");
    return json({ error: expected ? error.message : "Failed to save institution profile. Reload the saved profile before retrying." }, expected ? error.status : 500);
  }
}
