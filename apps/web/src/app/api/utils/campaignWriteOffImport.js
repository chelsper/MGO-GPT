import sql from "./sql";
import { campaignError, campaignFinancialKind, validateCampaignSource } from "@/utils/campaignPriorities";
import { parseCampaignWriteOffCsv, mergeCampaignWriteOffCsv, campaignPledgeType } from "@/utils/campaignWriteOffCsv";
import { assertCampaignEditor, campaignState, saveCampaignConfig } from "./campaignPriorityStore";
import { campaignBaseHash, campaignHash, inspectCampaignQuery } from "./campaignPriorityQuery";
import { proportionalCampaignCents } from "./campaignPrioritySplits";

function verifyGift(entry, rows) {
  const gross = rows.reduce((sum,row)=>sum+BigInt(row.amount_cents),0n);
  if (!rows.length || rows.some(row=>row.conflict || campaignPledgeType(row.gift_type)!==entry.type || Number(row.amount_cents)<0) || gross!==BigInt(entry.grossCents))
    throw campaignError(`Gift ${entry.giftId}: the CSV pledge type or original amount does not match all saved campaign allocations. Refresh the campaign or correct the file; no amounts were guessed.`);
}

export async function saveCampaignWriteOffs(actor, version, input, transport, db = sql) {
  assertCampaignEditor(actor);
  if (!input || Object.keys(input).some(key=>!["csv","asOf","complete","confirmed","balanceColumn"].includes(key))) throw campaignError("Review the write-off import fields.");
  const upload = parseCampaignWriteOffCsv(input.csv);
  const state = await campaignState(db);
  if (state.version!==version || state.busy || state.job && !["complete","failed","cancelled"].includes(state.job.stage))
    throw campaignError("The campaign changed or a refresh is running. Reload saved data before importing write-offs.",409);
  if (!state.published_run || !state.config.sourceKey || state.config.connectionKey!==transport.connectionKey)
    throw campaignError("Load the campaign using the current shared reporting connection before importing write-offs.",409);
  const [published] = await db`SELECT source_key FROM campaign_priority_runs WHERE id=${state.published_run}::uuid`;
  if (published?.source_key!==state.config.sourceKey) throw campaignError("Refresh the new campaign source before matching write-offs.",409);
  const { queryId, queryName, mode, columns } = state.config;
  const config = { ...validateCampaignSource({ queryId,queryName,mode,columns:{ ...columns,pledgeBalance:input.balanceColumn },confirmed:true,financialSource:"csv" }),
    sourceKey:state.config.sourceKey,connectionKey:state.config.connectionKey };
  inspectCampaignQuery(await transport.metadata(queryId),queryId,config);
  const ledger = mergeCampaignWriteOffCsv(state.config.writeOffLedger,upload,input);
  const rows = await db`SELECT gift_id,gift_type,amount_cents,conflict FROM campaign_priority_rows
    WHERE run_id=${state.published_run}::uuid AND gift_id=ANY(${upload.entries.map(row=>row.giftId)})`;
  const byGift = rows.reduce((map,row)=>map.set(row.gift_id,[...(map.get(row.gift_id)||[]),row]),new Map());
  for (const entry of upload.entries) verifyGift(entry,byGift.get(entry.giftId)||[]);
  config.writeOffLedger = { ...ledger, revision:campaignHash(ledger), updatedAt:new Date().toISOString(), updatedBy:actor.name };
  // Replace cumulative totals by gift ID, never add them to an earlier upload.
  return saveCampaignConfig(actor,version,config,db,{ operation:"write_off_csv",reason:`CSV write-off totals through ${input.asOf}; ${upload.count} pledges; ${input.complete ? "complete list" : "additions/corrections"}` });
}

