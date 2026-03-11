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
      SELECT * FROM prospects
      WHERE user_id = ${user.id}
      ORDER BY
        CASE WHEN status = 'Active' THEN 0 ELSE 1 END,
        priority_order ASC,
        created_at DESC
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
