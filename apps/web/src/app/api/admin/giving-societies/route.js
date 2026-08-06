import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  getDefaultGivingSocietyConfigurations,
  listGivingSocietyConfigurations,
  saveGivingSocietyConfigurations,
} from "@/app/api/utils/givingSocietyConfigurations";
import { GIVING_SOCIETY_COUNT_SOURCE_OPTIONS } from "@/app/api/utils/givingSocietyDefinitions";
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
    const { user, error } = await requireAdminSession();
    if (error) return error;

    const societies = await listGivingSocietyConfigurations();

    return Response.json({
      currentUser: user,
      defaults: getDefaultGivingSocietyConfigurations(),
      countSourceOptions: GIVING_SOCIETY_COUNT_SOURCE_OPTIONS,
      societies,
    });
  } catch (error) {
    console.error("Giving society configuration GET error:", error);
    return Response.json(
      { error: error?.message || "Failed to load giving society configurations" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const { user, error } = await requireAdminSession();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const definitions = Array.isArray(body?.societies) ? body.societies : [];

    if (!definitions.length) {
      return Response.json(
        { error: "At least one giving society definition is required" },
        { status: 400 },
      );
    }

    const societies = await saveGivingSocietyConfigurations({
      definitions,
      userId: user.id,
    });

    return Response.json({
      societies,
      countSourceOptions: GIVING_SOCIETY_COUNT_SOURCE_OPTIONS,
    });
  } catch (error) {
    console.error("Giving society configuration PUT error:", error);
    return Response.json(
      { error: error?.message || "Failed to save giving society configurations" },
      { status: 500 },
    );
  }
}
