import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  deleteBlackbaudAction,
  getBlackbaudAction,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

function isBlackbaudNotFoundError(message) {
  return /404/i.test(String(message || ""));
}

function isBlackbaudMissingDeleteScopeError(message) {
  const text = String(message || "");
  return /403/i.test(text) && /rnxt\.d|insufficient scope/i.test(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyBlackbaudActionDeleted({
  userId,
  authUserId,
  origin,
  actionId,
}) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await sleep(500 * attempt);
    }

    try {
      await getBlackbaudAction({
        userId,
        authUserId,
        origin,
        actionId,
      });
      lastError = null;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to verify NXT action deletion";
      if (isBlackbaudNotFoundError(message)) {
        return true;
      }
      lastError = message;
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }

  return false;
}

export async function DELETE(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser } = await getWorkspaceUser(
      session,
      request,
    );
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { prospectId, submissionId } = params;
    const requestUrl = new URL(request.url);
    const localOnly = requestUrl.searchParams.get("localOnly") === "1";

    const rows = await sql`
      SELECT s.*
      FROM submissions s
      INNER JOIN prospects p ON p.id = ${prospectId}
      WHERE s.id = ${submissionId}
        AND s.user_id = ${user.id}
        AND p.user_id = ${user.id}
        AND (
          s.prospect_id = ${prospectId}
          OR (
            p.constituent_id IS NOT NULL
            AND s.constituent_id = p.constituent_id
          )
        )
      LIMIT 1
    `;

    const existingSubmission = rows[0] || null;
    if (!existingSubmission) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    let blackbaudSync = null;
    const blackbaudActionId = String(
      existingSubmission.blackbaud_action_id || "",
    ).trim();

    if (blackbaudActionId && localOnly) {
      blackbaudSync = {
        status: "local-only",
        actionId: blackbaudActionId,
        warning:
          "Removed from the app only. The linked NXT activity was not deleted.",
      };
    } else if (blackbaudActionId) {
      const authUserId = sessionUser?.id || user.id;
      const origin = requestUrl.origin;

      try {
        await deleteBlackbaudAction({
          userId: user.id,
          authUserId,
          origin,
          actionId: blackbaudActionId,
        });

        try {
          const wasDeleted = await verifyBlackbaudActionDeleted({
            userId: user.id,
            authUserId,
            origin,
            actionId: blackbaudActionId,
          });

          if (!wasDeleted) {
            return Response.json(
              {
                error:
                  "The linked NXT activity still appears to exist after delete was requested. Local cleanup was stopped to avoid mismatch.",
              },
              { status: 502 },
            );
          }
        } catch (verificationError) {
          const verificationMessage =
            verificationError instanceof Error
              ? verificationError.message
              : "Failed to verify NXT action deletion";

          if (!isBlackbaudNotFoundError(verificationMessage)) {
            return Response.json(
              {
                error: `Could not verify the synced NXT activity was deleted: ${verificationMessage}`,
              },
              { status: 502 },
            );
          }
        }

        blackbaudSync = {
          status: "deleted",
          actionId: blackbaudActionId,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to delete synced Blackbaud action";

        if (isBlackbaudNotFoundError(message)) {
          blackbaudSync = {
            status: "already-missing",
            actionId: blackbaudActionId,
            warning:
              "The linked NXT action could not be found and may have already been deleted.",
          };
        } else {
          if (isBlackbaudMissingDeleteScopeError(message)) {
            return Response.json(
              {
                error:
                  "Blackbaud refused the NXT delete because this connection does not have the rnxt.d delete scope yet. Reconnect Blackbaud after the Marketplace approval, or use Remove from app only for cleanup.",
              },
              { status: 403 },
            );
          }

          return Response.json(
            {
              error: `Could not delete the synced NXT activity: ${message}`,
            },
            { status: 502 },
          );
        }
      }
    }

    const deletedRows = await sql`
      DELETE FROM submissions s
      USING prospects p
      WHERE s.id = ${submissionId}
        AND s.user_id = ${user.id}
        AND p.id = ${prospectId}
        AND p.user_id = ${user.id}
        AND (
          s.prospect_id = ${prospectId}
          OR (
            p.constituent_id IS NOT NULL
            AND s.constituent_id = p.constituent_id
          )
        )
      RETURNING s.*
    `;

    if (deletedRows.length === 0) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    await sql`
      UPDATE prospects
      SET updated_at = NOW()
      WHERE id = ${prospectId} AND user_id = ${user.id}
    `;

    return Response.json({
      deleted: true,
      submission: deletedRows[0],
      blackbaudSync,
    });
  } catch (error) {
    console.error("Error deleting prospect submission:", error);
    return Response.json(
      { error: "Failed to delete submission" },
      { status: 500 },
    );
  }
}
