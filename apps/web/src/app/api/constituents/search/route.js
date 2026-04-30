import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { normalizeConstituentName } from "@/app/api/utils/constituents";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

async function hasProspectsTable() {
  const result = await sql`
    SELECT to_regclass('public.prospects') AS table_name
  `;

  return Boolean(result[0]?.table_name);
}

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
    const query = searchParams.get("q") || "";
    const normalizedQuery = normalizeConstituentName(query);

    if (normalizedQuery.length < 2) {
      return Response.json([]);
    }

    const likeQuery = `%${normalizedQuery}%`;
    const candidateRows = [];

    const constituentRows = await sql`
      SELECT
        c.id AS constituent_id,
        c.name,
        c.normalized_name,
        c.blackbaud_constituent_id,
        'constituent'::text AS source
      FROM constituents c
      WHERE
        c.user_id = ${user.id}
        AND c.normalized_name LIKE ${likeQuery}
    `;
    candidateRows.push(...constituentRows);

    if (await hasProspectsTable()) {
      const prospectRows = await sql`
        SELECT
          p.constituent_id,
          p.prospect_name AS name,
          LOWER(TRIM(REGEXP_REPLACE(p.prospect_name, '\s+', ' ', 'g'))) AS normalized_name,
          COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS blackbaud_constituent_id,
          'prospect'::text AS source
        FROM prospects p
        LEFT JOIN constituents c ON c.id = p.constituent_id
        WHERE
          p.user_id = ${user.id}
          AND p.prospect_name IS NOT NULL
          AND LOWER(TRIM(REGEXP_REPLACE(p.prospect_name, '\s+', ' ', 'g'))) LIKE ${likeQuery}
      `;
      candidateRows.push(...prospectRows);
    }

    const submissionRows = await sql`
      SELECT
        s.constituent_id,
        s.donor_name AS name,
        LOWER(TRIM(REGEXP_REPLACE(s.donor_name, '\s+', ' ', 'g'))) AS normalized_name,
        c.blackbaud_constituent_id,
        'submission'::text AS source
      FROM submissions s
      LEFT JOIN constituents c ON c.id = s.constituent_id
      WHERE
        s.user_id = ${user.id}
        AND s.donor_name IS NOT NULL
        AND LOWER(TRIM(REGEXP_REPLACE(s.donor_name, '\s+', ' ', 'g'))) LIKE ${likeQuery}
    `;
    candidateRows.push(...submissionRows);

    const grouped = new Map();

    for (const row of candidateRows) {
      const key = `${row.normalized_name}::${row.name}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: row.constituent_id || null,
          name: row.name,
          normalized_name: row.normalized_name,
          blackbaudConstituentId: row.blackbaud_constituent_id || null,
          match_count: 0,
          sources: new Set(),
        });
      }

      const entry = grouped.get(key);
      if (!entry.id && row.constituent_id) {
        entry.id = row.constituent_id;
      }
      if (!entry.blackbaudConstituentId && row.blackbaud_constituent_id) {
        entry.blackbaudConstituentId = row.blackbaud_constituent_id;
      }
      entry.match_count += 1;
      entry.sources.add(row.source);
    }

    const results = Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        sources: Array.from(entry.sources),
      }))
      .sort((a, b) => {
        const aExact = a.normalized_name === normalizedQuery ? 0 : 1;
        const bExact = b.normalized_name === normalizedQuery ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        if (a.match_count !== b.match_count) return b.match_count - a.match_count;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);

    return Response.json(results);
  } catch (error) {
    console.error("Constituent search error:", error);
    return Response.json(
      { error: "Failed to search constituents" },
      { status: 500 },
    );
  }
}
