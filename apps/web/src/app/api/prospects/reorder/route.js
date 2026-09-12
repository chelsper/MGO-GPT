import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import workspaceWritePermissionError from "@/app/api/utils/workspaceWritePermission";
import { clearUserDashboardDataCaches } from "@/app/api/utils/userDataCache";
import { withProspectDisplayData } from "@/utils/prospectDisplay";

const conflictMessage = "The active prospect list or its order changed. Reload the ranking and try again; your draft was not saved.";

async function rankingWorkspace(request, workspaceId) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const context = await getWorkspaceUser(session, request);
  const permissionError = workspaceWritePermissionError(context);
  if (permissionError) return permissionError;
  if (!context.workspaceUser) return Response.json({ error: "User not found" }, { status: 404 });
  if (String(context.workspaceUser.id) !== String(workspaceId || "")) {
    return Response.json({ error: "Your selected workspace changed. Close this ranking and reopen it in the correct MGO workspace." }, { status: 409 });
  }
  await ensureAppSchema();
  return context.workspaceUser;
}

// A local-only snapshot: opening the ranking must never refresh NXT.
export async function GET(request) {
  try {
    const user = await rankingWorkspace(request, new URL(request.url).searchParams.get("workspaceId"));
    if (user instanceof Response) return user;
    const [snapshot] = await sql`
      WITH active AS (
        SELECT p.id, p.priority_order, p.created_at, p.ask_type, p.prospect_name,
          c.name AS linked_constituent_name,
          identity_snapshot.normalized_payload #>> '{mapped,constituent,name}' AS cached_constituent_name,
          identity_snapshot.summary_payload #>> '{mapped,constituent,name}' AS cached_summary_name
        FROM prospects p LEFT JOIN constituents c ON c.id = p.constituent_id
        LEFT JOIN portfolio_constituent_snapshots identity_snapshot
          ON identity_snapshot.workspace_user_id = p.user_id
          AND identity_snapshot.constituent_id = COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id)
        WHERE p.user_id = ${user.id} AND p.status = 'Active'
      )
      SELECT
        md5(COALESCE(jsonb_agg(jsonb_build_array(id::text, priority_order)
          ORDER BY priority_order ASC NULLS LAST, created_at DESC, id)::text, '[]')) AS version,
        COALESCE(jsonb_agg(jsonb_build_object('id', id::text, 'prospect_name', prospect_name, 'ask_type', ask_type,
          'linked_constituent_name', linked_constituent_name, 'cached_constituent_name', cached_constituent_name,
          'cached_summary_name', cached_summary_name)
          ORDER BY priority_order ASC NULLS LAST, created_at DESC, id), '[]'::jsonb) AS prospects
      FROM active
    `;
    const prospects = snapshot.prospects.map((row) => ({
      id: String(row.id), name: withProspectDisplayData(row).prospect_name || "Unnamed prospect", askType: row.ask_type || null,
    }));
    return Response.json({ version: snapshot.version, prospects, workspaceId: String(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error loading prospect ranking:", error);
    return Response.json({ error: "Could not load the current ranking. Try again." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json().catch(() => null);
    const user = await rankingWorkspace(request, body?.workspaceId);
    if (user instanceof Response) return user;
    const { orderedIds, version } = body || {};
    if (!Array.isArray(orderedIds) || !orderedIds.length || orderedIds.length > 10000 ||
      orderedIds.some((id) => typeof id !== "string" || !/^[1-9]\d*$/.test(id)) ||
      new Set(orderedIds).size !== orderedIds.length || typeof version !== "string" || !/^[a-f0-9]{32}$/.test(version)) {
      return Response.json({ error: "Provide a complete ranking with unique prospect IDs and its saved version." }, { status: 400 });
    }
    // Compare the full active set and order inside the same serializable write.
    // Concurrent edits fail rather than silently replacing a newer ranking.
    const [result] = await sql.transaction([
      sql`
        WITH active AS MATERIALIZED (
          SELECT id, priority_order, created_at FROM prospects
          WHERE user_id = ${user.id} AND status = 'Active' FOR UPDATE
        ), requested AS (
          SELECT value AS id, ordinality::integer AS rank
          FROM jsonb_array_elements_text(${JSON.stringify(orderedIds)}::jsonb) WITH ORDINALITY
        ), guard AS (
          SELECT
            md5(COALESCE(jsonb_agg(jsonb_build_array(id::text, priority_order)
              ORDER BY priority_order ASC NULLS LAST, created_at DESC, id)::text, '[]')) = ${version}
            AND count(*) = ${orderedIds.length}
            AND NOT EXISTS (SELECT 1 FROM requested r WHERE NOT EXISTS (
              SELECT 1 FROM active a WHERE a.id::text = r.id
            )) AS allowed
          FROM active
        ), saved AS (
          UPDATE prospects p SET priority_order = r.rank FROM requested r, guard g
          WHERE g.allowed AND p.id::text = r.id AND p.user_id = ${user.id} AND p.status = 'Active'
          RETURNING p.id
        )
        SELECT g.allowed, (SELECT count(*)::integer FROM saved) AS saved_count FROM guard g
      `,
    ], { isolationLevel: "Serializable" });
    if (!result?.[0]?.allowed) return Response.json({ error: conflictMessage }, { status: 409 });
    if (result[0].saved_count !== orderedIds.length) {
      return Response.json({ error: "Could not confirm every position was saved. Reload the ranking before continuing." }, { status: 500 });
    }
    // Cache cleanup must not turn an already-committed save into a failed save.
    try { await clearUserDashboardDataCaches(user.id); } catch (error) {
      console.error("Could not clear ranking caches:", error);
    }
    return Response.json({ success: true, workspaceId: String(user.id), orderedIds });
  } catch (error) {
    if (["40001", "40P01"].includes(error?.code)) {
      return Response.json({ error: conflictMessage }, { status: 409 });
    }
    console.error("Error saving prospect ranking:", error);
    return Response.json({ error: "Could not confirm the saved order. Reload the ranking before trying again." }, { status: 500 });
  }
}

async function normalizeActiveProspectOrder(userId) {
  const activeProspects = await sql`
    SELECT id
    FROM prospects
    WHERE user_id = ${userId} AND status = 'Active'
    ORDER BY
      CASE WHEN priority_order IS NULL THEN 1 ELSE 0 END,
      priority_order ASC,
      created_at ASC
  `;

  if (activeProspects.length === 0) {
    return;
  }

  await sql.transaction(
    activeProspects.map((prospect, index) => sql`
      UPDATE prospects
      SET priority_order = ${index + 1}
      WHERE id = ${prospect.id}
    `),
  );
}

// POST reorder prospects (swap two positions)
export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await getWorkspaceUser(session, request);
    const permissionError = workspaceWritePermissionError(context);
    if (permissionError) return permissionError;
    const { workspaceUser: user } = context;
    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });

    await normalizeActiveProspectOrder(user.id);

    const body = await request.json();
    const { prospectId, direction } = body;

    if (!prospectId || !direction) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get the current prospect
    const current = await sql`
      SELECT id, priority_order FROM prospects
      WHERE id = ${prospectId} AND user_id = ${user.id} AND status = 'Active'
      LIMIT 1
    `;

    if (current.length === 0) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    const currentOrder = current[0].priority_order;

    let neighbor;
    if (direction === "up") {
      // Find the prospect with the next lower priority_order
      neighbor = await sql`
        SELECT id, priority_order FROM prospects
        WHERE user_id = ${user.id} AND status = 'Active' AND priority_order < ${currentOrder}
        ORDER BY priority_order DESC
        LIMIT 1
      `;
    } else {
      // Find the prospect with the next higher priority_order
      neighbor = await sql`
        SELECT id, priority_order FROM prospects
        WHERE user_id = ${user.id} AND status = 'Active' AND priority_order > ${currentOrder}
        ORDER BY priority_order ASC
        LIMIT 1
      `;
    }

    if (neighbor.length === 0) {
      return Response.json({ message: "Already at boundary" });
    }

    const neighborOrder = neighbor[0].priority_order;
    const neighborId = neighbor[0].id;

    // Swap the two orders using a transaction
    await sql.transaction([
      sql`UPDATE prospects SET priority_order = ${neighborOrder} WHERE id = ${prospectId}`,
      sql`UPDATE prospects SET priority_order = ${currentOrder} WHERE id = ${neighborId}`,
    ]);

    await clearUserDashboardDataCaches(user.id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error reordering prospects:", error);
    return Response.json({ error: "Failed to reorder" }, { status: 500 });
  }
}
