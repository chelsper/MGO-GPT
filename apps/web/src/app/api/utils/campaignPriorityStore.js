import { randomUUID } from "node:crypto";
import sql from "./sql";
import { campaignError, validPriority, validateCampaignOverride } from "@/utils/campaignPriorities";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

export function assertCampaignEditor(actor) {
  if (!actor?.id || actor.active === false || !canManageWorkspaceRole(actor.role))
    throw campaignError("Campaign edits are restricted to active Admins and Advancement Services staff.", 403);
}

export async function campaignState(db = sql) {
  const [state] = await db`SELECT *, (lease_until>NOW()) AS busy FROM campaign_priority_state WHERE id=1`;
  return { ...state, version: Number(state.version) };
}

export async function campaignRead(filters, canManage, db = sql) {
  const search = String(filters.get("search") || "").trim();
  const fund = filters.get("fund") || "", priority = filters.get("priority") || "";
  const page = Number(filters.get("page") || 1);
  if (search.length > 100 || (fund && !/^[1-9]\d{0,18}$/.test(fund)) || (priority && !validPriority(priority)) || !Number.isSafeInteger(page) || page < 1 || page > 12000)
    throw campaignError("Invalid campaign search or page.");
  const results = await db.transaction([
    db`SELECT s.*,r.source_key,r.completed_at,r.raw_rows,r.unique_rows,r.config AS saved_config,
      (s.lease_until>NOW()) AS busy FROM campaign_priority_state s LEFT JOIN campaign_priority_runs r ON r.id=s.published_run WHERE s.id=1`,
    db`SELECT e.priority,COUNT(*)::int AS allocations,COUNT(DISTINCT e.gift_id)::int AS gifts,
      SUM(e.amount_cents)::text AS original_cents,SUM(e.effective_cents)::text AS effective_cents,
      COUNT(*) FILTER(WHERE e.has_override)::int AS exceptions,COUNT(*) FILTER(WHERE e.needs_review)::int AS needs_review
      FROM campaign_priority_effective e JOIN campaign_priority_state s ON s.id=1 AND s.published_run=e.run_id GROUP BY e.priority`,
    db`SELECT e.fund_id,MIN(e.fund_name) AS fund_name,e.fund_priority,COUNT(*)::int AS allocations,
      SUM(e.amount_cents)::text AS original_cents,SUM(e.effective_cents)::text AS effective_cents
      FROM campaign_priority_effective e JOIN campaign_priority_state s ON s.id=1 AND s.published_run=e.run_id
      GROUP BY e.fund_id,e.fund_priority ORDER BY MIN(e.fund_name),e.fund_id`,
    db`SELECT e.* FROM campaign_priority_effective e JOIN campaign_priority_state s ON s.id=1 AND s.published_run=e.run_id
      WHERE (${fund}='' OR e.fund_id=${fund}) AND (${priority}='' OR e.priority=${priority})
        AND (${search}='' OR POSITION(LOWER(${search}) IN LOWER(e.donor_name||' '||e.gift_id||' '||e.fund_name))>0)
      ORDER BY e.gift_id::numeric,e.item_key LIMIT 25 OFFSET ${(page-1)*25}`,
    db`SELECT COUNT(*)::int AS total,COUNT(DISTINCT e.gift_id)::int AS gifts
      FROM campaign_priority_effective e JOIN campaign_priority_state s ON s.id=1 AND s.published_run=e.run_id
      WHERE (${fund}='' OR e.fund_id=${fund}) AND (${priority}='' OR e.priority=${priority})
        AND (${search}='' OR POSITION(LOWER(${search}) IN LOWER(e.donor_name||' '||e.gift_id||' '||e.fund_name))>0)`,
    db`SELECT COUNT(*)::int AS orphaned FROM campaign_priority_overrides o JOIN campaign_priority_state s ON s.id=1
      JOIN campaign_priority_runs r ON r.id=s.published_run AND r.source_key=o.source_key
      WHERE NOT EXISTS(SELECT 1 FROM campaign_priority_rows g WHERE g.run_id=r.id AND g.item_key=o.item_key)`,
  ], { isolationLevel: "RepeatableRead", readOnly: true });
  const [state] = results[0];
  const job = state.job && { stage: state.job.stage, error: state.job.error || null, nextCheckAt: state.job.nextCheckAt || null };
  const numeric = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!key.endsWith("_cents") || value === null) return [key, value];
    const amount = Number(value);
    if (!Number.isSafeInteger(amount)) throw campaignError("The campaign total exceeds the supported exact-amount range.", 409);
    return [key, amount];
  })));
  const sums = ["original_cents", "effective_cents"].map(key => results[1].reduce((sum, row) => sum + BigInt(row[key]), 0n));
  if ([...sums, sums[1]-sums[0]].some(sum => sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < BigInt(Number.MIN_SAFE_INTEGER)))
    throw campaignError("The campaign total exceeds the supported exact-amount range.", 409);
  return { version: Number(state.version), canManage, runId: state.published_run, busy: state.busy === true,
    sourceChanged: Boolean(state.published_run && state.config.sourceKey !== state.source_key),
    config: canManage ? state.config : undefined, job: canManage ? job : null,
    updatedAt: state.completed_at, rawRows: state.raw_rows, uniqueRows: state.unique_rows,
    priorities: numeric(results[1]), funds: numeric(results[2]), rows: numeric(results[3]),
    originalCents: Number(sums[0]), effectiveCents: Number(sums[1]),
    total: results[4][0]?.total || 0, gifts: results[4][0]?.gifts || 0, orphaned: results[5][0]?.orphaned || 0, page };
}

