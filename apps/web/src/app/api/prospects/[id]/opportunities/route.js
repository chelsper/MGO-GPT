import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { saveProspectOpportunity } from "@/app/api/utils/prospectOpportunities";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const prospectId = params.id;
    const body = await request.json();
    const {
      title,
      currentStage,
      estimatedAmount,
      askDate,
      expectedDate,
      latestNotes,
    } = body || {};

    const prospectRows = await sql`
      SELECT *
      FROM prospects
      WHERE id = ${prospectId} AND user_id = ${user.id}
      LIMIT 1
    `;

    const prospect = prospectRows[0] || null;
    if (!prospect) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    const linkedOpportunity = await saveProspectOpportunity({
      userId: user.id,
      prospectId: prospect.id,
      constituentId: prospect.constituent_id || null,
      opportunityId: null,
      title,
      currentStage: currentStage || "Identification",
      askAmount: estimatedAmount ?? null,
      askDate: askDate || null,
      expectedDate: expectedDate || null,
      latestNotes: latestNotes || null,
      submissionId: null,
      jointMgoUserIds: [user.id],
      sharedOpportunityKey: null,
    });

    return Response.json(linkedOpportunity.opportunity, { status: 201 });
  } catch (error) {
    console.error("Error creating prospect opportunity:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create prospect opportunity",
      },
      { status: 500 },
    );
  }
}
