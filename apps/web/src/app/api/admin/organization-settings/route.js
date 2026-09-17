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

    const body = await request.json().catch(() => null);
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