export async function saveCampaignConfig(actor, version, config, db = sql) {
  assertCampaignEditor(actor);
  const rows = await db`WITH prior AS MATERIALIZED (SELECT * FROM campaign_priority_state WHERE id=1),
    updated AS (
      UPDATE campaign_priority_state s SET config=${JSON.stringify(config)}::jsonb,version=s.version+1
      FROM users u WHERE s.id=1 AND s.version=${version} AND (s.lease_until IS NULL OR s.lease_until<=NOW())
        AND (s.job IS NULL OR s.job->>'stage' IN ('complete','failed','cancelled'))
        AND u.id=${actor.id} AND u.role=${actor.role} AND u.active=TRUE RETURNING s.*
    ), audited AS (
      INSERT INTO campaign_priority_events(actor_id,actor_name,operation,source_key,reason,before_value,after_value)
      SELECT ${actor.id},${actor.name},'source',${config.sourceKey},'Campaign source settings',prior.config,updated.config
      FROM updated CROSS JOIN prior RETURNING id
    ) SELECT version FROM updated`;
  if (!rows.length) throw campaignError("The source changed or a refresh is running. Reload saved data before saving.", 409);
  return Number(rows[0].version);
}

export async function editCampaign(actor, version, runId, operation, input, db = sql) {
  assertCampaignEditor(actor);
  const override = operation === "override" ? validateCampaignOverride(input) : null;
  const fundIds = operation === "funds" && Array.isArray(input?.fundIds) ? [...new Set(input.fundIds)] : [];
  if (!override && (operation !== "funds" || Object.keys(input || {}).some(key => !["fundIds", "priority"].includes(key)) || fundIds.length < 1 || fundIds.length > 100 || fundIds.some(id => typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id)) || !validPriority(input.priority)))
    throw campaignError("Select up to 100 saved funds and a priority.");
  if (!/^[a-f0-9-]{36}$/.test(runId || "")) throw campaignError("Refresh or reload the saved campaign first.");
  const sourceRow = await db`SELECT source_key FROM campaign_priority_runs WHERE id=${runId}::uuid`;
  const key = sourceRow[0]?.source_key;
  if (!key) throw campaignError("Reload the saved campaign first.", 409);
  // Lock state in the same transaction as the version check, edit and audit.
  // A failed eligibility check leaves all rows and history unchanged.
  const guard = randomUUID();
  const eligible = () => db`UPDATE campaign_priority_state s SET version=s.version+1,lease=${guard}::uuid,lease_until=NOW()+INTERVAL '30 seconds'
    FROM users u WHERE s.id=1 AND s.version=${version} AND s.published_run=${runId}::uuid AND s.config->>'sourceKey'=${key}
      AND (s.lease_until IS NULL OR s.lease_until<=NOW()) AND u.id=${actor.id} AND u.role=${actor.role} AND u.active=TRUE
      AND (${operation}='override' AND EXISTS(SELECT 1 FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND item_key=${override?.itemKey || ""})
        OR ${operation}='funds' AND (SELECT COUNT(DISTINCT fund_id) FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND fund_id=ANY(${fundIds}))=${fundIds.length})
    RETURNING version`;
  const statements = [db`SELECT id FROM campaign_priority_state WHERE id=1 FOR UPDATE`, eligible()];
  // Only a successful CAS can set this transaction's unpredictable lease token.
  // A stale expected version must never authorize subsequent write statements.
  statements.push(db`SELECT set_config('app.campaign_edit',COALESCE((SELECT ${guard} FROM campaign_priority_state WHERE id=1 AND lease=${guard}::uuid),''),true)`);
  if (override) {
    statements.push(db`WITH prior AS MATERIALIZED (SELECT * FROM campaign_priority_overrides WHERE source_key=${key} AND item_key=${override.itemKey}),
      audited AS (
        INSERT INTO campaign_priority_events(actor_id,actor_name,operation,source_key,item_key,reason,before_value,after_value)
        SELECT ${actor.id},${actor.name},${override.revert ? "revert" : "override"},${key},g.item_key,${override.reason},(SELECT to_jsonb(prior) FROM prior),
          jsonb_build_object('priority',${override.priority ?? null}::text,'amountCents',${override.amountCents ?? null}::bigint,'source',to_jsonb(g),'revert',${override.revert}::boolean)
        FROM campaign_priority_rows g WHERE g.run_id=${runId}::uuid AND g.item_key=${override.itemKey}
          AND current_setting('app.campaign_edit',true)=${guard} RETURNING id
      ) SELECT id FROM audited`);
    statements.push(override.revert
      ? db`DELETE FROM campaign_priority_overrides WHERE source_key=${key} AND item_key=${override.itemKey} AND current_setting('app.campaign_edit',true)=${guard}`
      : db`INSERT INTO campaign_priority_overrides(source_key,item_key,priority,amount_cents,base_hash,reason,updated_by,updated_by_name)
        SELECT ${key},g.item_key,${override.priority},${override.amountCents},g.base_hash,${override.reason},${actor.id},${actor.name}
        FROM campaign_priority_rows g WHERE g.run_id=${runId}::uuid AND g.item_key=${override.itemKey} AND current_setting('app.campaign_edit',true)=${guard}
        ON CONFLICT(source_key,item_key) DO UPDATE SET priority=EXCLUDED.priority,amount_cents=EXCLUDED.amount_cents,base_hash=EXCLUDED.base_hash,
          reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,updated_by_name=EXCLUDED.updated_by_name,updated_at=NOW()`);
  } else {
    statements.push(db`WITH prior AS MATERIALIZED (SELECT * FROM campaign_priority_funds WHERE source_key=${key} AND fund_id=ANY(${fundIds})),
      audited AS (INSERT INTO campaign_priority_events(actor_id,actor_name,operation,source_key,reason,before_value,after_value)
        SELECT ${actor.id},${actor.name},'funds',${key},'Fund priority assignment',COALESCE((SELECT jsonb_agg(prior) FROM prior),'[]'),
          jsonb_build_object('fundIds',${JSON.stringify(fundIds)}::jsonb,'priority',${input.priority}::text)
        WHERE current_setting('app.campaign_edit',true)=${guard} RETURNING id)
      SELECT id FROM audited`);
    statements.push(db`INSERT INTO campaign_priority_funds(source_key,fund_id,priority)
      SELECT ${key},unnest(${fundIds}::text[]),${input.priority} WHERE current_setting('app.campaign_edit',true)=${guard}
      ON CONFLICT(source_key,fund_id) DO UPDATE SET priority=EXCLUDED.priority`);
  }
  // Bound absolute totals as well as net totals so no grouping or adjustment
  // can lose integer-cent precision, including positive/negative allocations.
  statements.push(db`DO $exact_amounts$ BEGIN
    IF EXISTS(SELECT 1 FROM campaign_priority_effective e JOIN campaign_priority_state s ON s.id=1 AND s.published_run=e.run_id
      HAVING SUM(ABS(e.amount_cents::numeric)+ABS(e.effective_cents::numeric))>9007199254740991) THEN
      RAISE EXCEPTION 'Campaign amount precision limit' USING ERRCODE='22003';
    END IF;
  END $exact_amounts$`);
  statements.push(db`UPDATE campaign_priority_state SET lease=NULL,lease_until=NULL WHERE id=1 AND lease=${guard}::uuid`);
  let result;
  try { result = await db.transaction(statements); }
  catch (error) {
    if (error.code === "22003") throw campaignError("This change would exceed the campaign's exact-amount limit. Nothing was saved.", 409);
    throw error;
  }
  if (!result[1]?.length) throw campaignError("The campaign changed. Reload saved data, then review your edit again.", 409);
  return Number(result[1][0].version);
}