export function campaignCsvAllocations(entry, rows, mode) {
  verifyGift(entry,rows);
  const values = rows.map(row=>({ itemKey:row.item_key,giftId:row.gift_id,splitId:row.split_id,fundId:row.fund_id,
    fundName:row.fund_name,donorName:row.donor_name,giftDate:row.gift_date,giftType:row.gift_type,amountCents:Number(row.amount_cents) }));
  const writeOffs = proportionalCampaignCents(entry.writeOffCents,values);
  if (rows.some(row=>row.pledge_balance_cents==null)) throw campaignError(`Gift ${entry.giftId}: the current pledge balance is missing. No new totals were published.`);
  const balance = rows.reduce((sum,row)=>sum+BigInt(row.pledge_balance_cents),0n);
  if (balance<0n || balance>BigInt(entry.grossCents-entry.writeOffCents))
    throw campaignError(`Gift ${entry.giftId}: the current pledge balance plus the CSV write-off exceeds the pledge amount. Check both sources; previous totals are unchanged.`);
  const balances = mode==="gift" ? proportionalCampaignCents(Number(balance),values.map((row,i)=>({ ...row,amountCents:row.amountCents-writeOffs[i] }))) : rows.map(row=>Number(row.pledge_balance_cents));
  return values.map((row,index)=>{
    const value = { ...row,writeOffCents:writeOffs[index],pledgeBalanceCents:balances[index] };
    if (value.pledgeBalanceCents>value.amountCents-value.writeOffCents) throw campaignError(`Gift ${entry.giftId}: a split balance exceeds its net amount. Review its allocations; previous totals are unchanged.`);
    return { ...value,baseHash:campaignBaseHash(value),rowHash:campaignHash(value) };
  });
}

export async function applyCampaignCsvWriteOffs(state, db) {
  const ledger = state.config.writeOffLedger;
  if (!ledger?.completeAsOf || !ledger.revision || !Array.isArray(ledger.entries))
    throw campaignError("Import a complete write-off CSV before refreshing with CSV write-offs. Previous results are unchanged.");
  const runId = state.job.runId;
  const types = await db`SELECT DISTINCT gift_type FROM campaign_priority_rows WHERE run_id=${runId}::uuid`;
  for (const row of types) campaignFinancialKind(row.gift_type);
  const rows = await db`SELECT * FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND gift_id=ANY(${ledger.entries.map(row=>row.giftId)})`;
  const grouped = new Map();
  for (const row of rows) grouped.set(row.gift_id,[...(grouped.get(row.gift_id)||[]),row]);
  const allocations = ledger.entries.flatMap(entry => grouped.has(entry.giftId) ? campaignCsvAllocations(entry,grouped.get(entry.giftId),state.config.mode) : []);
  await db`UPDATE campaign_priority_rows SET write_off_cents=0 WHERE run_id=${runId}::uuid
    AND EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW())`;
  for (let offset=0;offset<allocations.length;offset+=500) {
    const batch = allocations.slice(offset,offset+500);
    const saved = await db`UPDATE campaign_priority_rows r SET write_off_cents=x."writeOffCents",pledge_balance_cents=x."pledgeBalanceCents",base_hash=x."baseHash",row_hash=x."rowHash"
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x("itemKey" text,"writeOffCents" bigint,"pledgeBalanceCents" bigint,"baseHash" text,"rowHash" text)
      WHERE r.run_id=${runId}::uuid AND r.item_key=x."itemKey"
        AND EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW()) RETURNING r.item_key`;
    if (saved.length!==batch.length) throw campaignError("The write-off refresh lost its lease. Reload saved status; previous totals are unchanged.",409);
  }
  const [invalid] = await db`SELECT gift_id FROM campaign_priority_rows WHERE run_id=${runId}::uuid
    AND (pledge_balance_cents IS NULL OR pledge_balance_cents<0 OR pledge_balance_cents>GREATEST(0,amount_cents-write_off_cents)) LIMIT 1`;
  if (invalid) throw campaignError(`Gift ${invalid.gift_id}: the current pledge balance is missing or exceeds its net amount. Previous campaign totals are unchanged.`);
}
