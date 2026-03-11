import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { normalizeConstituentName } from "@/app/api/utils/constituents";

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const normalizedQuery = normalizeConstituentName(query);

    if (normalizedQuery.length < 2) {
      return Response.json([]);
    }

    const likeQuery = `%${normalizedQuery}%`;
    const results = await sql`
      WITH candidate_names AS (
        SELECT
          c.id AS constituent_id,
          c.name,
          c.normalized_name,
          'constituent'::text AS source
        FROM constituents c
        WHERE c.user_id = ${user.id}

        UNION ALL

        SELECT
          p.constituent_id,
          p.prospect_name AS name,
          LOWER(TRIM(REGEXP_REPLACE(p.prospect_name, '\s+', ' ', 'g'))) AS normalized_name,
          'prospect'::text AS source
        FROM prospects p
        WHERE p.user_id = ${user.id} AND p.prospect_name IS NOT NULL

        UNION ALL

        SELECT
          s.constituent_id,
          s.donor_name AS name,
          LOWER(TRIM(REGEXP_REPLACE(s.donor_name, '\s+', ' ', 'g'))) AS normalized_name,
          'submission'::text AS source
        FROM submissions s
        WHERE s.user_id = ${user.id} AND s.donor_name IS NOT NULL
      )
      SELECT
        MIN(candidate_names.constituent_id) AS id,
        candidate_names.name,
        candidate_names.normalized_name,
        COUNT(*)::int AS match_count,
        ARRAY_AGG(DISTINCT candidate_names.source) AS sources
      FROM candidate_names
      WHERE candidate_names.normalized_name LIKE ${likeQuery}
      GROUP BY candidate_names.name, candidate_names.normalized_name
      ORDER BY
        CASE WHEN candidate_names.normalized_name = ${normalizedQuery} THEN 0 ELSE 1 END,
        match_count DESC,
        candidate_names.name ASC
      LIMIT 6
    `;

    return Response.json(results);
  } catch (error) {
    console.error("Constituent search error:", error);
    return Response.json(
      { error: "Failed to search constituents" },
      { status: 500 },
    );
  }
}
