import { campaignError, campaignId } from "@/utils/campaignPriorities";
import { campaignClassification, investmentIdFields, validateCampaignInvestment } from "@/utils/campaignInvestment";
import { CAMPAIGN_LIMITS, inspectCampaignQuery } from "./campaignPriorityQuery";
import { assertCampaignEditor, campaignState, saveCampaignConfig } from "./campaignPriorityStore";

export function inspectInvestmentQuery(query, config, kind = "investment") {
  const { label } = campaignClassification(kind);
  const result = inspectCampaignQuery(query, config.queryId);
  if (result.queryName !== config.queryName || !investmentIdFields(result.fields).includes(config.giftIdColumn))
    throw campaignError(`The ${label} query name or gift system ID field changed. Review its setup before refreshing.`, 409);
  return result;
}

export async function saveCampaignInvestment(actor, version, input, transport, db, kind = "investment") {
  assertCampaignEditor(actor);
  const { label } = campaignClassification(kind);
  const investment = validateCampaignInvestment(input, kind), state = await campaignState(db);
  if (!state.config.sourceKey || state.config.connectionKey !== transport.connectionKey)
    throw campaignError("Save the main campaign source with the current reporting connection first.", 409);
  if (investment.queryId === state.config.queryId) throw campaignError(`Use a separate ${label} classification query, not the main campaign query.`);
  inspectInvestmentQuery(await transport.metadata(investment.queryId), investment, kind);
  return saveCampaignConfig(actor, version, { ...state.config, [kind]: investment }, db,
    { operation: `${kind}_source`, reason: `${label} classification query` });
}

export async function classifyCampaignInvestment(state, result, db, kind = "investment") {
  const { label } = campaignClassification(kind);
  const { giftIds, rawRows } = result;
  if (!Array.isArray(giftIds) || !Number.isSafeInteger(rawRows) || rawRows < giftIds.length || rawRows > CAMPAIGN_LIMITS.rows || giftIds.some(id => campaignId(id) !== id))
    throw campaignError(`The ${label} result is invalid. Previous totals are unchanged.`);
  const ids = [...new Set(giftIds)], runId = state.job.runId;
  const found = new Set((await db`SELECT DISTINCT gift_id FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND gift_id=ANY(${ids})`).map(row => row.gift_id));
  const unmatched = ids.filter(id => !found.has(id));
  if (unmatched.length) throw campaignError(`${unmatched.length} ${label} gifts are not in the main campaign query (including ${unmatched.slice(0,5).join(", ")}). Review the query scope; no gifts were added or partial totals published.`);
  // Classify the verified campaign allocations; never add the second query's amounts.
  await db`UPDATE campaign_priority_rows SET
    is_investment=CASE WHEN ${kind}='investment' THEN FALSE ELSE is_investment END,
    is_budget_relieving=CASE WHEN ${kind}='budgetRelieving' THEN FALSE ELSE is_budget_relieving END WHERE run_id=${runId}::uuid
    AND EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW())`;
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const batch = ids.slice(offset, offset+1000);
    const changed = await db`UPDATE campaign_priority_rows SET
      is_investment=CASE WHEN ${kind}='investment' THEN TRUE ELSE is_investment END,
      is_budget_relieving=CASE WHEN ${kind}='budgetRelieving' THEN TRUE ELSE is_budget_relieving END WHERE run_id=${runId}::uuid AND gift_id=ANY(${batch})
      AND EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW()) RETURNING gift_id`;
    if (new Set(changed.map(row => row.gift_id)).size !== batch.length)
      throw campaignError("The classification refresh lost its lease. Previous campaign totals are unchanged.", 409);
  }
  return { rawRows, gifts: ids.length };
}
