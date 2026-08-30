import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  getOrganizationSettings,
  saveOrganizationSettings,
  validateOrganizationSettings,
} from "@/app/api/utils/organizationSettings";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

async function requireAdminSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getOrCreateUser(session, "admin");
  if (!canManageWorkspaceRole(user.role)) {
    return {
      error: Response.json(
        { error: "Forbidden - workspace administrators only" },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function GET() {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    return Response.json({ settings: await getOrganizationSettings() });
  } catch (error) {
    console.error("Organization settings GET error:", error);
    return Response.json(
      { error: error?.message || "Failed to load institution profile" },
      { status: 500 },
    );
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
      return Response.json({ error: validationError }, { status: 400 });
    }

    return Response.json({
      settings: await saveOrganizationSettings({
        settings,
        userId: user.id,
      }),
    });
  } catch (error) {
    console.error("Organization settings PUT error:", error);
    return Response.json(
      { error: error?.message || "Failed to save institution profile" },
      { status: 500 },
    );
  }
}
