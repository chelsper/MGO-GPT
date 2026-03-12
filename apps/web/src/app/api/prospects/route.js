import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveConstituent } from "@/app/api/utils/constituents";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

async function getOrCreateUser(session) {
  const email = session.user.email;
  const name = session.user.name || email;
  const existing =
    await sql`SELECT id, name FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) return existing[0];
  const created = await sql`
    INSERT INTO users (name, email, role)
    VALUES (${name}, ${email}, 'mgo')
    RETURNING id, name
  `;
  return created[0];
}

// GET all prospects for current user
export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);

    const prospects = await sql`
      SELECT
        p.*,
        COALESCE(opp.linked_opportunity_count, 0) AS linked_opportunity_count,
        COALESCE(opp.active_opportunity_count, 0) AS active_opportunity_count,
        COALESCE(opp.secured_opportunity_count, 0) AS secured_opportunity_count,
        COALESCE(opp.declined_opportunity_count, 0) AS declined_opportunity_count,
        COALESCE(opp.active_pipeline_amount, 0) AS active_pipeline_amount,
        activity.latest_activity_at,
        latest_submission.status AS latest_submission_status,
        latest_submission.submission_type AS latest_submission_type,
        latest_submission.reviewer_notes AS latest_submission_reviewer_notes,
        latest_submission.updated_at AS latest_submission_updated_at
      FROM prospects p
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS linked_opportunity_count,
          COUNT(*) FILTER (WHERE po.opportunity_status = 'Active') AS active_opportunity_count,
          COUNT(*) FILTER (WHERE po.opportunity_status = 'Closed – Gift Secured') AS secured_opportunity_count,
          COUNT(*) FILTER (WHERE po.opportunity_status = 'Closed – Declined') AS declined_opportunity_count,
          COALESCE(SUM(COALESCE(po.estimated_amount, 0)) FILTER (WHERE po.opportunity_status = 'Active'), 0) AS active_pipeline_amount
        FROM prospect_opportunities po
        WHERE po.prospect_id = p.id
      ) opp ON true
      LEFT JOIN LATERAL (
        SELECT MAX(event_at) AS latest_activity_at
        FROM (
          SELECT p.updated_at AS event_at
          UNION ALL
          SELECT pu.created_at AS event_at
          FROM prospect_updates pu
          WHERE pu.prospect_id = p.id
          UNION ALL
          SELECT po.updated_at AS event_at
          FROM prospect_opportunities po
          WHERE po.prospect_id = p.id
          UNION ALL
          SELECT COALESCE(s.reviewed_at, s.updated_at, s.date_submitted) AS event_at
          FROM submissions s
          WHERE s.user_id = ${user.id}
            AND (
              s.prospect_id = p.id
              OR (p.constituent_id IS NOT NULL AND s.constituent_id = p.constituent_id)
            )
        ) timeline
      ) activity ON true
      LEFT JOIN LATERAL (
        SELECT
          s.status,
          s.submission_type,
          s.reviewer_notes,
          COALESCE(s.reviewed_at, s.updated_at, s.date_submitted) AS updated_at
        FROM submissions s
        WHERE s.user_id = ${user.id}
          AND (
            s.prospect_id = p.id
            OR (p.constituent_id IS NOT NULL AND s.constituent_id = p.constituent_id)
          )
        ORDER BY COALESCE(s.reviewed_at, s.updated_at, s.date_submitted) DESC
        LIMIT 1
      ) latest_submission ON true
      WHERE p.user_id = ${user.id}
      ORDER BY
        CASE WHEN p.status = 'Active' THEN 0 ELSE 1 END,
        p.priority_order ASC,
        p.created_at DESC
    `;

    return Response.json(prospects);
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

    const user = await getOrCreateUser(session);
    const body = await request.json();
    const { prospectName, expectedCloseFY, askAmount, askType, constituentId } =
      body;

    if (!prospectName || !expectedCloseFY || !askType) {
      return Response.json(
        { error: "Missing required fields" },
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
      name: prospectName,
      constituentId,
      createNew: false,
    });

    const result = await sql`
      INSERT INTO prospects (
        user_id, constituent_id, prospect_name, expected_close_fy,
        ask_amount, ask_type, priority_order
      ) VALUES (
        ${user.id}, ${constituent?.id || null}, ${prospectName}, ${expectedCloseFY},
        ${askAmount || null}, ${askType}, ${nextOrder}
      )
      RETURNING *
    `;

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating prospect:", error);
    return Response.json(
      { error: "Failed to create prospect" },
      { status: 500 },
    );
  }
}
