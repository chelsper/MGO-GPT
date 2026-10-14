import { campaignCents, campaignError, campaignId } from "@/utils/campaignPriorities";
import { campaignHash, campaignBaseHash } from "./campaignPriorityQuery";

export const CAMPAIGN_SPLIT_LIMITS = { gifts: 100, perRequest: 10, fundsPerGift: 20 };

// Only staging keys use this namespace. Published keys remain gift or gift:split.
export const campaignGiftStagingKey = row => `${row.giftId}:fund:${row.fundId}`;

// Largest-remainder allocation preserves whole-gift cents, with stable split-ID
// ties. This allocates only reporting deductions, never the NXT gift amounts.
export function proportionalCampaignCents(total, allocations) {
  if (total == null) return allocations.map(() => null);
  const cents = BigInt(total), sum = allocations.reduce((value, row) => value+BigInt(row.amountCents), 0n);
  if (cents < 0n || cents > 100000000000000n || (sum === 0n && cents !== 0n))
    throw campaignError("A split gift's write-off or balance cannot be distributed safely. No new totals were published.");
  if (!sum) return allocations.map(() => 0);
  const parts = allocations.map((row, index) => {
    const weighted = cents*BigInt(row.amountCents);
    return { index, id: row.splitId, cents: weighted/sum, remainder: weighted%sum };
  });
  const remaining = Number(cents-parts.reduce((value, part) => value+part.cents, 0n));
  const ranked = [...parts].sort((a,b) => a.remainder === b.remainder ? (BigInt(a.id)<BigInt(b.id) ? -1 : 1) : a.remainder>b.remainder ? -1 : 1);
  for (let i=0; i<remaining; i++) ranked[i].cents++;
  return parts.map(part => Number(part.cents));
}

export function verifiedCampaignSplits(rows, gift) {
  const giftId = rows[0]?.gift_id;
  const fail = () => { throw campaignError(`Gift ${giftId || "unknown"} could not be reconciled to its NXT fund allocations. Check its query amount and fund outputs, or use split IDs and split amounts. No new totals were published.`); };
  if (!campaignId(giftId) || campaignId(gift?.id) !== giftId || rows.length < 2 || rows.length > CAMPAIGN_SPLIT_LIMITS.fundsPerGift ||
      !Array.isArray(gift.gift_splits) || gift.gift_splits.length !== rows.length) fail();
  const total = campaignCents(gift.amount?.value);
  const funds = new Map(rows.map(row => [row.fund_id, row]));
  if (total < 0 || funds.size !== rows.length || rows.some(row => row.conflict || row.gift_id !== giftId ||
      row.split_id !== null || row.item_key !== `${giftId}:fund:${row.fund_id}` || Number(row.amount_cents) !== total ||
      String(row.write_off_cents ?? "") !== String(rows[0].write_off_cents ?? "") ||
      String(row.pledge_balance_cents ?? "") !== String(rows[0].pledge_balance_cents ?? "") ||
      row.gift_date !== rows[0].gift_date || row.gift_type !== rows[0].gift_type || row.donor_name !== rows[0].donor_name)) fail();
  const splitIds = new Set(), fundIds = new Set();
  let sum = 0n;
  const normalized = gift.gift_splits.map(split => {
    const splitId = campaignId(split?.id), fundId = campaignId(split?.fund_id);
    const source = funds.get(fundId);
    if (!splitId || !source || splitIds.has(splitId) || fundIds.has(fundId)) fail();
    splitIds.add(splitId); fundIds.add(fundId);
    const amountCents = campaignCents(split.amount?.value);
    if (amountCents < 0) fail();
    sum += BigInt(amountCents);
    const value = { itemKey: `${giftId}:${splitId}`, giftId, splitId, fundId, fundName: source.fund_name,
      donorName: source.donor_name, giftDate: source.gift_date, giftType: source.gift_type, amountCents };
    return value;
  });
  // Do not add funds absent from the query, infer an equal split, or expand a
  // whole-gift amount unless every returned allocation reconciles exactly.
  if (sum !== BigInt(total)) fail();
  const writeOffs = proportionalCampaignCents(rows[0].write_off_cents, normalized);
  const balances = proportionalCampaignCents(rows[0].pledge_balance_cents,
    normalized.map((row,index) => ({ ...row, amountCents: row.amountCents-(writeOffs[index] || 0) })));
  return normalized.map((row,index) => {
    const value = { ...row, writeOffCents: writeOffs[index], pledgeBalanceCents: balances[index] };
    return { ...value, baseHash: campaignBaseHash(value), rowHash: campaignHash(value) };
  });
}

