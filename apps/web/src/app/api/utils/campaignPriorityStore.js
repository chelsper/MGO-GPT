import { randomUUID } from "node:crypto";
import sql from "./sql";
import { campaignError, validPriority, validateCampaignOverride, campaignUsesNxtFinancials, campaignUsesCsvWriteOffs, campaignFinancialIdentity } from "@/utils/campaignPriorities";
import { campaignWriteOffSummary } from "@/utils/campaignWriteOffCsv";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { describeLegacyCampaignFailure } from "./campaignPriorityDiagnostics";
import { campaignFiscalYearQuery } from "./campaignPrioritySegments";
import { ORGANIZATION_REPORTING_POLICY } from "@/utils/organizationRuntimePolicy";
import { campaignClassificationIdentity } from "@/utils/campaignInvestment";

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
      SUM(e.net_cents)::text AS net_cents,SUM(e.write_off_cents)::text AS write_off_cents,
      COALESCE(SUM(e.effective_cents) FILTER(WHERE e.is_investment),0)::text AS investment_cents,
      COALESCE(SUM(e.received_cents) FILTER(WHERE e.is_investment),0)::text AS investment_received_cents,
      COALESCE(SUM(e.effective_cents) FILTER(WHERE e.is_budget_relieving),0)::text AS budget_relieving_cents,
      COALESCE(SUM(e.received_cents) FILTER(WHERE e.is_budget_relieving),0)::text AS budget_relieving_received_cents,
      SUM(e.pledge_balance_cents)::text AS pledge_balance_cents,
      CASE WHEN COUNT(e.received_cents)=COUNT(*) THEN SUM(e.received_cents)::text END AS received_cents,
      COUNT(*) FILTER(WHERE e.write_off_cents IS NULL)::int AS missing_write_off,
      COUNT(*) FILTER(WHERE e.pledge_balance_cents IS NULL)::int AS missing_balance,
      COUNT(*) FILTER(WHERE e.has_override)::int AS exceptions,COUNT(*) FILTER(WHERE e.needs_review)::int AS needs_review
      FROM campaign_priority_effective e JOIN campaign_priority_state s ON s.id=1 AND s.published_run=e.run_id GROUP BY e.priority`,
    db`SELECT e.fund_id,MIN(e.fund_name) AS fund_name,e.fund_priority,COUNT(*)::int AS allocations,
      SUM(e.amount_cents)::text AS original_cents,SUM(e.effective_cents)::text AS effective_cents,
      SUM(e.net_cents)::text AS net_cents,SUM(e.write_off_cents)::text AS write_off_cents,
      SUM(e.pledge_balance_cents)::text AS pledge_balance_cents,
      CASE WHEN COUNT(e.received_cents)=COUNT(*) THEN SUM(e.received_cents)::text END AS received_cents
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
    campaignFiscalYearQuery(db),
  ], { isolationLevel: "RepeatableRead", readOnly: true });
  const [state] = results[0];
  const job = state.job && { stage: state.job.stage, error: state.job.error || null, nextCheckAt: state.job.nextCheckAt || null, financial: state.job.financial || null };
  if (canManage && job) job.error = await describeLegacyCampaignFailure(state.job, state.config.mode, db).catch(() => state.job.error) || null;
  const numeric = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!key.endsWith("_cents") || value === null) return [key, value];
    const amount = Number(value);
    if (!Number.isSafeInteger(amount)) throw campaignError("The campaign total exceeds the supported exact-amount range.", 409);
    return [key, amount];
  })));
  const sums = ["original_cents", "effective_cents", "net_cents", "write_off_cents", "pledge_balance_cents", "received_cents"]
    .map(key => results[1].reduce((sum, row) => sum + BigInt(row[key] ?? 0), 0n));
  if ([...sums, sums[1]-sums[2]].some(sum => sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < BigInt(Number.MIN_SAFE_INTEGER)))
    throw campaignError("The campaign total exceeds the supported exact-amount range.", 409);
  const automatic = campaignUsesNxtFinancials(state.saved_config);
  const csv = campaignUsesCsvWriteOffs(state.saved_config);
  const committedReady = Boolean(state.published_run && (automatic || csv || state.saved_config?.columns?.writeOff)) && results[1].every(row => row.missing_write_off === 0);
  const receivedReady = committedReady && Boolean(automatic || state.saved_config?.columns?.pledgeBalance) && results[1].every(row => row.missing_balance === 0);
  const classified = Boolean(state.published_run && state.saved_config?.investment);
  const investmentCents = results[1].reduce((sum, row) => sum+BigInt(row.investment_cents || 0),0n);
  const investmentReceived = results[1].reduce((sum, row) => sum+BigInt(row.investment_received_cents || 0),0n);
  const budgetClassified = Boolean(state.published_run && state.saved_config?.budgetRelieving);
  const budgetCents = results[1].reduce((sum, row) => sum+BigInt(row.budget_relieving_cents || 0),0n);
  const budgetReceived = results[1].reduce((sum, row) => sum+BigInt(row.budget_relieving_received_cents || 0),0n);
  if ([investmentCents,investmentReceived,sums[1]-investmentCents,sums[5]-investmentReceived,budgetCents,budgetReceived,sums[1]-budgetCents,sums[5]-budgetReceived].some(value => value>BigInt(Number.MAX_SAFE_INTEGER) || value<BigInt(Number.MIN_SAFE_INTEGER)))
    throw campaignError("The classification totals exceed the supported exact-amount range.",409);
  return { version: Number(state.version), canManage, runId: state.published_run, busy: state.busy === true,
    sourceChanged: Boolean(state.published_run && (state.config.sourceKey !== state.source_key || campaignFinancialIdentity(state.config)!==campaignFinancialIdentity(state.saved_config) || campaignClassificationIdentity(state.config)!==campaignClassificationIdentity(state.saved_config))),
    config: canManage ? { ...state.config,...(state.config.writeOffLedger ? { writeOffLedger:campaignWriteOffSummary(state.config.writeOffLedger) } : {}) } : undefined, job: canManage ? job : null,
    writeOffSource: csv ? campaignWriteOffSummary(state.saved_config.writeOffLedger) : null,
    updatedAt: state.completed_at, rawRows: state.raw_rows, uniqueRows: state.unique_rows,
    priorities: numeric(results[1]), funds: numeric(results[2]), rows: numeric(results[3]),
    originalCents: Number(sums[0]), effectiveCents: Number(sums[1]),
    netCents: Number(sums[2]), writeOffCents: committedReady ? Number(sums[3]) : null,
    pledgeBalanceCents: receivedReady ? Number(sums[4]) : null,
    segments: { fiscalYearStartMonth: ORGANIZATION_REPORTING_POLICY.fiscalYearStartMonth,
      budgetRelieving: { status: budgetClassified ? "ready" : "source_needed", queryId: state.saved_config?.budgetRelieving?.queryId || null,
        cents: budgetClassified ? Number(budgetCents) : null, otherCents: budgetClassified ? Number(sums[1]-budgetCents) : null,
        receivedCents: budgetClassified && receivedReady ? Number(budgetReceived) : null,
        otherReceivedCents: budgetClassified && receivedReady ? Number(sums[5]-budgetReceived) : null },
      classification: { status: classified ? "ready" : "source_needed", queryId: state.saved_config?.investment?.queryId || null,
        investmentCents: classified ? Number(investmentCents) : null, philanthropicCents: classified ? Number(sums[1]-investmentCents) : null,
        investmentReceivedCents: classified && receivedReady ? Number(investmentReceived) : null,
        philanthropicReceivedCents: classified && receivedReady ? Number(sums[5]-investmentReceived) : null },
      fiscalYears: numeric(results[6]),
      committed: { status: committedReady ? "ready" : "source_needed", cents: committedReady ? Number(sums[1]) : null,
        description: committedReady ? "Full gift amounts less write-offs, including approved campaign-only adjustments." : "Choose a write-off source and current pledge balances, then refresh. Previous totals remain unchanged until checks finish." },
      received: { status: receivedReady ? "ready" : "source_needed", cents: receivedReady ? Number(sums[5]) : null,
        description: receivedReady ? "Committed less outstanding pledge balances. Paid to date, not receipts during a particular fiscal year." : "Complete the write-off and balance checks to calculate Received. Missing financial data is not treated as zero." } },
    total: results[4][0]?.total || 0, gifts: results[4][0]?.gifts || 0, orphaned: results[5][0]?.orphaned || 0, page };
}

