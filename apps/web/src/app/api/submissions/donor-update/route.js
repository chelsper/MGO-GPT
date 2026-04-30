import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { sendSubmissionEmail } from "@/app/api/utils/sendSubmissionEmail";
import { resolveConstituent } from "@/app/api/utils/constituents";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  buildBlackbaudActionMetadataPayload,
  buildBlackbaudActionPayload,
  createBlackbaudAction,
  getBlackbaudAction,
  updateBlackbaudAction,
} from "@/app/api/utils/blackbaud";

function getBlackbaudActionId(payload) {
  return (
    payload?.id ||
    payload?.action_id ||
    payload?.constituent_action_id ||
    payload?.value?.id ||
    payload?.value?.action_id ||
    payload?.value?.constituent_action_id ||
    null
  );
}

function getBlackbaudActionConstituentId(payload) {
  return (
    payload?.constituent_id ||
    payload?.constituent?.id ||
    payload?.constituent?.constituent_id ||
    payload?.value?.constituent_id ||
    payload?.value?.constituent?.id ||
    payload?.value?.constituent?.constituent_id ||
    null
  );
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      donorName,
      interactionType,
      transcript,
      notes,
      nextStep,
      estimatedAmount,
      attachments,
      actionCategory,
      constituentId,
      blackbaudConstituentId,
      createNewConstituent,
    } = body;

    if (!donorName) {
      return Response.json(
        { error: "Donor name is required" },
        { status: 400 },
      );
    }

    const constituent = await resolveConstituent({
      userId: user.id,
      name: donorName,
      constituentId,
      blackbaudConstituentId,
      createNew: Boolean(createNewConstituent),
    });

    let blackbaudAction = null;
    const linkedBlackbaudConstituentId =
      blackbaudConstituentId || constituent?.blackbaud_constituent_id || null;

    if (linkedBlackbaudConstituentId) {
      const origin = new URL(request.url).origin;
      blackbaudAction = await createBlackbaudAction({
        userId: user.id,
        authUserId: sessionUser?.id || user.id,
        origin,
        payload: buildBlackbaudActionPayload({
          blackbaudConstituentId: linkedBlackbaudConstituentId,
          actionDate: new Date().toISOString().split("T")[0],
          actionCategory,
          summary: donorName.trim() ? `${donorName.trim()} action` : "Action update from JUMGOGPT",
          actionNotes: notes,
          nextStep,
          authorName: user.name,
        }),
      }).catch((error) => ({
        error: error instanceof Error ? error.message : "Failed to sync action to Blackbaud",
      }));

      const createdActionId = getBlackbaudActionId(blackbaudAction);
      if (!blackbaudAction?.error && !createdActionId) {
        blackbaudAction = {
          ...blackbaudAction,
          error: "Blackbaud action sync returned no action id",
        };
      }

      if (!blackbaudAction?.error && createdActionId) {
        try {
          const verifiedAction = await getBlackbaudAction({
            userId: user.id,
            authUserId: sessionUser?.id || user.id,
            origin,
            actionId: createdActionId,
          });
          const verifiedConstituentId = getBlackbaudActionConstituentId(verifiedAction);
          if (
            verifiedConstituentId &&
            String(verifiedConstituentId) !== String(linkedBlackbaudConstituentId)
          ) {
            blackbaudAction = {
              ...blackbaudAction,
              error: `NXT created the action on constituent ${verifiedConstituentId}, expected ${linkedBlackbaudConstituentId}`,
            };
          } else {
            blackbaudAction = {
              ...blackbaudAction,
              verifiedActionId: String(createdActionId),
              verifiedConstituentId:
                verifiedConstituentId != null
                  ? String(verifiedConstituentId)
                  : null,
            };

            try {
              await updateBlackbaudAction({
                userId: user.id,
                authUserId: sessionUser?.id || user.id,
                origin,
                actionId: createdActionId,
                payload: buildBlackbaudActionMetadataPayload({
                  actionDate: new Date().toISOString().split("T")[0],
                  interactionType,
                }),
              });
            } catch (metadataError) {
              blackbaudAction = {
                ...blackbaudAction,
                syncWarning:
                  metadataError instanceof Error
                    ? metadataError.message
                    : "Created in NXT, but action type/status could not be updated",
              };
            }
          }
        } catch (verificationError) {
          blackbaudAction = {
            ...blackbaudAction,
            error:
              verificationError instanceof Error
                ? `NXT action create could not be verified: ${verificationError.message}`
                : "NXT action create could not be verified",
          };
        }
      }

      if (blackbaudAction?.error) {
        return Response.json(
          {
            error: `Could not create NXT action: ${blackbaudAction.error}`,
          },
          { status: 502 },
        );
      }
    }

    const result = await sql`
      INSERT INTO submissions (
        user_id,
        constituent_id,
        officer_name,
        submission_type,
        donor_name,
        interaction_type,
        transcript,
        notes,
        next_step,
        estimated_ask_amount,
        attachments,
        status
      ) VALUES (
        ${user.id},
        ${constituent?.id || null},
        ${user.name},
        'donor_update',
        ${donorName},
        ${interactionType},
        ${transcript || null},
        ${notes || null},
        ${nextStep || null},
        ${estimatedAmount || null},
        ${attachments ? JSON.stringify(attachments) : null},
        'Pending'
      )
      RETURNING *
    `;

    // Send email notification to advancement services (non-blocking)
    sendSubmissionEmail(result[0], "donor_update").catch((err) =>
      console.error("Email notification failed:", err),
    );

    return Response.json(
      {
        ...result[0],
        blackbaudAction,
        syncedToBlackbaud: Boolean(getBlackbaudActionId(blackbaudAction)),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating donor update:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create donor update",
      },
      { status: 500 },
    );
  }
}
