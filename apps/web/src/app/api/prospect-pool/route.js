import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { resolveConstituent } from "@/app/api/utils/constituents";
import { isReviewerRole } from "@/utils/workspaceRoles";

function normalizeName(value) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function GET() {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);

    const rows =
      isReviewerRole(currentUser.role)
        ? await sql`
            SELECT
              pp.*,
              assigned_user.name AS assigned_user_name,
              assigned_user.email AS assigned_user_email,
              creator.name AS created_by_name,
              creator.email AS created_by_email
            FROM prospect_pool pp
            LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
            LEFT JOIN users creator ON creator.id = pp.created_by
            ORDER BY pp.updated_at DESC, pp.created_at DESC
          `
        : await sql`
            SELECT
              pp.*,
              assigned_user.name AS assigned_user_name,
              assigned_user.email AS assigned_user_email,
              creator.name AS created_by_name,
              creator.email AS created_by_email
            FROM prospect_pool pp
            LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
            LEFT JOIN users creator ON creator.id = pp.created_by
            WHERE pp.assigned_user_id = ${currentUser.id}
            ORDER BY pp.updated_at DESC, pp.created_at DESC
          `;

    return Response.json(rows);
  } catch (error) {
    console.error("Error fetching prospect pool:", error);
    return Response.json(
      { error: error?.message || "Failed to fetch prospect pool" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reviewer = await getOrCreateUser(session, "reviewer");
    if (!isReviewerRole(reviewer.role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const prospectName = body?.prospectName?.trim();
    const assignedUserId = Number(body?.assignedUserId);
    const note = body?.note?.trim() || null;
    const email = body?.email?.trim().toLowerCase() || null;
    const phone = body?.phone?.trim() || null;

    if (!prospectName) {
      return Response.json(
        { error: "Prospect name is required" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(assignedUserId) || assignedUserId <= 0) {
      return Response.json(
        { error: "Assigned MGO is required" },
        { status: 400 },
      );
    }

    const assignedUser = await sql`
      SELECT id, name, email
      FROM users
      WHERE id = ${assignedUserId} AND role = 'mgo'
      LIMIT 1
    `;

    if (assignedUser.length === 0) {
      return Response.json(
        { error: "Selected MGO account was not found" },
        { status: 404 },
      );
    }

    const constituent = await resolveConstituent({
      userId: assignedUserId,
      name: prospectName,
      organization: null,
      email,
      phone,
    });

    const result = await sql`
      INSERT INTO prospect_pool (
        assigned_user_id,
        created_by,
        constituent_id,
        prospect_name,
        normalized_name,
        note,
        email,
        phone,
        created_at,
        updated_at
      )
      VALUES (
        ${assignedUserId},
        ${reviewer.id},
        ${constituent?.id || null},
        ${prospectName},
        ${normalizeName(prospectName)},
        ${note},
        ${email},
        ${phone},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating prospect pool entry:", error);
    return Response.json(
      { error: error?.message || "Failed to create prospect pool entry" },
      { status: 500 },
    );
  }
}
