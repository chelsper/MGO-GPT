import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  deleteBlackbaudAction,
  getBlackbaudAction,
  updateBlackbaudAction,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

function isBlackbaudNotFoundError(message) {
  const text = String(message || "");
  return /404/i.test(text);
}

function isBlackbaudMissingDeleteScopeError(message) {
  const text = String(message || "");
  return /403/i.test(text) && /rnxt\.d|insufficient scope/i.test(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBlackbaudDate(value) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
}

function formatBlackbaudDateTime(value) {
  const normalizedDate = formatBlackbaudDate(value);
  return normalizedDate ? `${normalizedDate}T00:00:00Z` : undefined;
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

export async function PUT(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(
      session,
      request,
    );
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { prospectId, updateId } = params;
    const body = await request.json();
    const updateDate = body?.updateDate || null;
    const updateNotes = body?.updateNotes?.trim() || "";

    if (!updateNotes) {
      return Response.json(
        { error: "Update notes are required" },
        { status: 400 },
      );
    }

    const existingRows = await sql`
      SELECT pu.*
      FROM prospect_updates pu
      INNER JOIN prospects p ON p.id = pu.prospect_id
      WHERE pu.id = ${updateId}
        AND pu.prospect_id = ${prospectId}
        AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const existingUpdate = existingRows[0] || null;
    if (!existingUpdate) {
      return Response.json({ error: "Update not found" }, { status: 404 });
    }

    const nextUpdateDate = updateDate || new Date().toISOString().split("T")[0];
    const blackbaudActionId = String(existingUpdate.blackbaud_action_id || "").trim();

    let blackbaudSync = null;
    if (blackbaudActionId) {
      const blackbaudPayload = {
        date: formatBlackbaudDateTime(nextUpdateDate),
        completed: true,
        completed_date: formatBlackbaudDate(nextUpdateDate),
        summary:
          String(existingUpdate.update_title || "").trim() || "Action update from JUMGOGPT",
        description: updateNotes,
      };

      Object.keys(blackbaudPayload).forEach((key) => {
        if (blackbaudPayload[key] === undefined || blackbaudPayload[key] === "") {
          delete blackbaudPayload[key];
        }
      });

      try {
        await updateBlackbaudAction({
          userId: user.id,
          authUserId: isActing ? sessionUser?.id || user.id : user.id,
          origin: request?.url ? new URL(request.url).origin : null,
          actionId: blackbaudActionId,
          payload: blackbaudPayload,
        });

        blackbaudSync = {
          status: "synced",
          actionId: blackbaudActionId,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update synced Blackbaud action";
        return Response.json(
          {
            error: `Could not update the synced NXT activity: ${message}`,
          },
          { status: 502 },
        );
      }
    }

    const result = await sql`
      UPDATE prospect_updates pu
      SET
        update_date = ${nextUpdateDate},
        update_notes = ${updateNotes},
        created_at = pu.created_at
      FROM prospects p
      WHERE pu.id = ${updateId}
        AND pu.prospect_id = ${prospectId}
        AND p.id = pu.prospect_id
        AND p.user_id = ${user.id}
      RETURNING pu.*
    `;

    await sql`
      UPDATE prospects
      SET updated_at = NOW()
      WHERE id = ${prospectId} AND user_id = ${user.id}
    `;

    return Response.json({
      ...result[0],
      blackbaudSync: blackbaudSync || { status: "local-only" },
    });
  } catch (error) {
    console.error("Error updating progress update:", error);
    return Response.json(
      { error: "Failed to update progress update" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { prospectId, updateId } = params;
    const requestUrl = new URL(request.url);
    const localOnly = requestUrl.searchParams.get("localOnly") === "1";
    const rows = await sql`
      SELECT pu.*
      FROM prospect_updates pu
      INNER JOIN prospects p ON p.id = pu.prospect_id
      WHERE pu.id = ${updateId}
        AND pu.prospect_id = ${prospectId}
        AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const existingUpdate = rows[0] || null;
    if (!existingUpdate) {
      return Response.json({ error: "Activity not found" }, { status: 404 });
    }

    let blackbaudSync = null;
    const blackbaudActionId = String(existingUpdate.blackbaud_action_id || "").trim();
    if (blackbaudActionId && localOnly) {
      blackbaudSync = {
        status: "local-only",
        actionId: blackbaudActionId,
        warning: "Removed from the app only. The linked NXT activity was not deleted.",
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
            warning: "The linked NXT action could not be found and may have already been deleted.",
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
      DELETE FROM prospect_updates pu
      USING prospects p
      WHERE pu.id = ${updateId}
        AND pu.prospect_id = ${prospectId}
        AND p.id = pu.prospect_id
        AND p.user_id = ${user.id}
      RETURNING pu.*
    `;

    if (deletedRows.length === 0) {
      return Response.json({ error: "Activity not found" }, { status: 404 });
    }

    await sql`
      UPDATE prospects
      SET updated_at = NOW()
      WHERE id = ${prospectId} AND user_id = ${user.id}
    `;

    return Response.json({
      deleted: true,
      update: deletedRows[0],
      blackbaudSync,
    });
  } catch (error) {
    console.error("Error deleting progress update:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete activity",
      },
      { status: 500 },
    );
  }
}
