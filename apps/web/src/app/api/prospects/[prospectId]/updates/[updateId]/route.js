import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  deleteBlackbaudAction,
  getBlackbaudAction,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

function isBlackbaudNotFoundError(message) {
  const text = String(message || "");
  return /404/i.test(text);
}

export async function PUT(request, { params }) {
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

    const result = await sql`
      UPDATE prospect_updates pu
      SET
        update_date = ${updateDate || new Date().toISOString().split("T")[0]},
        update_notes = ${updateNotes},
        created_at = pu.created_at
      FROM prospects p
      WHERE pu.id = ${updateId}
        AND pu.prospect_id = ${prospectId}
        AND p.id = pu.prospect_id
        AND p.user_id = ${user.id}
      RETURNING pu.*
    `;

    if (result.length === 0) {
      return Response.json({ error: "Update not found" }, { status: 404 });
    }

    await sql`
      UPDATE prospects
      SET updated_at = NOW()
      WHERE id = ${prospectId} AND user_id = ${user.id}
    `;

    return Response.json(result[0]);
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
    if (blackbaudActionId) {
      const authUserId = sessionUser?.id || user.id;
      const origin = new URL(request.url).origin;
      try {
        await deleteBlackbaudAction({
          userId: user.id,
          authUserId,
          origin,
          actionId: blackbaudActionId,
        });

        try {
          await getBlackbaudAction({
            userId: user.id,
            authUserId,
            origin,
            actionId: blackbaudActionId,
          });

          return Response.json(
            {
              error:
                "The linked NXT activity still appears to exist after delete was requested. Local cleanup was stopped to avoid mismatch.",
            },
            { status: 502 },
          );
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
