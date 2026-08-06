import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveConstituent } from "@/app/api/utils/constituents";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { syncPrimaryPendingAction } from "@/app/api/utils/pendingActions";
import {
  getBlackbaudAction,
  getBlackbaudConfigIssues,
  getBlackbaudOpportunity,
} from "@/app/api/utils/blackbaud";

function getIsoTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function maxIsoTimestamp(...values) {
  return values.reduce((latest, value) => {
    const normalized = getIsoTimestamp(value);
    if (!normalized) return latest;
    if (!latest) return normalized;
    return new Date(normalized).getTime() > new Date(latest).getTime() ? normalized : latest;
  }, null);
}

function getCurrentFiscalYearLabel(date = new Date()) {
  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth();
  const fiscalEndYear = currentMonth >= 6 ? currentYear + 1 : currentYear;
  return `FY${String(fiscalEndYear).slice(-2)}`;
}

function getBlackbaudActionActivityAt(action) {
  return (
    action?.completed_date ||
    action?.completedDate ||
    action?.date ||
    action?.action_date ||
    action?.actionDate ||
    action?.updated_at ||
    action?.updatedAt ||
    action?.modified_date ||
    action?.modifiedDate ||
    action?.created_at ||
    action?.createdAt ||
    null
  );
}

function getBlackbaudOpportunityActivityAt(opportunity) {
  return (
    opportunity?.updated_at ||
    opportunity?.updatedAt ||
    opportunity?.modified_date ||
    opportunity?.modifiedDate ||
    opportunity?.last_modified_date ||
    opportunity?.lastModifiedDate ||
    opportunity?.date_added ||
    opportunity?.dateAdded ||
    opportunity?.created_at ||
    opportunity?.createdAt ||
    opportunity?.funded_date ||
    opportunity?.fundedDate ||
    null
  );
}

