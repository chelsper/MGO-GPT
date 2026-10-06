import { randomUUID } from "node:crypto";
import sql from "./sql";
import { campaignError } from "@/utils/campaignPriorities";
import { inspectCampaignQuery } from "./campaignPriorityQuery";
import { assertCampaignEditor } from "./campaignPriorityStore";
import { isBlackbaudQuotaExceededError } from "./blackbaud";
import { getQueryJobId, getQueryJobStatus, getQueryJobMetadataRowCount, getQueryResultUrl } from "./savedQueryExecution";

async function saveJob(state, job, db) {
  const saved = await db`UPDATE campaign_priority_state SET job=${JSON.stringify(job)}::jsonb,version=version+1,lease=NULL,lease_until=NULL
    WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW() RETURNING version`;
  if (!saved.length) throw campaignError("Another request took over this refresh. Reload saved status.", 409);
  return { version: Number(saved[0].version), stage: job.stage };
}

export async function stageCampaignRows(state, rows, db) {
  const unique = new Map();
  for (const row of rows) {
    const before = unique.get(row.itemKey);
    unique.set(row.itemKey, before ? { ...before, conflict: before.conflict || before.rowHash !== row.rowHash } : { ...row, conflict: false });
  }
  const result = await db`WITH eligible AS (
      SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${state.lease}::uuid AND lease_until>NOW()
    ), inserted AS (
      INSERT INTO campaign_priority_rows(run_id,item_key,gift_id,split_id,fund_id,fund_name,donor_name,gift_date,gift_type,amount_cents,base_hash,row_hash,conflict)
      SELECT ${state.job.runId}::uuid,x."itemKey",x."giftId",x."splitId",x."fundId",x."fundName",x."donorName",x."giftDate",x."giftType",x."amountCents",x."baseHash",x."rowHash",x.conflict
      FROM jsonb_to_recordset(${JSON.stringify([...unique.values()])}::jsonb) AS x("itemKey" text,"giftId" text,"splitId" text,"fundId" text,"fundName" text,"donorName" text,"giftDate" text,"giftType" text,"amountCents" bigint,"baseHash" text,"rowHash" text,conflict boolean)
      CROSS JOIN eligible ON CONFLICT(run_id,item_key) DO UPDATE SET conflict=campaign_priority_rows.conflict OR EXCLUDED.conflict OR campaign_priority_rows.row_hash<>EXCLUDED.row_hash
      RETURNING item_key
    ) SELECT COUNT(*)::int AS count FROM inserted`;
  if (Number(result[0]?.count) !== unique.size) throw campaignError("This refresh was interrupted. The last complete dataset is unchanged.", 409);
}

