import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";

function isTruthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

export async function PATCH(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);
    const entryId = Number(params?.id);

    if (!Number.isInteger(entryId) || entryId <= 0) {
      return Response.json({ error: "Invalid prospect pool ID" }, { status: 400 });
    }

    const existing = await sql`
      SELECT *
      FROM prospect_pool
      WHERE id = ${entryId}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "Prospect pool entry not found" }, { status: 404 });
    }

    const entry = existing[0];

    if (currentUser.role === "reviewer") {
      const body = await request.json();
      const assignedUserId =
        body?.assignedUserId !== undefined ? Number(body.assignedUserId) : null;
      const noteProvided = typeof body?.note === "string";
      const emailProvided = typeof body?.email === "string";
      const phoneProvided = typeof body?.phone === "string";

      if (
        assignedUserId !== null &&
        (!Number.isInteger(assignedUserId) || assignedUserId <= 0)
      ) {
        return Response.json({ error: "Invalid assigned MGO" }, { status: 400 });
      }

      if (assignedUserId !== null) {
        const assigned = await sql`
          SELECT id
          FROM users
          WHERE id = ${assignedUserId} AND role = 'mgo'
          LIMIT 1
        `;
        if (assigned.length === 0) {
          return Response.json({ error: "Assigned MGO not found" }, { status: 404 });
        }
      }

      const updated = await sql`
        UPDATE prospect_pool
        SET
          assigned_user_id = COALESCE(${assignedUserId}, assigned_user_id),
          note = CASE
            WHEN ${noteProvided} THEN ${body.note.trim() || null}
            ELSE note
          END,
          email = CASE
            WHEN ${emailProvided} THEN ${body.email.trim().toLowerCase() || null}
            ELSE email
          END,
          phone = CASE
            WHEN ${phoneProvided} THEN ${body.phone.trim() || null}
            ELSE phone
          END,
          updated_at = NOW()
        WHERE id = ${entryId}
        RETURNING *
      `;

      return Response.json(updated[0]);
    }

    if (entry.assigned_user_id !== currentUser.id) {
      return Response.json(
        { error: "Forbidden — this prospect is assigned to another MGO" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const needsContactInfo =
      body?.needsContactInfo !== undefined
        ? isTruthy(body.needsContactInfo)
        : entry.needs_contact_info;
    const solicitorRequested =
      body?.solicitorRequested !== undefined
        ? isTruthy(body.solicitorRequested)
        : entry.solicitor_requested;
    const noteProvided = typeof body?.contactInfoRequestNote === "string";
    const contactInfoRequestNote = noteProvided
      ? body.contactInfoRequestNote.trim() || null
      : entry.contact_info_request_note;

    const updated = await sql`
      UPDATE prospect_pool
      SET
        needs_contact_info = ${needsContactInfo},
        contact_info_request_note = ${contactInfoRequestNote},
        solicitor_requested = ${solicitorRequested},
        solicitor_requested_at = CASE
          WHEN ${solicitorRequested} THEN COALESCE(solicitor_requested_at, NOW())
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${entryId}
      RETURNING *
    `;

    return Response.json(updated[0]);
  } catch (error) {
    console.error("Error updating prospect pool entry:", error);
    return Response.json(
      { error: error?.message || "Failed to update prospect pool entry" },
      { status: 500 },
    );
  }
}
