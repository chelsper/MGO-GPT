import { campaignError, campaignFinancialKind } from "@/utils/campaignPriorities";
import { campaignBaseHash, campaignHash } from "./campaignPriorityQuery";
import { advanceCampaignPledge, campaignPledgeAllocations } from "./campaignPledgeReconciliation";
import { withBlackbaudReadBudget } from "./blackbaudReadBudget";

export async function prepareCampaignFinancials(state, db) {
  const runId = state.job.runId;
  const types = await db`SELECT DISTINCT gift_type FROM campaign_priority_rows WHERE run_id=${runId}::uuid`;
  const pledgeTypes = [], otherTypes = [];
  for (const { gift_type: type } of types) (campaignFinancialKind(type)==="pledge" ? pledgeTypes : otherTypes).push(type);
  const prepared = await db.transaction([
    db`INSERT INTO campaign_priority_pledge_checks(run_id,gift_id)
      SELECT DISTINCT run_id,gift_id FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND gift_type=ANY(${pledgeTypes})
        AND EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW())
      ON CONFLICT(run_id,gift_id) DO NOTHING`,
    db`UPDATE campaign_priority_rows SET write_off_cents=0,pledge_balance_cents=0
      WHERE run_id=${runId}::uuid AND gift_type=ANY(${otherTypes})
        AND EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW())`,
  ]);
  return prepared;
}

async function saveCheck(state, check, rows, db) {
  const allocations = rows.map(row=>({ ...row,baseHash:campaignBaseHash(row),rowHash:campaignHash(row) }));
  const [saved] = await db`WITH eligible AS MATERIALIZED (
      SELECT id FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW()
        AND job->>'stage'='financial' AND job->>'runId'=${state.job.runId} AND config->>'sourceKey'=${state.config.sourceKey} FOR UPDATE
    ), amounts AS (
      UPDATE campaign_priority_rows r SET write_off_cents=x."writeOffCents",pledge_balance_cents=x."pledgeBalanceCents",base_hash=x."baseHash",row_hash=x."rowHash"
      FROM jsonb_to_recordset(${JSON.stringify(allocations)}::jsonb) AS x("itemKey" text,"writeOffCents" bigint,"pledgeBalanceCents" bigint,"baseHash" text,"rowHash" text)
      WHERE r.run_id=${state.job.runId}::uuid AND r.gift_id=${check.gift_id} AND r.item_key=x."itemKey" AND EXISTS(SELECT 1 FROM eligible) RETURNING r.item_key
    ), updated AS (
      UPDATE campaign_priority_pledge_checks SET stage=${check.stage},draft=${JSON.stringify(["complete","blocked"].includes(check.stage) ? {} : check.draft)}::jsonb,
        result=${JSON.stringify(check.result || null)}::jsonb,checked_at=CASE WHEN ${check.stage} IN ('complete','blocked') THEN NOW() ELSE NULL END
      WHERE run_id=${state.job.runId}::uuid AND gift_id=${check.gift_id} AND EXISTS(SELECT 1 FROM eligible)
        AND (SELECT COUNT(*) FROM amounts)=${allocations.length} RETURNING gift_id
    ) SELECT COUNT(*)::int AS count FROM updated`;
  if (saved.count!==1) throw campaignError("The pledge check lost its refresh lease. Reload saved status; previous totals are unchanged.",409);
}

export async function campaignFinancialProgress(runId, db) {
  const [counts] = await db`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE stage='complete')::int AS checked,
    COUNT(*) FILTER(WHERE stage='blocked')::int AS blocked,
    COUNT(*) FILTER(WHERE stage='complete' AND (result->>'writeOffCents')::bigint>0)::int AS "withWriteOffs"
    FROM campaign_priority_pledge_checks WHERE run_id=${runId}::uuid`;
  const issues = counts.blocked ? await db`SELECT gift_id AS "giftId",result->>'error' AS message FROM campaign_priority_pledge_checks
    WHERE run_id=${runId}::uuid AND stage='blocked' ORDER BY gift_id::numeric LIMIT 10` : [];
  return { ...counts,issues };
}

export async function resolveCampaignFinancials(state, transport, db, { maxSteps=6, now=()=>Date.now() } = {}) {
  const deadline = now()+40000;
  let reads = 0;
  return withBlackbaudReadBudget(async () => ++reads<=maxSteps && now()<deadline,async () => {
    for (let i=0;i<maxSteps && now()<deadline;i++) {
      const [check] = await db`SELECT * FROM campaign_priority_pledge_checks WHERE run_id=${state.job.runId}::uuid AND stage NOT IN ('complete','blocked') ORDER BY gift_id::numeric LIMIT 1`;
      if (!check) break;
      let updated;
      let allocations=[];
      try {
        updated = await advanceCampaignPledge(check,transport);
        if (updated.stage==="complete") {
          const rows = await db`SELECT * FROM campaign_priority_rows WHERE run_id=${state.job.runId}::uuid AND gift_id=${check.gift_id}`;
          allocations = campaignPledgeAllocations(rows,updated,state.config.mode);
        }
      }
      catch (error) {
        if ((error.campaignSafe && error.status!==409) || [400,404].includes(error.httpStatus)) {
          const message = error.campaignSafe ? (error.message.startsWith(`Pledge ${check.gift_id}:`) ? error.message : `Pledge ${check.gift_id}: ${error.message}`)
            : `Pledge ${check.gift_id}: NXT could not provide this pledge's complete records (HTTP ${error.httpStatus}). Verify the gift type and access. Missing amounts are not zero.`;
          await saveCheck(state,{ ...check,stage:"blocked",result:{ error:message } },[],db);
          continue;
        }
        if (!error.campaignSafe && !error.httpStatus && error.name!=="BlackbaudQuotaExceededError")
          throw campaignError(`Pledge ${check.gift_id}: NXT could not return all linked records. Check access and retry the refresh. Saved totals are unchanged.`);
        throw error;
      }
      await saveCheck(state,updated,allocations,db);
    }
    return campaignFinancialProgress(state.job.runId,db);
  });
}
