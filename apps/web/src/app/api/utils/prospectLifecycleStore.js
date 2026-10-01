import sql from './sql';
import { getReportRefreshUser } from './reportRefresh';
import { societySourceScope, SOCIETY_SOURCE_VERSION } from './societyGivingSource';
import { calendarDate } from '@/utils/prospectActivity';
import { EXECUTIVE_TEAM_STANDINGS_CACHE_KEY } from './teamStandingsSnapshot';

export const LIFECYCLE_LIMIT = 10000;
export async function readProspectLifecycle({ origin, db = sql, refreshUser = getReportRefreshUser, resolveScope = societySourceScope }) {
  const assignments = await db`SELECT * FROM prospect_lifecycle_assignments ORDER BY assigned_at,id LIMIT ${LIFECYCLE_LIMIT + 1}`;
  if (assignments.length > LIFECYCLE_LIMIT) throw new Error('Lifecycle report exceeds supported size');
  if (!assignments.length) return { assignments, outcomes: [], actions: [], gifts: [], giftCoverage: null };
  const assignmentIds = assignments.map(a => String(a.id));
  const ids = [...new Set(assignments.map(a => a.constituent_id).filter(Boolean))];
  const outcomes = await db`SELECT id,assignment_id,value,selected_at,sync_state,nxt_field_id,synced_at,historical_snapshot
    FROM prospect_lifecycle_outcomes WHERE assignment_id=ANY(${assignmentIds}::bigint[]) ORDER BY id LIMIT ${LIFECYCLE_LIMIT + 1}`;
  // Select only minimal action fields, never notes, descriptions, emails or raw payloads.
  const actions = await db`WITH receipts AS (
      SELECT owner_user_id,constituent_id,remote_id AS record_id,state,payload,updated_at
      FROM nxt_create_receipts WHERE kind='action' AND state IN ('complete','verified')
        AND constituent_id=ANY(${ids}::text[])
      UNION ALL
      SELECT owner_user_id,constituent_id,blackbaud_action_id,state,
        COALESCE(request_payload->'createPayload','{}'::jsonb) || COALESCE(request_payload->'metadata','{}'::jsonb),updated_at
      FROM pending_action_nxt_receipts WHERE state='saved' AND constituent_id=ANY(${ids}::text[])
    ) SELECT owner_user_id,constituent_id,record_id,state,updated_at,
      jsonb_build_object('date',payload->'date','completed',payload->'completed','summary',payload->'summary',
        'category',payload->'category') AS payload
      FROM receipts WHERE record_id IS NOT NULL ORDER BY updated_at LIMIT ${LIFECYCLE_LIMIT + 1}`;
  const [standings] = await db`SELECT payload #> '{comparison,current}' AS period,payload->>'generatedAt' AS checked_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('owner_user_id',person->>'userId','constituent_id',action->>'constituentSystemId',
      'record_id',action->>'actionId','state','snapshot','updated_at',payload->>'generatedAt','payload',
      jsonb_build_object('date',action->'date','completed',action->'completed','summary',action->'summary','category',action->'category')))
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'standings')='array' THEN payload->'standings' ELSE '[]'::jsonb END) person
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(person #> '{drilldown,nxtActions}')='array'
        THEN person #> '{drilldown,nxtActions}' ELSE '[]'::jsonb END) action
      WHERE action->>'identityVersion'='1' AND action->>'constituentSystemId'=ANY(${ids}::text[])), '[]'::jsonb) AS actions
    FROM report_snapshots_cache WHERE report_key=${EXECUTIVE_TEAM_STANDINGS_CACHE_KEY} AND payload->>'actionIdentityVersion'='1'`;
  let nxtActionCoverage = null;
  if (Array.isArray(standings?.actions) && calendarDate(standings.period?.startsOn) && calendarDate(standings.period?.endsOn) &&
      Number.isFinite(Date.parse(standings.checked_at)) && Date.parse(standings.checked_at) <= Date.now()) {
    actions.push(...standings.actions);
    nxtActionCoverage = { startDate:standings.period.startsOn,endDate:standings.period.endsOn,checkedAt:standings.checked_at };
  }
  if (outcomes.length > LIFECYCLE_LIMIT || actions.length > LIFECYCLE_LIMIT) throw new Error('Lifecycle activity exceeds supported size');
  let gifts = [], giftCoverage = null;
  try {
    // Same connection-scoped published gift generation used by the dashboard.
    // Resolving the scope reads configuration only; it never refreshes NXT.
    const account = await refreshUser();
    if (!account) throw new Error('No published gift connection');
    const scopeKey = await resolveScope({ authUserId: account.id, origin, db });
    const [source] = await db`SELECT s.active_metadata,COALESCE((SELECT jsonb_agg(gift) FROM (
      SELECT gift FROM society_giving_source_pages p CROSS JOIN LATERAL jsonb_array_elements(p.gifts) gift
      WHERE p.scope_key=s.scope_key AND p.generation=s.active_generation
        AND gift->>'constituent_id'=ANY(${ids}::text[]) LIMIT ${LIFECYCLE_LIMIT + 1}
      ) bounded),'[]'::jsonb) AS gifts FROM society_giving_sources s WHERE s.scope_key=${scopeKey}`;
    const m = source?.active_metadata;
    if (m?.version === SOCIETY_SOURCE_VERSION && calendarDate(m.startDate) && calendarDate(m.endDate) &&
        m.startDate <= m.endDate && Number.isFinite(Date.parse(m.checkedAt)) && Date.parse(m.checkedAt) <= Date.now() &&
        Array.isArray(source.gifts) && source.gifts.length <= LIFECYCLE_LIMIT) {
      gifts = source.gifts;
      giftCoverage = { startDate: m.startDate, endDate: m.endDate, checkedAt: m.checkedAt };
    }
  } catch { /* Gifts are optional; no failed cache read may turn into a live pull. */ }
  return { assignments, outcomes, actions, gifts, giftCoverage, nxtActionCoverage };
}
