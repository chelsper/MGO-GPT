import { createHash } from "node:crypto";
import sql from "./sql";
import { isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";
import { EXPORT_LIMITS, exportError } from "@/utils/prospectExport";

export async function exportRoster() {
  const users = await sql`
    SELECT u.id, u.name, u.email, u.role,
      COUNT(p.id) FILTER (WHERE p.status = 'Active')::int AS active_count
    FROM users u LEFT JOIN prospects p ON p.user_id = u.id
    WHERE u.active = TRUE
    GROUP BY u.id ORDER BY LOWER(COALESCE(u.name, u.email)), u.id
  `;
  return users.filter((u) => isMgoRole(u.role));
}

export async function authorizeExport(options, context) {
  const { sessionUser, workspaceUser, invalidActingUserId } = context;
  if (!sessionUser || sessionUser.active === false) throw exportError("Access denied.", 403);
  if (options.scope === "master") {
    if (!isReviewerRole(sessionUser.role)) throw exportError("Master exports are restricted to Advancement Services and admins.", 403);
    const roster = await exportRoster();
    const owners = options.ownerIds.map((id) => roster.find((u) => String(u.id) === id));
    if (owners.some((u) => !u)) throw exportError("A selected MGO is unavailable. Reload the workspace list.", 403);
    return owners;
  }
  if (!workspaceUser || workspaceUser.active === false || invalidActingUserId ||
      options.ownerIds[0] !== String(workspaceUser.id)) {
    throw exportError("The workspace has changed or is not accessible. Reload Top Prospects before exporting.", 403);
  }
  return [workspaceUser];
}

export async function loadProspectExport(options, { sessionUser, origin }) {
  const rows = await sql`
    WITH ranked AS (
      SELECT p.*, ROW_NUMBER() OVER (
        PARTITION BY p.user_id, p.status ORDER BY p.priority_order, p.created_at DESC, p.id
      ) AS portfolio_rank
      FROM prospects p WHERE p.user_id = ANY(${options.ownerIds}::bigint[])
    )
    SELECT p.id, p.user_id, p.prospect_name, p.status, p.portfolio_rank, p.expected_close_fy,
      p.next_action_text, p.next_action_due_date, p.next_action_completed_at, p.updated_at,
      COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS blackbaud_constituent_id,
      c.name AS linked_constituent_name, c.email, c.phone,
      snapshot.normalized_payload #>> '{mapped,constituent,name}' AS cached_constituent_name,
      snapshot.summary_payload #>> '{mapped,constituent,name}' AS cached_summary_name,
      snapshot.normalized_payload #> '{mapped,constituent}' AS saved_identity,
      snapshot.last_refreshed_at AS identity_at,
      giving.payload #> '{mapped,annualGivingSocieties}' AS saved_societies,
      giving.refreshed_at AS societies_at,
      linked.opportunities, action.latest_local_action
    FROM ranked p
    LEFT JOIN constituents c ON c.id = p.constituent_id
    LEFT JOIN portfolio_constituent_snapshots snapshot ON snapshot.workspace_user_id = p.user_id
      AND snapshot.constituent_id = COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id)
    LEFT JOIN portfolio_giving_snapshots giving ON giving.workspace_user_id = p.user_id
      AND giving.constituent_id = COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(op ORDER BY op.expected_date NULLS LAST, op.id) AS opportunities FROM (
        SELECT o.id, o.title, o.current_stage, o.opportunity_status, o.estimated_amount,
          o.expected_date, o.closed_amount, o.close_date, o.blackbaud_opportunity_id,
          o.shared_opportunity_key, o.updated_at
        FROM prospect_opportunities o WHERE o.prospect_id = p.id
        ORDER BY o.id LIMIT ${EXPORT_LIMITS.perProspect + 1}
      ) op
    ) linked ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('date', a.update_date, 'summary', COALESCE(a.update_title, 'Logged action'),
        'category', a.action_category, 'type', a.action_type) AS latest_local_action
      FROM prospect_updates a WHERE a.prospect_id = p.id
        AND a.update_date <= (NOW() AT TIME ZONE 'America/New_York')::date
      ORDER BY a.update_date DESC, a.id DESC LIMIT 1
    ) action ON TRUE
    WHERE (${options.includeInactive} OR p.status = 'Active')
      AND (${options.scope !== "filtered"} OR p.id = ANY(${options.prospectIds}::bigint[]))
    ORDER BY array_position(${options.ownerIds}::bigint[], p.user_id),
      CASE WHEN p.status = 'Active' THEN 0 ELSE 1 END, p.portfolio_rank, p.id
    LIMIT ${EXPORT_LIMITS.prospects + 1}
  `;
  if (rows.length > EXPORT_LIMITS.prospects) throw exportError("Too many prospects. Export fewer workspaces at a time.");
  if (options.scope === "filtered") {
    const selected = new Map(rows.map((r) => [String(r.id), r]));
    if (options.prospectIds.some((id) => !selected.has(id))) {
      throw exportError("A selected prospect changed or is not accessible. Reload the list before exporting.", 409);
    }
    rows.sort((a, b) => options.prospectIds.indexOf(String(a.id)) - options.prospectIds.indexOf(String(b.id)));
  }
  if (!rows.length) throw exportError("No prospects match this export. Choose another workspace or include closed/archived prospects.");
  const kinds = [];
  if (options.columns.some((c) => ["latestAction", "latestActionDate", "activityAt"].includes(c.key))) kinds.push("action");
  if (options.columns.some((c) => ["latestGiftDate", "latestGiftAmount", "giftAt"].includes(c.key))) kinds.push("gift");
  if (kinds.length) {
    const keys = new Set();
    for (const row of rows) {
      if (!row.blackbaud_constituent_id) continue;
      const digest = createHash("sha256").update(JSON.stringify([origin, String(row.blackbaud_constituent_id)])).digest("hex");
      for (const kind of kinds) keys.add(`prospect-activity-v1|${kind}|${digest}`);
    }
    if (keys.size) {
      // Never read another user's connection-scoped cache, even for a master export.
      const cached = await sql`SELECT workspace_user_id, constituent_id, cache_key, payload
        FROM blackbaud_constituent_summary_cache
        WHERE workspace_user_id = ANY(${options.ownerIds}::bigint[]) AND auth_user_id = ${sessionUser.id}
          AND cache_key = ANY(${[...keys]}::text[])`;
      const entries = new Map(cached.filter((c) => c.payload?.version === 1 && Number.isFinite(Date.parse(c.payload.fetchedAt)))
        .map((c) => [`${c.workspace_user_id}|${c.constituent_id}|${c.cache_key.split("|")[1]}`, c.payload]));
      for (const row of rows) for (const kind of kinds) row[`cached_${kind}`] = entries.get(`${row.user_id}|${row.blackbaud_constituent_id}|${kind}`);
    }
  }
  return rows;
}