export async function saveCampaignConfig(actor, version, config, db = sql, audit = { operation:"source",reason:"Campaign source settings" }) {
  assertCampaignEditor(actor);
  const rows = await db`WITH prior AS MATERIALIZED (SELECT * FROM campaign_priority_state WHERE id=1),
    updated AS (
      UPDATE campaign_priority_state s SET config=${JSON.stringify(config)}::jsonb ||
        CASE WHEN s.config->>'sourceKey'=${config.sourceKey} AND s.config ? 'writeOffLedger' AND NOT ${Boolean(config.writeOffLedger)}
          THEN jsonb_build_object('writeOffLedger',s.config->'writeOffLedger') ELSE '{}'::jsonb END ||
        CASE WHEN s.config->>'sourceKey'=${config.sourceKey} AND s.config ? 'investment' AND NOT ${Object.hasOwn(config,"investment")}
          THEN jsonb_build_object('investment',s.config->'investment') ELSE '{}'::jsonb END ||
        CASE WHEN s.config->>'sourceKey'=${config.sourceKey} AND s.config ? 'budgetRelieving' AND NOT ${Object.hasOwn(config,"budgetRelieving")}
          THEN jsonb_build_object('budgetRelieving',s.config->'budgetRelieving') ELSE '{}'::jsonb END,version=s.version+1
      FROM users u WHERE s.id=1 AND s.version=${version} AND (s.lease_until IS NULL OR s.lease_until<=NOW())
        AND (s.job IS NULL OR s.job->>'stage' IN ('complete','failed','cancelled'))
        AND u.id=${actor.id} AND u.role=${actor.role} AND u.active=TRUE RETURNING s.*
    ), audited AS (
      INSERT INTO campaign_priority_events(actor_id,actor_name,operation,source_key,reason,before_value,after_value)
      SELECT ${actor.id},${actor.name},${audit.operation},${config.sourceKey},${audit.reason},prior.config,updated.config
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
      AND EXISTS(SELECT 1 FROM campaign_priority_runs r WHERE r.id=s.published_run
        AND COALESCE(r.config->>'financialSource','query')=COALESCE(s.config->>'financialSource','query')
        AND COALESCE(r.config->'columns'->>'writeOff','')=COALESCE(s.config->'columns'->>'writeOff','')
        AND COALESCE(r.config->'columns'->>'pledgeBalance','')=COALESCE(s.config->'columns'->>'pledgeBalance',''))
      AND EXISTS(SELECT 1 FROM campaign_priority_runs r WHERE r.id=s.published_run AND COALESCE(r.config->'investment','null'::jsonb)=COALESCE(s.config->'investment','null'::jsonb))
      AND EXISTS(SELECT 1 FROM campaign_priority_runs r WHERE r.id=s.published_run AND COALESCE(r.config->'budgetRelieving','null'::jsonb)=COALESCE(s.config->'budgetRelieving','null'::jsonb))
      AND (COALESCE(s.config->>'financialSource','query')<>'csv' OR EXISTS(SELECT 1 FROM campaign_priority_runs r WHERE r.id=s.published_run
        AND r.config->'writeOffLedger'->>'revision'=s.config->'writeOffLedger'->>'revision'))
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
      HAVING SUM(ABS(e.amount_cents::numeric)+ABS(e.effective_cents::numeric)+ABS(COALESCE(e.write_off_cents,0)::numeric)
        +ABS(COALESCE(e.pledge_balance_cents,0)::numeric)+ABS(COALESCE(e.received_cents,0)::numeric))>9007199254740991) THEN
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
