import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  DECLINED_OPPORTUNITY_STATUS,
  FUNDED_OPPORTUNITY_STATUS,
  getOpportunityStageForStatus,
  getOpportunityStatusForStage,
  saveProspectOpportunity,
} from "@/app/api/utils/prospectOpportunities";
import {
  buildBlackbaudOpportunityPayload,
  createBlackbaudOpportunity,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

const DEFAULT_OPPORTUNITY_PURPOSE = "Future. Made. Campaign";
const DECLINED_OPPORTUNITY_PURPOSE = "Completed -- Not Fulfilled";

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const prospectId = params.id;
    const body = await request.json();
    const {
      title,
      purpose,
      currentStage,
      estimatedAmount,
      askDate,
      expectedDate,
      latestNotes,
    } = body || {};

    const prospectRows = await sql`
      SELECT
        p.*,
        c.blackbaud_constituent_id AS linked_blackbaud_constituent_id
      FROM prospects p
      LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE p.id = ${prospectId} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const prospect = prospectRows[0] || null;
    if (!prospect) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    let blackbaudOpportunity = null;
    const linkedBlackbaudConstituentId =
      prospect.linked_blackbaud_constituent_id ||
      prospect.blackbaud_constituent_id ||
      null;
    const resolvedOpportunityStage = getOpportunityStageForStatus(
      currentStage,
      currentStage || "Identification",
    );
    const resolvedOpportunityStatus =
      getOpportunityStatusForStage(resolvedOpportunityStage);
    const isFundedOpportunity =
      resolvedOpportunityStatus === FUNDED_OPPORTUNITY_STATUS;
    const isDeclinedOpportunity =
      resolvedOpportunityStatus === DECLINED_OPPORTUNITY_STATUS;
    const opportunityPurpose = isDeclinedOpportunity
      ? DECLINED_OPPORTUNITY_PURPOSE
      : String(purpose || "").trim() || DEFAULT_OPPORTUNITY_PURPOSE;
    const closeDate =
      isFundedOpportunity || isDeclinedOpportunity
        ? new Date().toISOString().slice(0, 10)
        : null;

    if (linkedBlackbaudConstituentId) {
      const origin = new URL(request.url).origin;
      blackbaudOpportunity = await createBlackbaudOpportunity({
        userId: user.id,
        authUserId: sessionUser?.id || user.id,
        origin,
        payload: buildBlackbaudOpportunityPayload({
          blackbaudConstituentId: linkedBlackbaudConstituentId,
          title,
          purpose: opportunityPurpose,
          currentStage: resolvedOpportunityStage,
          estimatedAmount: estimatedAmount ?? null,
          askDate: askDate || null,
          expectedDate: expectedDate || null,
          opportunityStatus: resolvedOpportunityStatus,
          closedAmount:
            isFundedOpportunity
              ? estimatedAmount ?? null
              : isDeclinedOpportunity
                ? 0
                : null,
          closeDate,
        }),
      });
    }

    const linkedOpportunity = await saveProspectOpportunity({
      userId: user.id,
      prospectId: prospect.id,
      constituentId: prospect.constituent_id || null,
      opportunityId: null,
      blackbaudOpportunityId: blackbaudOpportunity?.id
        ? String(blackbaudOpportunity.id)
        : null,
      title,
      purpose: opportunityPurpose,
      currentStage: resolvedOpportunityStage,
      opportunityStatus: resolvedOpportunityStatus,
      askAmount: estimatedAmount ?? null,
      askDate: askDate || null,
      expectedDate: expectedDate || null,
      latestNotes: latestNotes || null,
      submissionId: null,
      jointMgoUserIds: [user.id],
      sharedOpportunityKey: null,
    });

    return Response.json(
      {
        ...linkedOpportunity.opportunity,
        blackbaudSync: blackbaudOpportunity
          ? {
              status: "synced",
              opportunityId: String(blackbaudOpportunity.id),
            }
          : { status: "local-only" },
      },
      { status: 201 },
    );
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
