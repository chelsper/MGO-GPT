import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { loadProspectRecentActivity } from "@/app/api/utils/prospectRecentActivity";

export async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(session, request);
    if (!user) return Response.json({ error: "Workspace not found" }, { status: 404 });
    await ensureAppSchema();
    const [prospect] = await sql`SELECT COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS constituent_id
      FROM prospects p LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE p.id = ${params.id} AND p.user_id = ${user.id} LIMIT 1`;
    if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });
    if (!prospect.constituent_id) return Response.json({ linked: false });
    const activity = await loadProspectRecentActivity({ userId: user.id, authUserId: isActing ? sessionUser.id : user.id, origin: new URL(request.url).origin, constituentId: prospect.constituent_id });
    return Response.json({ linked: true, ...activity }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Latest NXT activity is temporarily unavailable." }, { status: 502 });
  }
}
