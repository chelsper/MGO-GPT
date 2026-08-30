import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getOrganizationSettings } from "@/app/api/utils/organizationSettings";

// Institution profile data contains no secrets. Any signed-in user may read it
// so the client can render configured labels without duplicating defaults.
export async function GET() {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await getOrCreateUser(session, "mgo");
    const response = Response.json({
      settings: await getOrganizationSettings(),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Organization settings read error:", error);
    return Response.json(
      { error: error?.message || "Failed to load institution profile" },
      { status: 500 },
    );
  }
}