async function loadBlackbaudActivityByProspect({
  prospects,
  userId,
  authUserId,
  origin,
  includeDebug = false,
}) {
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return includeDebug ? { latestByProspect: new Map(), debugByProspect: new Map() } : new Map();
  }

  if (getBlackbaudConfigIssues(origin).length > 0) {
    return includeDebug ? { latestByProspect: new Map(), debugByProspect: new Map() } : new Map();
  }

  const prospectIds = prospects
    .map((prospect) => Number(prospect.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (prospectIds.length === 0) {
    return includeDebug ? { latestByProspect: new Map(), debugByProspect: new Map() } : new Map();
  }

  const linkedActions = await sql`
    SELECT prospect_id, blackbaud_action_id
    FROM prospect_updates
    WHERE prospect_id = ANY(${prospectIds})
      AND blackbaud_action_id IS NOT NULL
  `;

  const linkedOpportunities = await sql`
    SELECT prospect_id, blackbaud_opportunity_id
    FROM prospect_opportunities
    WHERE prospect_id = ANY(${prospectIds})
      AND blackbaud_opportunity_id IS NOT NULL
  `;

  const actionActivityById = new Map();
  const opportunityActivityById = new Map();

  await Promise.all(
    [...new Set(linkedActions.map((row) => String(row.blackbaud_action_id || "").trim()).filter(Boolean))]
      .map(async (actionId) => {
        try {
          const action = await getBlackbaudAction({
            userId,
            authUserId,
            origin,
            actionId,
          });
          actionActivityById.set(actionId, getBlackbaudActionActivityAt(action));
        } catch {
          actionActivityById.set(actionId, null);
        }
      }),
  );

  await Promise.all(
    [...new Set(linkedOpportunities.map((row) => String(row.blackbaud_opportunity_id || "").trim()).filter(Boolean))]
      .map(async (opportunityId) => {
        try {
          const opportunity = await getBlackbaudOpportunity({
            userId,
            authUserId,
            origin,
            opportunityId,
          });
          opportunityActivityById.set(
            opportunityId,
            getBlackbaudOpportunityActivityAt(opportunity),
          );
        } catch {
          opportunityActivityById.set(opportunityId, null);
        }
      }),
  );

  const latestByProspect = new Map();
  const debugByProspect = new Map();

  function appendDebug(prospectId, source, value) {
    if (!includeDebug) return;
    const normalizedValue = getIsoTimestamp(value);
    if (!debugByProspect.has(prospectId)) {
      debugByProspect.set(prospectId, []);
    }
    debugByProspect.get(prospectId).push({
      source,
      value: normalizedValue,
    });
  }

  for (const row of linkedActions) {
    const prospectId = Number(row.prospect_id);
    const activityAt = actionActivityById.get(String(row.blackbaud_action_id || "").trim());
    appendDebug(prospectId, "linked_blackbaud_action", activityAt);
    latestByProspect.set(
      prospectId,
      maxIsoTimestamp(latestByProspect.get(prospectId), activityAt),
    );
  }

  for (const row of linkedOpportunities) {
    const prospectId = Number(row.prospect_id);
    const activityAt = opportunityActivityById.get(
      String(row.blackbaud_opportunity_id || "").trim(),
    );
    appendDebug(prospectId, "linked_blackbaud_opportunity", activityAt);
    latestByProspect.set(
      prospectId,
      maxIsoTimestamp(latestByProspect.get(prospectId), activityAt),
    );
  }

  if (includeDebug) {
    return { latestByProspect, debugByProspect };
  }

  return latestByProspect;
}

// GET all prospects for current user
export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(session, request);
    const authUserId = isActing ? sessionUser.id : user.id;
    const requestUrl = request?.url ? new URL(request.url) : null;
    const origin = requestUrl?.origin || null;
    const includeDebug = requestUrl?.searchParams.get("debugActivity") === "1";

    const prospects = await sql`
      WITH user_prospects AS (
        SELECT *
        FROM prospects
        WHERE user_id = ${user.id}
      ),
      opportunity_summary AS (
        SELECT
          po.prospect_id,
          COUNT(*) AS linked_opportunity_count,
          COUNT(*) FILTER (WHERE po.opportunity_status = 'Active') AS active_opportunity_count,
          COUNT(*) FILTER (WHERE po.opportunity_status = 'Closed – Gift Secured') AS secured_opportunity_count,
          COUNT(*) FILTER (WHERE po.opportunity_status = 'Closed – Declined') AS declined_opportunity_count,
          COALESCE(
            SUM(COALESCE(po.estimated_amount, 0)) FILTER (WHERE po.opportunity_status = 'Active'),
            0
          ) AS active_pipeline_amount
        FROM prospect_opportunities po
        INNER JOIN user_prospects up ON up.id = po.prospect_id
        GROUP BY po.prospect_id
      ),
      opportunity_gift_summary AS (
        SELECT
          po.prospect_id,
          COALESCE(
            SUM(COALESCE(pogl.gift_amount, 0)) FILTER (
              WHERE po.opportunity_status = 'Closed – Gift Secured'
            ),
            0
          ) AS secured_linked_gift_amount,
          COUNT(pogl.id) FILTER (
            WHERE po.opportunity_status = 'Closed – Gift Secured'
          ) AS secured_linked_gift_count
        FROM prospect_opportunities po
        INNER JOIN user_prospects up ON up.id = po.prospect_id
        LEFT JOIN prospect_opportunity_gift_links pogl
          ON pogl.prospect_opportunity_id = po.id
        GROUP BY po.prospect_id
      ),
      submission_matches AS (
        SELECT
          up.id AS prospect_id,
          s.status,
          s.submission_type,
          s.reviewer_notes,
          COALESCE(s.reviewed_at, s.updated_at, s.date_submitted) AS activity_at,
          ROW_NUMBER() OVER (
            PARTITION BY up.id
            ORDER BY COALESCE(s.reviewed_at, s.updated_at, s.date_submitted) DESC
          ) AS row_num
        FROM user_prospects up
        INNER JOIN submissions s
          ON s.user_id = ${user.id}
         AND (
           s.prospect_id = up.id
           OR (up.constituent_id IS NOT NULL AND s.constituent_id = up.constituent_id)
         )
      ),
      latest_submission AS (
        SELECT
          prospect_id,
          status AS latest_submission_status,
          submission_type AS latest_submission_type,
          reviewer_notes AS latest_submission_reviewer_notes,
          activity_at AS latest_submission_updated_at
        FROM submission_matches
        WHERE row_num = 1
      ),
      discussion_summary AS (
        SELECT
          up.id AS prospect_id,
          COUNT(*) FILTER (WHERE di.status = 'Open') AS open_discussion_count,
          COUNT(*) FILTER (
            WHERE di.status = 'Open'
              AND di.due_date IS NOT NULL
              AND di.due_date < CURRENT_DATE
          ) AS overdue_discussion_count,
          MAX(di.updated_at) AS latest_discussion_activity_at
        FROM user_prospects up
        LEFT JOIN discussion_items di
          ON di.owner_user_id = ${user.id}
         AND (
           di.prospect_id = up.id
           OR (up.constituent_id IS NOT NULL AND di.constituent_id = up.constituent_id)
         )
        GROUP BY up.id
      ),
      pending_action_summary AS (
        SELECT
          up.id AS prospect_id,
          MAX(pa.updated_at) AS latest_pending_action_activity_at
        FROM user_prospects up
        LEFT JOIN pending_actions pa
          ON pa.owner_user_id = ${user.id}
         AND (
           pa.prospect_id = up.id
           OR (up.constituent_id IS NOT NULL AND pa.constituent_id = up.constituent_id)
         )
        GROUP BY up.id
      ),
      latest_activity AS (
        SELECT
          timeline.prospect_id,
          MAX(timeline.activity_at) AS latest_activity_at
        FROM (
          SELECT up.id AS prospect_id, up.created_at AS activity_at
          FROM user_prospects up
          UNION ALL
          SELECT pu.prospect_id, pu.created_at AS activity_at
          FROM prospect_updates pu
          INNER JOIN user_prospects up ON up.id = pu.prospect_id
          UNION ALL
          SELECT po.prospect_id, po.created_at AS activity_at
          FROM prospect_opportunities po
          INNER JOIN user_prospects up ON up.id = po.prospect_id
          UNION ALL
          SELECT prospect_id, activity_at
          FROM submission_matches
          UNION ALL
          SELECT prospect_id, latest_discussion_activity_at AS activity_at
          FROM discussion_summary
          WHERE latest_discussion_activity_at IS NOT NULL
          UNION ALL
          SELECT prospect_id, latest_pending_action_activity_at AS activity_at
          FROM pending_action_summary
          WHERE latest_pending_action_activity_at IS NOT NULL
        ) timeline
        GROUP BY timeline.prospect_id
      )
      SELECT
        up.*,
        c.blackbaud_constituent_id AS linked_blackbaud_constituent_id,
        COALESCE(os.linked_opportunity_count, 0) AS linked_opportunity_count,
        COALESCE(os.active_opportunity_count, 0) AS active_opportunity_count,
        COALESCE(os.secured_opportunity_count, 0) AS secured_opportunity_count,
        COALESCE(os.declined_opportunity_count, 0) AS declined_opportunity_count,
        COALESCE(os.active_pipeline_amount, 0) AS active_pipeline_amount,
        COALESCE(ogs.secured_linked_gift_amount, 0) AS secured_linked_gift_amount,
        COALESCE(ogs.secured_linked_gift_count, 0) AS secured_linked_gift_count,
        up.created_at AS prospect_created_activity_at,
        la.latest_activity_at,
        COALESCE(ds.open_discussion_count, 0) AS open_discussion_count,
        COALESCE(ds.overdue_discussion_count, 0) AS overdue_discussion_count,
        ds.latest_discussion_activity_at,
        pas.latest_pending_action_activity_at,
        ls.latest_submission_status,
        ls.latest_submission_type,
        ls.latest_submission_reviewer_notes,
        ls.latest_submission_updated_at
      FROM user_prospects up
      LEFT JOIN constituents c ON c.id = up.constituent_id
      LEFT JOIN opportunity_summary os ON os.prospect_id = up.id
      LEFT JOIN opportunity_gift_summary ogs ON ogs.prospect_id = up.id
      LEFT JOIN latest_activity la ON la.prospect_id = up.id
      LEFT JOIN discussion_summary ds ON ds.prospect_id = up.id
      LEFT JOIN pending_action_summary pas ON pas.prospect_id = up.id
      LEFT JOIN latest_submission ls ON ls.prospect_id = up.id
      ORDER BY
        CASE WHEN up.status = 'Active' THEN 0 ELSE 1 END,
        up.priority_order ASC,
        up.created_at DESC
    `;
    const blackbaudActivityResult = await loadBlackbaudActivityByProspect({
      prospects,
      userId: user.id,
      authUserId,
      origin,
      includeDebug,
    });

    const blackbaudActivityByProspect = includeDebug
      ? blackbaudActivityResult.latestByProspect
      : blackbaudActivityResult;
    const blackbaudDebugByProspect = includeDebug
      ? blackbaudActivityResult.debugByProspect
      : new Map();

    const mergedProspects = prospects.map((prospect) => {
      const remoteActivityAt = blackbaudActivityByProspect.get(Number(prospect.id)) || null;
      const latestActivityAt = maxIsoTimestamp(prospect.latest_activity_at, remoteActivityAt);
      const merged = {
        ...prospect,
        latest_activity_at: latestActivityAt,
        latest_blackbaud_activity_at: remoteActivityAt,
      };

      if (includeDebug) {
        merged.latest_activity_sources = [
          {
            source: "prospect_created",
            value: getIsoTimestamp(prospect.prospect_created_activity_at),
          },
          {
            source: "latest_local_aggregate",
            value: getIsoTimestamp(prospect.latest_activity_at),
          },
          {
            source: "latest_submission",
            value: getIsoTimestamp(prospect.latest_submission_updated_at),
          },
          {
            source: "latest_discussion",
            value: getIsoTimestamp(prospect.latest_discussion_activity_at),
          },
          {
            source: "latest_pending_action",
            value: getIsoTimestamp(prospect.latest_pending_action_activity_at),
          },
          ...((blackbaudDebugByProspect.get(Number(prospect.id)) || []).map((entry) => ({
            source: entry.source,
            value: getIsoTimestamp(entry.value),
          }))),
          {
            source: "final_latest_activity_at",
            value: getIsoTimestamp(latestActivityAt),
          },
        ].filter((entry) => entry.value);
      }

      return merged;
    });

    return Response.json(mergedProspects);
  } catch (error) {
    console.error("Error fetching prospects:", error);
    return Response.json(
      { error: "Failed to fetch prospects" },
      { status: 500 },
    );
  }
}