export async function pendingCampaignSplits(runId, db) {
  return db`SELECT gift_id,COUNT(*)::int AS funds FROM campaign_priority_rows
    WHERE run_id=${runId}::uuid AND split_id IS NULL AND item_key=gift_id||':fund:'||fund_id
    GROUP BY gift_id HAVING COUNT(*)>1 ORDER BY gift_id::numeric LIMIT 101`;
}

export async function resolveCampaignSplits(state, transport, db) {
  const runId = state.job.runId;
  const pending = await pendingCampaignSplits(runId, db);
  const [{ count: resolved }] = await db`SELECT COUNT(DISTINCT gift_id)::int AS count FROM campaign_priority_rows
    WHERE run_id=${runId}::uuid AND split_id IS NOT NULL`;
  if (pending.length + resolved > CAMPAIGN_SPLIT_LIMITS.gifts || pending.some(row => row.funds > CAMPAIGN_SPLIT_LIMITS.fundsPerGift))
    throw campaignError("This query needs more split-gift checks than a bounded refresh supports. Map split system IDs and split amounts instead. Saved totals are unchanged.");
  for (const { gift_id: giftId } of pending.slice(0, CAMPAIGN_SPLIT_LIMITS.perRequest)) {
    const rows = await db`SELECT * FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND gift_id=${giftId} ORDER BY fund_id`;
    if (typeof transport.gift !== "function") throw campaignError("NXT gift details are unavailable. No split amounts were inferred; saved totals are unchanged.");
    const allocations = verifiedCampaignSplits(rows, await transport.gift(giftId));
    // Replace all whole-gift staging rows together. A pause or lost response
    // cannot expose a partial gift or cause a completed gift to be counted twice.
    const [result] = await db`WITH eligible AS MATERIALIZED (
        SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW()
          AND job->>'stage'='resolving' AND job->>'runId'=${runId} AND config->>'sourceKey'=${state.config.sourceKey}
          AND (SELECT COUNT(*) FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND gift_id=${giftId})=${rows.length}
        FOR UPDATE
      ), removed AS (
        DELETE FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND gift_id=${giftId} AND EXISTS(SELECT 1 FROM eligible) RETURNING item_key
      ), inserted AS (
        INSERT INTO campaign_priority_rows(run_id,item_key,gift_id,split_id,fund_id,fund_name,donor_name,gift_date,gift_type,amount_cents,base_hash,row_hash,write_off_cents,pledge_balance_cents)
        SELECT ${runId}::uuid,x."itemKey",x."giftId",x."splitId",x."fundId",x."fundName",x."donorName",x."giftDate",x."giftType",x."amountCents",x."baseHash",x."rowHash",x."writeOffCents",x."pledgeBalanceCents"
        FROM jsonb_to_recordset(${JSON.stringify(allocations)}::jsonb) AS x("itemKey" text,"giftId" text,"splitId" text,"fundId" text,"fundName" text,"donorName" text,"giftDate" text,"giftType" text,"amountCents" bigint,"baseHash" text,"rowHash" text,"writeOffCents" bigint,"pledgeBalanceCents" bigint)
        WHERE (SELECT COUNT(*) FROM removed)=${rows.length} RETURNING item_key
      ) SELECT COUNT(*)::int AS count FROM inserted`;
    if (result.count !== allocations.length) throw campaignError("This refresh was interrupted before the fund allocations were saved. Reload saved status.", 409);
  }
  return pending.length <= CAMPAIGN_SPLIT_LIMITS.perRequest;
}

export async function finishCampaignGiftKeys(state, db) {
  // Single-fund gifts retain their original identity, including any local
  // campaign overrides. Resolved split gifts already have their real NXT IDs.
  await db`UPDATE campaign_priority_rows SET item_key=gift_id
    WHERE run_id=${state.job.runId}::uuid AND split_id IS NULL AND item_key=gift_id||':fund:'||fund_id
      AND EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW())`;
}
