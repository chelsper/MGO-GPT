import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isAdminRole, isReviewerRole } from "@/utils/workspaceRoles";

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

    const requestedView = new URL(request.url).searchParams.get("view");
    const isReviewer =
      isAdminRole(user.role) && (requestedView === "mgo" || requestedView === "reviewer")
        ? requestedView === "reviewer"
        : isReviewerRole(user.role);

    if (isReviewer) {
      const [submissionCounts, clarificationThreads, poolItems, discussionItems, dataRequests] =
        await Promise.all([
          sql`
            SELECT
              COUNT(*) FILTER (WHERE status = 'Pending') AS pending_count,
              COUNT(*) FILTER (WHERE status = 'Needs Clarification') AS clarification_count,
              COUNT(*) FILTER (WHERE status = 'Approved') AS approved_count
            FROM submissions
          `,
          sql`
            SELECT
              s.id,
              s.donor_name,
              s.submission_type,
              s.status,
              s.date_submitted,
              s.reviewer_notes
            FROM submissions s
            WHERE s.status = 'Needs Clarification'
            ORDER BY COALESCE(s.reviewer_notes_updated_at, s.updated_at, s.date_submitted) DESC
            LIMIT 6
          `,
          sql`
            SELECT
              pp.id,
              pp.prospect_name,
              pp.needs_contact_info,
              pp.solicitor_requested,
              pp.updated_at,
              assigned_user.name AS assigned_user_name
            FROM prospect_pool pp
            LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
            WHERE pp.needs_contact_info = TRUE OR pp.assigned_user_id IS NULL
            ORDER BY pp.updated_at DESC
            LIMIT 6
          `,
          sql`
            SELECT
              di.*,
              assigned_user.name AS assigned_user_name,
              creator.name AS created_by_name
            FROM discussion_items di
            LEFT JOIN users assigned_user ON assigned_user.id = di.assigned_user_id
            LEFT JOIN users creator ON creator.id = di.created_by
            WHERE di.status = 'Open'
            ORDER BY
              CASE WHEN di.due_date IS NULL THEN 1 ELSE 0 END,
              di.due_date ASC,
              di.updated_at DESC
            LIMIT 6
          `,
          sql`
            SELECT
              dcr.*,
              requester.name AS requester_name,
              requester.email AS requester_email
            FROM data_change_requests dcr
            LEFT JOIN users requester ON requester.id = dcr.requester_user_id
            WHERE dcr.status IN ('Open', 'In Progress')
            ORDER BY dcr.updated_at DESC
            LIMIT 6
          `,
        ]);

      return Response.json({
        role: "reviewer",
        summary: {
          pendingSubmissions: Number(submissionCounts[0]?.pending_count || 0),
          clarificationRequests: Number(submissionCounts[0]?.clarification_count || 0),
          approvedToday: Number(submissionCounts[0]?.approved_count || 0),
          openDiscussionItems: discussionItems.length,
          openDataRequests: dataRequests.length,
          poolNeedsAttention: poolItems.length,
        },
        clarificationThreads,
        poolItems,
        discussionItems,
        dataRequests,
      });
    }

    const [
      overdueNextSteps,
      upcomingNextSteps,
      staleProspects,
      discussionItems,
      clarificationRequests,
      askSummary,
    ] =
      await Promise.all([
        sql`
          SELECT
            p.id,
            p.prospect_name,
            pa.title AS next_action_text,
            pa.due_date AS next_action_due_date,
            p.ask_type,
            p.expected_close_fy
          FROM pending_actions pa
          INNER JOIN prospects p ON p.id = pa.prospect_id
          WHERE pa.owner_user_id = ${user.id}
            AND pa.status = 'Open'
            AND p.status = 'Active'
            AND pa.due_date IS NOT NULL
            AND pa.due_date < CURRENT_DATE
          ORDER BY pa.due_date ASC, pa.updated_at DESC
          LIMIT 8
        `,
        sql`
          SELECT
            p.id,
            p.prospect_name,
            pa.title AS next_action_text,
            pa.due_date AS next_action_due_date,
            p.ask_type,
            p.expected_close_fy
          FROM pending_actions pa
          INNER JOIN prospects p ON p.id = pa.prospect_id
          WHERE pa.owner_user_id = ${user.id}
            AND pa.status = 'Open'
            AND p.status = 'Active'
            AND pa.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
          ORDER BY pa.due_date ASC, pa.updated_at DESC
          LIMIT 8
        `,
        sql`
          WITH activity AS (
            SELECT
              p.id AS prospect_id,
              MAX(activity_at) AS latest_activity_at
            FROM prospects p
            LEFT JOIN (
              SELECT prospect_id, created_at AS activity_at FROM prospect_updates
              UNION ALL
              SELECT prospect_id, updated_at AS activity_at FROM prospect_opportunities
            ) timeline ON timeline.prospect_id = p.id
            WHERE p.user_id = ${user.id}
            GROUP BY p.id
          )
          SELECT
            p.id,
            p.prospect_name,
            p.ask_type,
            p.expected_close_fy,
            a.latest_activity_at
          FROM prospects p
          LEFT JOIN activity a ON a.prospect_id = p.id
          WHERE p.user_id = ${user.id}
            AND p.status = 'Active'
            AND NOT EXISTS (
              SELECT 1
              FROM pending_actions pa
              WHERE pa.owner_user_id = ${user.id}
                AND pa.prospect_id = p.id
                AND pa.status = 'Open'
            )
            AND (
              a.latest_activity_at IS NULL
              OR a.latest_activity_at < NOW() - INTERVAL '21 days'
            )
          ORDER BY a.latest_activity_at NULLS FIRST, p.priority_order ASC
          LIMIT 6
        `,
        sql`
          SELECT
            di.*,
            p.prospect_name,
            assigned_user.name AS assigned_user_name,
            creator.name AS created_by_name
          FROM discussion_items di
          LEFT JOIN prospects p ON p.id = di.prospect_id
          LEFT JOIN users assigned_user ON assigned_user.id = di.assigned_user_id
          LEFT JOIN users creator ON creator.id = di.created_by
          WHERE di.status = 'Open'
            AND (
              di.owner_user_id = ${user.id}
              OR di.assigned_user_id = ${user.id}
              OR EXISTS (
                SELECT 1
                FROM discussion_item_participants dip_visible
                WHERE dip_visible.discussion_item_id = di.id
                  AND dip_visible.user_id = ${user.id}
              )
            )
          ORDER BY
            CASE
              WHEN di.due_date IS NOT NULL AND di.due_date < CURRENT_DATE THEN 0
              WHEN di.due_date IS NOT NULL THEN 1
              ELSE 2
            END,
            di.due_date ASC NULLS LAST,
            di.updated_at DESC
          LIMIT 8
        `,
        sql`
          SELECT
            s.id,
            s.donor_name,
            s.submission_type,
            s.status,
            s.reviewer_notes,
            COALESCE(s.reviewer_notes_updated_at, s.updated_at, s.date_submitted) AS activity_at
          FROM submissions s
          WHERE s.user_id = ${user.id}
            AND s.status = 'Needs Clarification'
          ORDER BY COALESCE(s.reviewer_notes_updated_at, s.updated_at, s.date_submitted) DESC
          LIMIT 6
        `,
        sql`
          SELECT COALESCE(SUM(COALESCE(p.ask_amount, 0)), 0) AS total_ask_amount
          FROM prospects p
          WHERE p.user_id = ${user.id}
            AND p.status = 'Active'
        `,
      ]);

    const topPriorities = [
      ...overdueNextSteps.map((item) => ({
        ...item,
        priorityLabel: "Overdue next step",
      })),
      ...upcomingNextSteps.map((item) => ({
        ...item,
        priorityLabel: "Due soon",
      })),
    ]
      .sort((left, right) => {
        const leftTime = left.next_action_due_date
          ? new Date(left.next_action_due_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightTime = right.next_action_due_date
          ? new Date(right.next_action_due_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      })
      .slice(0, 3);

    return Response.json({
      role: "mgo",
      summary: {
        overdueNextSteps: overdueNextSteps.length,
        upcomingNextSteps: upcomingNextSteps.length,
        staleProspects: staleProspects.length,
        clarificationRequests: clarificationRequests.length,
        openDiscussionItems: discussionItems.length,
        totalAskAmount: Number(askSummary[0]?.total_ask_amount || 0),
      },
      overdueNextSteps,
      upcomingNextSteps,
      staleProspects,
      discussionItems,
      clarificationRequests,
      topPriorities,
    });
  } catch (error) {
    console.error("Error fetching worklist:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch worklist" },
      { status: 500 },
    );
  }
}