// POST create a new prospect
export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    const body = await request.json();
    const {
      prospectName,
      expectedCloseFY,
      askAmount,
      askType,
      constituentId,
      blackbaudConstituentId,
      nextActionText,
      nextActionDueDate,
    } = body;
    const normalizedProspectName = String(prospectName || "").trim();
    const normalizedExpectedCloseFY =
      String(expectedCloseFY || "").trim() || getCurrentFiscalYearLabel();
    const normalizedAskType = String(askType || "").trim() || "Unspecified";
    const normalizedAskAmount =
      askAmount !== undefined && askAmount !== null && String(askAmount).trim() !== ""
        ? Number(askAmount)
        : null;

    if (!normalizedProspectName) {
      return Response.json(
        { error: "Prospect name is required" },
        { status: 400 },
      );
    }

    if (normalizedAskAmount !== null && !Number.isFinite(normalizedAskAmount)) {
      return Response.json(
        { error: "Ask amount must be a valid number" },
        { status: 400 },
      );
    }

    // Get the max priority_order for this user's active prospects
    const maxOrder = await sql`
      SELECT COALESCE(MAX(priority_order), 0) as max_order
      FROM prospects
      WHERE user_id = ${user.id} AND status = 'Active'
    `;
    const nextOrder = maxOrder[0].max_order + 1;

    const constituent = await resolveConstituent({
      userId: user.id,
      name: normalizedProspectName,
      constituentId,
      blackbaudConstituentId,
      createNew: false,
    });

    let existingProspect = [];
    if (constituent?.id && blackbaudConstituentId) {
      existingProspect = await sql`
        SELECT
          p.*,
          c.blackbaud_constituent_id AS linked_blackbaud_constituent_id
        FROM prospects p
        LEFT JOIN constituents c ON c.id = p.constituent_id
        WHERE
          p.user_id = ${user.id}
          AND (
            p.constituent_id = ${constituent.id}
            OR c.blackbaud_constituent_id = ${blackbaudConstituentId}
          )
        ORDER BY p.updated_at DESC, p.created_at DESC
        LIMIT 1
      `;
    } else if (constituent?.id) {
      existingProspect = await sql`
        SELECT
          p.*,
          c.blackbaud_constituent_id AS linked_blackbaud_constituent_id
        FROM prospects p
        LEFT JOIN constituents c ON c.id = p.constituent_id
        WHERE p.user_id = ${user.id}
          AND p.constituent_id = ${constituent.id}
        ORDER BY p.updated_at DESC, p.created_at DESC
        LIMIT 1
      `;
    } else if (blackbaudConstituentId) {
      existingProspect = await sql`
        SELECT
          p.*,
          c.blackbaud_constituent_id AS linked_blackbaud_constituent_id
        FROM prospects p
        LEFT JOIN constituents c ON c.id = p.constituent_id
        WHERE p.user_id = ${user.id}
          AND c.blackbaud_constituent_id = ${blackbaudConstituentId}
        ORDER BY p.updated_at DESC, p.created_at DESC
        LIMIT 1
      `;
    }

    if (existingProspect.length > 0) {
      const existing = existingProspect[0];
      if (existing.status === "Active") {
        return Response.json({
          ...existing,
          already_exists: true,
          message: "This constituent is already on your top prospects list.",
        });
      }

      const restored = await sql`
        UPDATE prospects
        SET
          status = 'Active',
          priority_order = ${nextOrder},
          expected_close_fy = COALESCE(expected_close_fy, ${normalizedExpectedCloseFY}),
          ask_amount = COALESCE(ask_amount, ${normalizedAskAmount}::NUMERIC),
          ask_type = COALESCE(NULLIF(ask_type, ''), ${normalizedAskType}),
          updated_at = NOW()
        WHERE id = ${existing.id}
          AND user_id = ${user.id}
        RETURNING *
      `;

      return Response.json({
        ...restored[0],
        restored_to_top_prospects: true,
        message: "This constituent was restored to your top prospects list.",
      });
    }

    const result = await sql`
      INSERT INTO prospects (
        user_id, constituent_id, prospect_name, expected_close_fy,
        ask_amount, ask_type, priority_order, next_action_text, next_action_due_date
      ) VALUES (
        ${user.id}, ${constituent?.id || null}, ${normalizedProspectName}, ${normalizedExpectedCloseFY},
        ${normalizedAskAmount}, ${normalizedAskType}, ${nextOrder}, ${nextActionText || null}, ${nextActionDueDate || null}
      )
      RETURNING *
    `;

    if (nextActionText) {
      await syncPrimaryPendingAction({
        ownerUserId: user.id,
        prospectId: Number(result[0].id),
        constituentId: constituent?.id || null,
        title: nextActionText,
        dueDate: nextActionDueDate || null,
      });
    }

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating prospect:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create prospect",
      },
      { status: 500 },
    );
  }
}
