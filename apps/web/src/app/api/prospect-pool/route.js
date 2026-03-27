import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { resolveConstituent } from "@/app/api/utils/constituents";
import { isReviewerRole } from "@/utils/workspaceRoles";

function normalizeName(value) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);
    const { workspaceUser } = await getWorkspaceUser(session, request);
    const { searchParams } = new URL(request.url);
    const requestedView = searchParams.get("view");
    const treatAsReviewer =
      isReviewerRole(currentUser.role) && requestedView !== "mgo";

    const rows =
      treatAsReviewer
        ? await sql`
            SELECT
              pp.*,
              COALESCE(pp.blackbaud_constituent_id, c.blackbaud_constituent_id) AS linked_blackbaud_constituent_id,
              assigned_user.name AS assigned_user_name,
              assigned_user.email AS assigned_user_email,
              creator.name AS created_by_name,
              creator.email AS created_by_email,
              matched_prospect.id AS matched_prospect_id,
              matched_prospect.prospect_name AS matched_prospect_name,
              matched_prospect_owner.name AS last_action_solicitor_name,
              latest_action.update_date AS last_action_date,
              latest_action.update_notes AS last_action_notes
            FROM prospect_pool pp
            LEFT JOIN constituents c ON c.id = pp.constituent_id
            LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
            LEFT JOIN users creator ON creator.id = pp.created_by
            LEFT JOIN LATERAL (
              SELECT
                p.id,
                p.user_id,
                p.prospect_name
              FROM prospects p
              WHERE p.user_id = pp.assigned_user_id
                AND (
                  (pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id)
                  OR (
                    pp.normalized_name IS NOT NULL
                    AND p.normalized_name = pp.normalized_name
                  )
                )
              ORDER BY
                CASE
                  WHEN pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id THEN 0
                  ELSE 1
                END,
                p.updated_at DESC,
                p.created_at DESC
              LIMIT 1
            ) matched_prospect ON TRUE
            LEFT JOIN users matched_prospect_owner
              ON matched_prospect_owner.id = matched_prospect.user_id
            LEFT JOIN LATERAL (
              SELECT
                pu.update_date,
                pu.update_notes
              FROM prospect_updates pu
              WHERE pu.prospect_id = matched_prospect.id
              ORDER BY pu.update_date DESC, pu.created_at DESC
              LIMIT 1
            ) latest_action ON TRUE
            ORDER BY pp.updated_at DESC, pp.created_at DESC
          `
        : await sql`
            SELECT
              pp.*,
              COALESCE(pp.blackbaud_constituent_id, c.blackbaud_constituent_id) AS linked_blackbaud_constituent_id,
              assigned_user.name AS assigned_user_name,
              assigned_user.email AS assigned_user_email,
              creator.name AS created_by_name,
              creator.email AS created_by_email,
              matched_prospect.id AS matched_prospect_id,
              matched_prospect.prospect_name AS matched_prospect_name,
              matched_prospect_owner.name AS last_action_solicitor_name,
              latest_action.update_date AS last_action_date,
              latest_action.update_notes AS last_action_notes
            FROM prospect_pool pp
            LEFT JOIN constituents c ON c.id = pp.constituent_id
            LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
            LEFT JOIN users creator ON creator.id = pp.created_by
            LEFT JOIN LATERAL (
              SELECT
                p.id,
                p.user_id,
                p.prospect_name
              FROM prospects p
              WHERE p.user_id = pp.assigned_user_id
                AND (
                  (pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id)
                  OR (
                    pp.normalized_name IS NOT NULL
                    AND p.normalized_name = pp.normalized_name
                  )
                )
              ORDER BY
                CASE
                  WHEN pp.constituent_id IS NOT NULL AND p.constituent_id = pp.constituent_id THEN 0
                  ELSE 1
                END,
                p.updated_at DESC,
                p.created_at DESC
              LIMIT 1
            ) matched_prospect ON TRUE
            LEFT JOIN users matched_prospect_owner
              ON matched_prospect_owner.id = matched_prospect.user_id
            LEFT JOIN LATERAL (
              SELECT
                pu.update_date,
                pu.update_notes
              FROM prospect_updates pu
              WHERE pu.prospect_id = matched_prospect.id
              ORDER BY pu.update_date DESC, pu.created_at DESC
              LIMIT 1
            ) latest_action ON TRUE
            WHERE pp.assigned_user_id = ${workspaceUser.id}
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
    const blackbaudConstituentId = body?.blackbaudConstituentId?.trim() || null;

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
      SELECT id, name, email, role
      FROM users
      WHERE id = ${assignedUserId}
        AND (role = 'mgo' OR id = ${reviewer.id})
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
      email,
      phone,
      blackbaudConstituentId,
    });

    const result = await sql`
      INSERT INTO prospect_pool (
        assigned_user_id,
        created_by,
        constituent_id,
        blackbaud_constituent_id,
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
        ${blackbaudConstituentId},
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
