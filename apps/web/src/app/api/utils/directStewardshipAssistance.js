import sql from "./sql";
import { canEditWorkspace, isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";
import { ASSISTANCE_TYPES } from "@/utils/stewardshipAssistance";

export const canRequestDirectAssistance = context => canEditWorkspace(context)
  && (isMgoRole(context.sessionUser.role) || isReviewerRole(context.sessionUser.role));

// Fixed SQL with bound values only. The same source check runs on reads and
// inside the write transaction after locking the actor and workspace owner.
const sourceCte = `WITH authorized AS MATERIALIZED (
  SELECT owner.*, actor.name AS actor_name FROM users owner JOIN users actor ON actor.id=$1
  WHERE actor.role=$2 AND actor.active IS NOT FALSE
    AND owner.id=$3 AND owner.role=$4 AND owner.active IS NOT FALSE
), sources AS (
  SELECT jsonb_build_object('constituentId',$5::text,'constituentName',TRIM(person->>'name'),
    'opportunityId',NULL,'opportunityTitle',NULL,'prospectId',NULL) AS context, owner.actor_name
  FROM authorized owner CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(owner.blackbaud_portfolio_cache->'leadSolicitor')='array'
      THEN owner.blackbaud_portfolio_cache->'leadSolicitor' ELSE '[]'::jsonb END ||
    CASE WHEN jsonb_typeof(owner.blackbaud_portfolio_cache->'supportingSolicitor')='array'
      THEN owner.blackbaud_portfolio_cache->'supportingSolicitor' ELSE '[]'::jsonb END) person
  WHERE $6::bigint IS NULL AND person->>'constituentId'=$5
    AND NULLIF(TRIM(person->>'name'),'') IS NOT NULL
  UNION ALL
  SELECT jsonb_build_object('constituentId',$5::text,'constituentName',TRIM(p.prospect_name),
    'opportunityId',po.id::text,'opportunityTitle',po.title,'prospectId',p.id::text), owner.actor_name
  FROM authorized owner JOIN prospects p ON p.user_id=owner.id
  JOIN prospect_opportunities po ON po.prospect_id=p.id
  LEFT JOIN constituents c ON c.id=p.constituent_id
  LEFT JOIN constituents oc ON oc.id=po.constituent_id
  WHERE po.id=$6::bigint AND p.status<>'Archived' AND po.opportunity_status<>'Archived'
    AND NULLIF(TRIM(p.prospect_name),'') IS NOT NULL
    AND $5=ANY(ARRAY[p.blackbaud_constituent_id,c.blackbaud_constituent_id,oc.blackbaud_constituent_id])
    AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY[p.blackbaud_constituent_id,c.blackbaud_constituent_id,oc.blackbaud_constituent_id]) id
      WHERE NULLIF(TRIM(id),'') IS NOT NULL AND id<>$5)
), eligible AS MATERIALIZED (
  SELECT context,md5(context::text) AS context_version,actor_name FROM sources ORDER BY context::text LIMIT 1
)`;
const sourceValues = (context, source) => [context.sessionUser.id, context.sessionUser.role,
  context.workspaceUser.id, context.workspaceUser.role, source.constituentId, source.opportunityId || null];

export async function readDirectAssistance(context, source, db = sql) {
  if (!canRequestDirectAssistance(context)) return null;
  const [request] = await db`
    SELECT r.*, (SELECT jsonb_build_object('id',d.id::text,'received_on',d.received_on::text,
      'item_snapshot',d.item_snapshot,'recorded_by_name',d.recorded_by_name)
      FROM stewardship_gift_receipts d WHERE d.request_id=r.id AND d.voided_at IS NULL) AS stewardship_received_item
    FROM data_change_requests r
    JOIN users actor ON actor.id=${context.sessionUser.id} AND actor.role=${context.sessionUser.role} AND actor.active IS NOT FALSE
    JOIN users owner ON owner.id=r.owner_user_id AND owner.role=${context.workspaceUser.role} AND owner.active IS NOT FALSE
    WHERE r.owner_user_id=${context.workspaceUser.id} AND r.blackbaud_constituent_id=${source.constituentId}
      AND r.stewardship_request_key IS NOT NULL
      AND ((${source.requestId || null}::bigint IS NOT NULL AND r.id=${source.requestId || null}::bigint)
        OR (${source.requestId || null}::bigint IS NULL AND r.requester_user_id=actor.id
          AND r.stewardship_request_key=${source.requestKey || null}::uuid
          AND r.stewardship_context->>'opportunityId' IS NOT DISTINCT FROM ${source.opportunityId || null}::text))
  `;
  if (request) return { context: request.stewardship_context, request };
  if (source.requestId) return null;
  const [row] = await db(`${sourceCte} SELECT context,context_version FROM eligible`, sourceValues(context, source));
  return row ? { context: row.context, contextVersion: row.context_version, request: null } : null;
}

export async function createDirectAssistance(context, source, draft, db = sql) {
  if (!canRequestDirectAssistance(context) || source.requestId) return null;
  const values = [...sourceValues(context, source), source.requestKey, draft.contextVersion,
    `Stewardship: ${ASSISTANCE_TYPES[draft.type]}`, draft.instructions, draft.neededBy, draft.giftItemId || null];
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(734019,97)`,
    db`SELECT id FROM users WHERE id IN (${context.sessionUser.id},${context.workspaceUser.id}) ORDER BY id FOR UPDATE`,
    db`SELECT po.id FROM prospect_opportunities po JOIN prospects p ON p.id=po.prospect_id
      WHERE po.id=${source.opportunityId || null}::bigint AND p.user_id=${context.workspaceUser.id} FOR UPDATE OF po,p`,
    db(`${sourceCte}, inserted AS (
      INSERT INTO data_change_requests(requester_user_id,owner_user_id,prospect_id,constituent_name,
        blackbaud_constituent_id,request_type,request_note,needed_by,source_context,status,
        stewardship_request_key,stewardship_context,stewardship_gift_item_id,stewardship_gift_item_snapshot)
      SELECT $1,$3,(e.context->>'prospectId')::bigint,e.context->>'constituentName',$5,$9,$10,$11::date,
        'stewardship','Open',$7::uuid,e.context,gift.id,
        CASE WHEN gift.id IS NULL THEN NULL ELSE jsonb_build_object('id',gift.id::text,'name',gift.name,'description',gift.description,'version',gift.version) END
      FROM eligible e LEFT JOIN stewardship_gift_items gift ON gift.id=$12::bigint
        AND gift.archived_at IS NULL AND gift.availability='available' AND (gift.on_hand IS NULL OR gift.on_hand>0)
      WHERE e.context_version=$8 AND ($12::bigint IS NULL OR gift.id IS NOT NULL)
      ON CONFLICT (requester_user_id,owner_user_id,stewardship_request_key) WHERE stewardship_request_key IS NOT NULL DO NOTHING RETURNING *
    ), audited AS (
      INSERT INTO stewardship_request_events(request_id,actor_user_id,actor_name,status,note,version,gift_item_id,gift_item_snapshot)
      SELECT i.id,$1,e.actor_name,i.status,'Request submitted',i.request_version,i.stewardship_gift_item_id,i.stewardship_gift_item_snapshot
      FROM inserted i CROSS JOIN eligible e RETURNING id
    ) SELECT id::text,FALSE AS already_exists FROM inserted
      UNION ALL SELECT r.id::text,TRUE AS already_exists FROM data_change_requests r JOIN authorized owner ON owner.id=r.owner_user_id
      WHERE r.requester_user_id=$1 AND r.owner_user_id=$3 AND r.stewardship_request_key=$7::uuid
        AND r.blackbaud_constituent_id=$5 AND r.stewardship_context->>'opportunityId' IS NOT DISTINCT FROM $6::text
        AND NOT EXISTS(SELECT 1 FROM inserted)`, values),
  ]);
  return result.at(-1)?.[0] || null;
}
