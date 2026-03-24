import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getProspectOpportunities } from "@/app/api/utils/prospectOpportunities";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

// GET a single prospect with its updates
export async function GET(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });

    const prospectId = params.id;

    const prospects = await sql`
      SELECT
        p.*,
        COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS linked_blackbaud_constituent_id
      FROM prospects p
      LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE p.id = ${prospectId} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    if (prospects.length === 0) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    const constituentId = prospects[0].constituent_id || null;

    const [updates, opportunities, linkedSubmissions] = await Promise.all([
      sql`
        SELECT * FROM prospect_updates
        WHERE prospect_id = ${prospectId}
        ORDER BY update_date DESC, created_at DESC
      `,
      getProspectOpportunities(prospectId),
      constituentId == null
        ? sql`
            SELECT
              s.*,
              reviewer.name AS reviewer_name
            FROM submissions s
            LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
            WHERE s.user_id = ${user.id}
              AND s.prospect_id = ${prospectId}
            ORDER BY COALESCE(s.reviewed_at, s.updated_at, s.date_submitted) DESC
          `
        : sql`
            SELECT
              s.*,
              reviewer.name AS reviewer_name
            FROM submissions s
            LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
            WHERE s.user_id = ${user.id}
              AND (
                s.prospect_id = ${prospectId}
                OR s.constituent_id = ${constituentId}
              )
            ORDER BY COALESCE(s.reviewed_at, s.updated_at, s.date_submitted) DESC
          `,
    ]);

    return Response.json({
      prospect: prospects[0],
      updates,
      opportunities,
      linkedSubmissions,
    });
  } catch (error) {
    console.error("Error fetching prospect:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch prospect",
      },
      { status: 500 },
    );
  }
}

// PUT update a prospect
export async function PUT(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });

    const prospectId = params.id;
    const body = await request.json();

    // Verify ownership and capture current state for status transitions
    const existing = await sql`
      SELECT id, status
      FROM prospects
      WHERE id = ${prospectId} AND user_id = ${user.id}
      LIMIT 1
    `;
    if (existing.length === 0) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }
    const currentProspect = existing[0];

    const setClauses = [];
    const values = [];
    let paramCount = 0;

    const allowedFields = {
      prospectName: "prospect_name",
      expectedCloseFY: "expected_close_fy",
      askAmount: "ask_amount",
      askType: "ask_type",
      nextActionText: "next_action_text",
      nextActionDueDate: "next_action_due_date",
      nextActionCompletedAt: "next_action_completed_at",
      status: "status",
      closedAmount: "closed_amount",
      closeDate: "close_date",
      declineReason: "decline_reason",
    };

    for (const [jsKey, dbColumn] of Object.entries(allowedFields)) {
      if (body[jsKey] !== undefined) {
        paramCount++;
        setClauses.push(`${dbColumn} = $${paramCount}`);
        values.push(body[jsKey]);
      }
    }

    if (
      body.status === "Active" &&
      currentProspect.status === "Archived"
    ) {
      const maxOrder = await sql`
        SELECT COALESCE(MAX(priority_order), 0) AS max_order
        FROM prospects
        WHERE user_id = ${user.id} AND status = 'Active'
      `;
      paramCount++;
      setClauses.push(`priority_order = $${paramCount}`);
      values.push((maxOrder[0]?.max_order || 0) + 1);
    }

    if (setClauses.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    // Add updated_at
    paramCount++;
    setClauses.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());

    // Add WHERE clause params
    paramCount++;
    const idParam = paramCount;
    values.push(prospectId);
    paramCount++;
    const userIdParam = paramCount;
    values.push(user.id);

    const queryStr = `UPDATE prospects SET ${setClauses.join(", ")} WHERE id = $${idParam} AND user_id = $${userIdParam} RETURNING *`;
    const result = await sql(queryStr, values);

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error updating prospect:", error);
    return Response.json(
      { error: "Failed to update prospect" },
      { status: 500 },
    );
  }
}

// DELETE a prospect
export async function DELETE(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });

    const prospectId = params.id;

    const lockedProspect = await sql`
      SELECT
        p.id,
        p.closed_amount,
        EXISTS (
          SELECT 1
          FROM prospect_opportunities po
          WHERE po.prospect_id = p.id
            AND (
              COALESCE(po.closed_amount, 0) > 0
              OR po.opportunity_status = 'Closed – Gift Secured'
            )
        ) AS has_closed_revenue
      FROM prospects p
      WHERE p.id = ${prospectId} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    if (lockedProspect.length === 0) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    if (
      Number(lockedProspect[0]?.closed_amount || 0) > 0 ||
      lockedProspect[0]?.has_closed_revenue
    ) {
      return Response.json(
        {
          error:
            "Prospects with closed revenue can only be archived, not deleted.",
        },
        { status: 409 },
      );
    }

    const result = await sql`
      DELETE FROM prospects WHERE id = ${prospectId} AND user_id = ${user.id} RETURNING id
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting prospect:", error);
    return Response.json(
      { error: "Failed to delete prospect" },
      { status: 500 },
    );
  }
}