export async function advanceCampaignRefresh(actor, version, operation, transport, db = sql) {
  assertCampaignEditor(actor);
  const lease = randomUUID();
  const [state] = await db`UPDATE campaign_priority_state s SET lease=${lease}::uuid,lease_until=NOW()+INTERVAL '5 minutes'
    FROM users u WHERE s.id=1 AND s.version=${version} AND (s.lease_until IS NULL OR s.lease_until<=NOW())
      AND u.id=${actor.id} AND u.role=${actor.role} AND u.active=TRUE RETURNING s.*`;
  if (!state) throw campaignError("The campaign changed or a refresh is working. Reload saved status before continuing.", 409);
  state.lease = lease;
  let job = state.job;
  try {
    if (operation === "cancel") return await saveJob(state, { ...job, stage: "cancelled", error: null }, db);
    if (!state.config.sourceKey || state.config.connectionKey !== transport.connectionKey) throw campaignError("Review and save the campaign source with the current shared reporting connection first.", 409);
    if (operation === "start") {
      if (job && !["complete", "failed", "cancelled"].includes(job.stage)) throw campaignError("Continue or cancel the existing refresh before starting another.", 409);
      inspectCampaignQuery(await transport.metadata(state.config.queryId), state.config.queryId, state.config);
      job = { stage: "starting", runId: randomUUID(), startedAt: new Date().toISOString(), connectionKey: transport.connectionKey };
      state.job = job;
      const prepared = await db.transaction([
        db`INSERT INTO campaign_priority_runs(id,source_key,query_id,config,created_by,status)
          SELECT ${job.runId}::uuid,${state.config.sourceKey},${state.config.queryId},${JSON.stringify(state.config)}::jsonb,${actor.id},'staging'
          WHERE EXISTS(SELECT 1 FROM campaign_priority_state WHERE id=1 AND lease=${lease}::uuid AND lease_until>NOW()) RETURNING id`,
        db`UPDATE campaign_priority_state SET job=${JSON.stringify(job)}::jsonb WHERE id=1 AND lease=${lease}::uuid AND lease_until>NOW() RETURNING id`,
      ]);
      if (!prepared[0]?.length || !prepared[1]?.length) throw campaignError("The query could not be reserved safely. Reload before continuing.", 409);
      const created = await transport.create(state.config.queryId);
      const queryJobId = getQueryJobId(created);
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(queryJobId)) throw campaignError("NXT did not confirm the query job. Cancel this attempt before starting again.");
      job = { ...job, stage: "waiting", queryJobId, nextCheckAt: new Date(Date.now()+15000).toISOString() };
      return await saveJob(state, job, db);
    }
    if (!job || !["waiting", "downloading"].includes(job.stage) || !job.queryJobId) throw campaignError("There is no resumable query. Start a fresh refresh; saved totals remain available.", 409);
    if (Date.now()-Date.parse(job.startedAt)>2*60*60*1000) throw campaignError("This query job expired. Start a fresh refresh; saved totals remain available.");
    if (Date.now()<Date.parse(job.nextCheckAt || "")) return await saveJob(state, job, db);
    const result = await transport.poll(job.queryJobId);
    if (getQueryJobId(result) !== job.queryJobId) throw campaignError("NXT returned a different query job. Saved results are unchanged.");
    const status = getQueryJobStatus(result);
    if (/fail|cancel|error|declin/i.test(status)) throw campaignError("NXT could not complete this query. Saved results are unchanged.");
    if (!/^(completed|complete|success|succeeded)$/i.test(status)) {
      if (!/^(pending|queued|running|inprogress|notstarted)$/i.test(status)) throw campaignError("NXT returned an unknown query status.");
      return await saveJob(state, { ...job, nextCheckAt: new Date(Date.now()+15000).toISOString() }, db);
    }
    job = { ...job, stage: "downloading", nextCheckAt: null };
    state.job = job;
    await db`UPDATE campaign_priority_state SET job=${JSON.stringify(job)}::jsonb WHERE id=1 AND lease=${lease}::uuid`;
    const { rawRows } = await transport.read(getQueryResultUrl(result), state.config, getQueryJobMetadataRowCount(result), rows => stageCampaignRows(state, rows, db));
    const [counts] = await db`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE conflict)::int AS conflicts,
      COUNT(DISTINCT fund_id)::int AS funds,
      COALESCE(SUM(ABS(amount_cents::numeric)+ABS(effective_cents::numeric)),0)::text AS absolute_cents
      FROM campaign_priority_effective WHERE run_id=${job.runId}::uuid`;
    if (BigInt(counts.absolute_cents)>BigInt(Number.MAX_SAFE_INTEGER)) throw campaignError("The query exceeds the campaign's exact-amount limit. The previous dataset is unchanged.");
    if (counts.conflicts || counts.funds > 2000 || counts.total > rawRows) throw campaignError("The query has conflicting duplicate gift allocations or more than 2,000 funds. Check its output fields; the previous dataset is unchanged.");
    // One atomic publication pointer makes partial downloads invisible. The
    // guarded run update and publication/audit either all commit or all roll back.
    const published = await db`WITH eligible AS MATERIALIZED (
        SELECT s.* FROM campaign_priority_state s JOIN users u ON u.id=${actor.id} AND u.role=${actor.role} AND u.active=TRUE
        WHERE s.id=1 AND s.lease=${lease}::uuid AND s.lease_until>NOW() AND s.config->>'sourceKey'=${state.config.sourceKey}
      ), completed AS (
        UPDATE campaign_priority_runs SET status='complete',raw_rows=${rawRows},unique_rows=${counts.total},completed_at=NOW()
        WHERE id=${job.runId}::uuid AND EXISTS(SELECT 1 FROM eligible) RETURNING id
      ), updated AS (
        UPDATE campaign_priority_state s SET published_run=c.id,version=s.version+1,lease=NULL,lease_until=NULL,
          job=jsonb_build_object('stage','complete','runId',c.id)
        FROM completed c WHERE s.id=1 AND s.lease=${lease}::uuid RETURNING s.version
      ), audited AS (
        INSERT INTO campaign_priority_events(actor_id,actor_name,operation,source_key,reason,before_value,after_value)
        SELECT ${actor.id},${actor.name},'refresh',${state.config.sourceKey},'Completed campaign query',
          jsonb_build_object('runId',${state.published_run}::uuid),jsonb_build_object('runId',${job.runId}::uuid,'rawRows',${rawRows}::integer,'uniqueRows',${counts.total}::integer) FROM updated RETURNING id
      ) SELECT version FROM updated`;
    if (!published.length) throw campaignError("This refresh lost its lease before publication. Reload saved status.", 409);
    // Keep the two most recent complete datasets and this published run. Other
    // staging data is disposable; local assignments, exceptions and audit survive.
    await db`DELETE FROM campaign_priority_runs WHERE id<>${job.runId}::uuid
      AND id NOT IN(SELECT id FROM campaign_priority_runs WHERE status='complete' ORDER BY completed_at DESC LIMIT 2)
      AND created_at<NOW()-INTERVAL '2 hours'`.catch(() => {});
    return { version: Number(published[0].version), stage: "complete" };
  } catch (error) {
    const pause = error.httpStatus === 429 || isBlackbaudQuotaExceededError(error) || (error.httpStatus === 403 && error.retryAfterMs > 0);
    const message = error.campaignSafe ? error.message : pause ? "Blackbaud paused this refresh. Saved results remain available; continue after the cooldown." : "The campaign query could not be completed. Check its fields and permissions; saved results are unchanged.";
    const updatedJob = { ...job, stage: pause && job?.queryJobId ? "waiting" : "failed", error: message,
      nextCheckAt: pause ? new Date(Date.now()+Math.max(15000, Number(error.retryAfterMs)||60000)).toISOString() : null };
    return await saveJob(state, updatedJob, db);
  }
}
