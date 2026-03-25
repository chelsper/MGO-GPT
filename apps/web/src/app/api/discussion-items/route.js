import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const prospectId = searchParams.get("prospectId");
    const status = searchParams.get("status") || "Open";

    const rows = await sql`
      SELECT
        di.*,
        p.prospect_name,
        assigned_user.name AS assigned_user_name,
        creator.name AS created_by_name
      FROM discussion_items di
      LEFT JOIN prospects p ON p.id = di.prospect_id
      LEFT JOIN users assigned_user ON assigned_user.id = di.assigned_user_id
      LEFT JOIN users creator ON creator.id = di.created_by
      WHERE di.owner_user_id = ${user.id}
        AND (${prospectId || null}::BIGINT IS NULL OR di.prospect_id = ${prospectId || null})
        AND (${status || null}::TEXT IS NULL OR di.status = ${status || null})
      ORDER BY
        CASE
          WHEN di.due_date IS NOT NULL AND di.due_date < CURRENT_DATE THEN 0
          WHEN di.due_date IS NOT NULL THEN 1
          ELSE 2
        END,
        di.due_date ASC NULLS LAST,
        di.updated_at DESC
    `;

    return Response.json(rows);
  } catch (error) {
    console.error("Error fetching discussion items:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch discussion items",
      },
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

    const { sessionUser, workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      prospectId,
      constituentId,
      prospectOpportunityId,
      initiativeName,
      subject,
      body: discussionBody,
      dueDate,
      assignedUserId,
    } = body || {};

    if (!subject?.trim()) {
      return Response.json({ error: "Subject is required" }, { status: 400 });
    }

    if (prospectId) {
      const prospect = await sql`
        SELECT id, constituent_id
        FROM prospects
        WHERE id = ${prospectId}
          AND user_id = ${user.id}
        LIMIT 1
      `;
      if (prospect.length === 0) {
        return Response.json({ error: "Prospect not found" }, { status: 404 });
      }
    }

    const result = await sql`
      INSERT INTO discussion_items (
        owner_user_id,
        created_by,
        assigned_user_id,
        prospect_id,
        constituent_id,
        prospect_opportunity_id,
        initiative_name,
        subject,
        body,
        due_date,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${user.id},
        ${sessionUser?.id || user.id},
        ${assignedUserId || null},
        ${prospectId || null},
        ${constituentId || null},
        ${prospectOpportunityId || null},
        ${initiativeName?.trim() || null},
        ${subject.trim()},
        ${discussionBody?.trim() || null},
        ${dueDate || null},
        'Open',
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating discussion item:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create discussion item",
      },
      { status: 500 },
    );
  }
}
