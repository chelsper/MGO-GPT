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
      latest_activity AS (
        SELECT
          timeline.prospect_id,
          MAX(timeline.activity_at) AS latest_activity_at
        FROM (
          SELECT up.id AS prospect_id, up.updated_at AS activity_at
          FROM user_prospects up
          UNION ALL
          SELECT pu.prospect_id, pu.created_at AS activity_at
          FROM prospect_updates pu
          INNER JOIN user_prospects up ON up.id = pu.prospect_id
          UNION ALL
          SELECT po.prospect_id, po.updated_at AS activity_at
          FROM prospect_opportunities po
          INNER JOIN user_prospects up ON up.id = po.prospect_id
          UNION ALL
          SELECT prospect_id, activity_at
          FROM submission_matches
        ) timeline
        GROUP BY timeline.prospect_id
      )
      SELECT
        up.*,
        COALESCE(os.linked_opportunity_count, 0) AS linked_opportunity_count,
        COALESCE(os.active_opportunity_count, 0) AS active_opportunity_count,
        COALESCE(os.secured_opportunity_count, 0) AS secured_opportunity_count,
        COALESCE(os.declined_opportunity_count, 0) AS declined_opportunity_count,
        COALESCE(os.active_pipeline_amount, 0) AS active_pipeline_amount,
        la.latest_activity_at,
        ls.latest_submission_status,
        ls.latest_submission_type,
        ls.latest_submission_reviewer_notes,
        ls.latest_submission_updated_at
      FROM user_prospects up
      LEFT JOIN opportunity_summary os ON os.prospect_id = up.id
      LEFT JOIN latest_activity la ON la.prospect_id = up.id
      LEFT JOIN latest_submission ls ON ls.prospect_id = up.id
      ORDER BY
        CASE WHEN up.status = 'Active' THEN 0 ELSE 1 END,
        up.priority_order ASC,
        up.created_at DESC
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
    const {
      prospectName,
      expectedCloseFY,
      askAmount,
      askType,
      constituentId,
      blackbaudConstituentId,
    } =
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
      blackbaudConstituentId,
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
