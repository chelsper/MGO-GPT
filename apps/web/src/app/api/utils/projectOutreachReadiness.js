import { canManageWorkspaceRole, isMgoRole } from "@/utils/workspaceRoles";

const writers = "ARRAY['mgo','admin','advancement_services','reviewer','advancement_admin']";
const managers = "ARRAY['admin','advancement_services','reviewer','advancement_admin']";

// Read flags only: never retrieve credentials, renew tokens or call NXT.
export async function readOutreachNxtReadiness(context, db) {
  if (!canManageWorkspaceRole(context.user.role) && !isMgoRole(context.user.role))
    return null;
  try {
    const rows = await db(
      `SELECT u.id,u.name,
        CASE WHEN NULLIF(trim(b.access_token),'') IS NULL THEN 'not_connected'
          WHEN b.expires_at <= NOW() + INTERVAL '60 seconds' THEN
            CASE WHEN NULLIF(trim(b.refresh_token),'') IS NOT NULL THEN 'refresh_due' ELSE 'reconnect' END
          ELSE 'saved' END AS connection,
        COALESCE(trim(u.blackbaud_constituent_id) ~ '^[1-9][0-9]{0,18}$',FALSE) AS fundraiser_mapped
       FROM report_configurations r JOIN users v ON v.id=$2::bigint
       JOIN users u ON r.specific_user_ids @> jsonb_build_array(u.id)
       LEFT JOIN blackbaud_connections b ON b.user_id=u.id
       WHERE r.report_key=$1 AND r.configuration_kind='constituent_list'
         AND r.data_configuration->>'section'='project-prospecting'
         AND r.active=TRUE AND r.visibility='specific_users' AND r.updated_at::text=$3
         AND v.active=TRUE AND r.specific_user_ids @> jsonb_build_array(v.id)
         AND regexp_split_to_array(lower(trim(v.role)), '\\s*,\\s*') && ${writers}
         AND u.active=TRUE AND regexp_split_to_array(lower(trim(u.role)), '\\s*,\\s*') && ${writers}
         AND (u.id=v.id OR regexp_split_to_array(lower(trim(v.role)), '\\s*,\\s*') && ${managers})
       ORDER BY u.name,u.id`,
      [context.report.key, Number(context.user.id), context.report.revision],
    );
    return {
      state: "saved",
      checkedAt: new Date().toISOString(),
      callers: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        connection: row.connection,
        fundraiserMapped: row.fundraiser_mapped === true,
      })),
    };
  } catch {
    // Advisory status must not block local assignments or saved outcomes.
    return { state: "unavailable", checkedAt: null, callers: [] };
  }
}
