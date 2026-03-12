import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getLinkedProspectContext } from "@/app/api/utils/prospectOpportunities";

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name") || "";
    const constituentId = searchParams.get("constituentId");

    if (!name.trim() && !constituentId) {
      return Response.json({ prospect: null, opportunities: [] });
    }

    const context = await getLinkedProspectContext({
      userId: user.id,
      constituentId: constituentId ? Number(constituentId) : null,
      name,
    });

    return Response.json(context);
  } catch (error) {
    console.error("Error loading prospect opportunity context:", error);
    return Response.json(
      { error: "Failed to load linked opportunity context" },
      { status: 500 },
    );
  }
}
