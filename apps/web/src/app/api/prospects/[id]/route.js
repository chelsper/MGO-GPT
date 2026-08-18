import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getProspectOpportunities } from "@/app/api/utils/prospectOpportunities";
import { blackbaudApiFetch, getBlackbaudConfigIssues } from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { getPendingActionsForProspect, syncPrimaryPendingAction } from "@/app/api/utils/pendingActions";
import { clearUserDashboardDataCaches } from "@/app/api/utils/userDataCache";

function getNestedValue(source, path) {
  return path.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function firstDefined(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function getOpportunityAskDate(opportunity) {
  return firstDefined(opportunity, [
    "ask_date",
    "askDate",
    "date_asked",
    "dateAsked",
    "date_ask",
    "ask.date",
  ]);
}

function getOpportunityExpectedDate(opportunity) {
  return firstDefined(opportunity, [
    "expected_date",
    "expectedDate",
    "date_expected",
    "dateExpected",
    "anticipated_date",
    "anticipatedDate",
    "deadline",
  ]);
}

function getOpportunityFundedAmount(opportunity) {
  return firstDefined(opportunity, [
    "funded_amount.value",
    "fundedAmount.value",
    "funded_amount",
    "fundedAmount",
    "amount_funded.value",
    "amountFunded.value",
    "amount_funded",
    "amountFunded",
  ]);
}

function getOpportunityFundedDate(opportunity) {
  return firstDefined(opportunity, [
    "funded_date",
    "fundedDate",
    "date_funded",
    "dateFunded",
    "close_date",
    "closeDate",
  ]);
}

function getImportedOpportunityStatus(opportunity) {
  const normalizedStatus = String(opportunity?.status || "").trim().toLowerCase();
  const fundedAmount = Number(getOpportunityFundedAmount(opportunity) ?? 0);
  const fundedDate = getOpportunityFundedDate(opportunity);

  if (fundedAmount > 0 || fundedDate) {
    return "Closed – Gift Secured";
  }

  if (
    normalizedStatus.includes("declined") ||
    normalizedStatus.includes("lost") ||
    normalizedStatus.includes("cancel") ||
    normalizedStatus.includes("rejected")
  ) {
    return "Closed – Declined";
  }

  return "Active";
}

async function refreshImportedBlackbaudOpportunities({
  userId,
  authUserId,
  origin,
  prospectId,
}) {
  const configIssues = getBlackbaudConfigIssues(origin);
  if (configIssues.length > 0) return;

  const rowsNeedingRefresh = await sql`
    SELECT po.id, po.blackbaud_opportunity_id, po.opportunity_status, po.ask_date, po.expected_date, po.closed_amount, po.close_date
    FROM prospect_opportunities po
    INNER JOIN prospects p ON p.id = po.prospect_id
    WHERE po.prospect_id = ${prospectId}
      AND p.user_id = ${userId}
      AND po.blackbaud_opportunity_id IS NOT NULL
      AND (
        po.ask_date IS NULL
        OR po.expected_date IS NULL
        OR po.closed_amount IS NULL
        OR po.close_date IS NULL
      )
  `;

  if (!rowsNeedingRefresh.length) return;

  await Promise.all(
    rowsNeedingRefresh.map(async (row) => {
      try {
        const opportunity = await blackbaudApiFetch(
          `/opportunity/v1/opportunities/${encodeURIComponent(String(row.blackbaud_opportunity_id))}`,
          {
            userId,
            authUserId,
            origin,
          },
        );

        const nextStatus = getImportedOpportunityStatus(opportunity);
        const nextClosedAmount =
          nextStatus === "Closed – Gift Secured"
            ? getOpportunityFundedAmount(opportunity) ?? row.closed_amount ?? null
            : nextStatus === "Active"
              ? null
              : row.closed_amount;
        const nextCloseDate =
          nextStatus === "Closed – Gift Secured"
            ? getOpportunityFundedDate(opportunity) || row.close_date || null
            : nextStatus === "Active"
              ? null
              : row.close_date;

        await sql`
          UPDATE prospect_opportunities
          SET
            ask_date = COALESCE(${getOpportunityAskDate(opportunity)}, ask_date),
            expected_date = COALESCE(${getOpportunityExpectedDate(opportunity)}, expected_date),
            opportunity_status = ${nextStatus},
            closed_amount = ${nextClosedAmount},
            close_date = ${nextCloseDate}
          WHERE id = ${row.id}
        `;
      } catch (error) {
        console.error("Refresh imported Blackbaud opportunity error:", error);
      }
    }),
  );
}

// GET a single prospect with its updates
export async function GET(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(session, request);
    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });
    const authUserId = isActing ? sessionUser.id : user.id;
    const origin = request?.url ? new URL(request.url).origin : null;

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

    await refreshImportedBlackbaudOpportunities({
      userId: user.id,
      authUserId,
      origin,
      prospectId,
    });

    const [updates, opportunities, linkedSubmissions, discussionItems, pendingActions] = await Promise.all([
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
      sql`
        SELECT
          di.*,
          assigned_user.name AS assigned_user_name,
          creator.name AS created_by_name
        FROM discussion_items di
        LEFT JOIN users assigned_user ON assigned_user.id = di.assigned_user_id
        LEFT JOIN users creator ON creator.id = di.created_by
        WHERE di.owner_user_id = ${user.id}
          AND (
            di.prospect_id = ${prospectId}
            OR (${constituentId}::BIGINT IS NOT NULL AND di.constituent_id = ${constituentId})
          )
        ORDER BY
          CASE
            WHEN di.due_date IS NOT NULL AND di.due_date < CURRENT_DATE THEN 0
            WHEN di.status = 'Open' THEN 1
            ELSE 2
          END,
          di.due_date ASC NULLS LAST,
          di.updated_at DESC
      `,
      getPendingActionsForProspect({
        ownerUserId: user.id,
        prospectId: Number(prospectId),
        constituentId,
      }),
    ]);

    return Response.json({
      prospect: prospects[0],
      updates,
      opportunities,
      linkedSubmissions,
      discussionItems,
      pendingActions,
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
      SELECT id, status, constituent_id, next_action_text, next_action_due_date, next_action_completed_at
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

    if (
      body.nextActionText !== undefined ||
      body.nextActionDueDate !== undefined ||
      body.nextActionCompletedAt !== undefined
    ) {
      const updatedProspect = result[0] || currentProspect;
      const nextTitle =
        body.nextActionText !== undefined
          ? body.nextActionText
          : updatedProspect.next_action_text;
      const nextDueDate =
        body.nextActionDueDate !== undefined
          ? body.nextActionDueDate
          : updatedProspect.next_action_due_date;
      const nextCompletedAt =
        body.nextActionCompletedAt !== undefined
          ? body.nextActionCompletedAt
          : updatedProspect.next_action_completed_at;

      await syncPrimaryPendingAction({
        ownerUserId: user.id,
        prospectId: Number(prospectId),
        constituentId: updatedProspect.constituent_id || null,
        title: nextTitle,
        dueDate: nextTitle ? nextDueDate || null : null,
        completedAt: nextCompletedAt || null,
      });
    }

    await clearUserDashboardDataCaches(user.id);

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error updating prospect:", error);
    return Response.json(
      { error: "Failed to update prospect" },
      { status: 500 },
    );
  }
}

// Remove a prospect from the active Top Prospects list.
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

    const existingProspect = await sql`
      SELECT
        p.id,
        p.constituent_id,
        COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS linked_blackbaud_constituent_id
      FROM prospects p
      LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE p.id = ${prospectId} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    if (existingProspect.length === 0) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    const existing = existingProspect[0];
    const linkedBlackbaudConstituentId =
      String(existing.linked_blackbaud_constituent_id || "").trim() || null;

    const result = await sql`
      WITH target AS (
        SELECT
          ${prospectId}::BIGINT AS id,
          ${existing.constituent_id || null}::BIGINT AS constituent_id,
          ${linkedBlackbaudConstituentId}::TEXT AS linked_blackbaud_constituent_id
      ),
      matching_active_prospects AS (
        SELECT p.id
        FROM prospects p
        LEFT JOIN constituents c ON c.id = p.constituent_id
        CROSS JOIN target t
        WHERE p.user_id = ${user.id}
          AND p.status = 'Active'
          AND (
            p.id = t.id
            OR (
              t.constituent_id IS NOT NULL
              AND p.constituent_id = t.constituent_id
            )
            OR (
              t.linked_blackbaud_constituent_id IS NOT NULL
              AND t.linked_blackbaud_constituent_id <> ''
              AND (
                p.blackbaud_constituent_id = t.linked_blackbaud_constituent_id
                OR c.blackbaud_constituent_id = t.linked_blackbaud_constituent_id
              )
            )
          )
      )
      UPDATE prospects p
      SET status = 'Archived', updated_at = NOW()
      FROM matching_active_prospects match
      WHERE p.id = match.id
      RETURNING p.id, p.status, p.constituent_id, p.blackbaud_constituent_id
    `;

    await clearUserDashboardDataCaches(user.id);

    return Response.json({
      success: true,
      prospect: result[0] || {
        id: existing.id,
        constituent_id: existing.constituent_id,
        status: "Archived",
      },
      archivedProspectIds: result.map((prospect) => prospect.id),
      archivedConstituentId: existing.constituent_id || null,
      linkedBlackbaudConstituentId,
    });
  } catch (error) {
    console.error("Error deleting prospect:", error);
    return Response.json(
      { error: "Failed to remove prospect" },
      { status: 500 },
    );
  }
}
