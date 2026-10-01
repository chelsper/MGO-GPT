import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { receiptId } from "@/utils/stewardshipReceipts";
import { HISTORY_LIMITS, prepareHistoryRows, classifyHistoryRows } from "@/utils/stewardshipHistoryImport";
import { getBlackbaudConnection, createBlackbaudQueryJob, getBlackbaudQueryJob, getBlackbaudAction, streamBlackbaudQueryResultWithMetadata } from "./blackbaud";
import { getQueryJobId, getQueryJobStatus, getQueryJobMetadataRowCount, getQueryResultUrl } from "./savedQueryExecution";
import { createResultCsvVisitor, createResultTextDecoder } from "./dashboardQueryResults";
import { readGiftInventory } from "./stewardshipInventory";

const allowed = actor => actor?.id && actor.active !== false && isReviewerRole(actor.role);
const fail = message => Object.assign(new Error(message), { historySafe: true });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const contextFor = (actor, origin) => ({ userId: actor.id, authUserId: actor.id, origin, maxRetries: 0, timeoutMs: 10000 });
const connectionKey = (connection, actor) => {
  if (!connection?.connected_at) throw fail("Connect your NXT account before loading gift history.");
  return createHash("sha256").update(`${actor.id}:${new Date(connection.connected_at).toISOString()}`).digest("hex");
};

export async function readHistoryState(actor, db = sql) {
  if (!allowed(actor)) return null;
  const [state] = await db`SELECT s.version,s.config,s.job,(s.lease_until>NOW()) AS busy
    FROM stewardship_gift_import_state s JOIN users actor ON actor.id=${actor.id}
      AND actor.role=${actor.role} AND actor.active IS NOT FALSE WHERE s.id=1`;
  return state ? { ...state, version: Number(state.version), busy: state.busy === true || state.busy === "t" } : null;
}

export function publicHistoryState(state, actor) {
  if (!state) return null;
  const job = state.job && { ...state.job };
  if (job) {
    delete job.connectionKey;
    delete job.queryJobId;
    delete job.startedAt;
    job.canContinue = String(job.actorId) === String(actor.id);
  }
  return { ...state, version: Number(state.version), job };
}

async function claim(actor, version, db, operation, fingerprint) {
  const lease = randomUUID();
  const [state] = await db`UPDATE stewardship_gift_import_state s SET lease=${lease}::uuid,lease_until=NOW()+INTERVAL '2 minutes'
    FROM users actor WHERE s.id=1 AND s.version=${version} AND (s.lease_until IS NULL OR s.lease_until<=NOW())
      AND (${operation}='start' OR (s.job->>'actorId'=${String(actor.id)} AND s.job->>'connectionKey'=${fingerprint}))
      AND actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE RETURNING s.*`;
  if (!state) throw fail("This import changed or is still working. Reload its saved status before continuing.");
  return { ...state, lease, version: Number(state.version) };
}

async function save(actor, state, config, job, db) {
  const result = await db.transaction([
    db`SELECT id FROM users WHERE id=${actor.id} FOR UPDATE`,
    db`WITH updated AS (
      UPDATE stewardship_gift_import_state s SET config=${JSON.stringify(config)}::jsonb,job=${JSON.stringify(job)}::jsonb,
        version=s.version+1,lease=NULL,lease_until=NULL FROM users actor
      WHERE s.id=1 AND s.lease=${state.lease}::uuid AND s.lease_until>NOW()
        AND actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE RETURNING s.*
    ), audited AS (
      INSERT INTO stewardship_gift_import_events(actor_id,actor_name,operation,snapshot)
      SELECT ${actor.id},${actor.name},'stage',jsonb_build_object('version',version,'stage',job->>'stage','queryId',config->>'queryId')
      FROM updated RETURNING id
    ) SELECT version,config,job,false AS busy FROM updated`,
  ]);
  if (!result.at(-1)?.[0]) throw fail("Saved import status could not be confirmed. Reload before continuing.");
  return result.at(-1)[0];
}

export async function readHistoryQueryResult(url, context, expectedRows) {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0 || expectedRows > HISTORY_LIMITS.rows)
    throw fail("NXT must return a completed row count of no more than 10,000 rows. Narrow the query by date if needed.");
  const { result } = await streamBlackbaudQueryResultWithMetadata(url, { ...context, maxBytes: HISTORY_LIMITS.bytes, redirect: "error" }, ({ contentType }) => {
    const decoder = createResultTextDecoder(contentType);
    const table = { headers: [], rows: [] };
    let bytes = 0;
    const parser = createResultCsvVisitor({ maxRows: HISTORY_LIMITS.rows,
      onHeaders: headers => { table.headers = headers; },
      onRow: row => {
        bytes += Buffer.byteLength(JSON.stringify(row));
        if (bytes > 2 * 1024 * 1024) throw fail("The query contains too much output. Limit it to gift history fields or a smaller date range.");
        table.rows.push(row);
      },
    });
    return { write: chunk => parser.write(decoder.decode(chunk, { stream: true })), finish() {
      parser.write(decoder.decode());
      const { rowCount } = parser.finish();
      if (rowCount !== expectedRows) throw fail("NXT's completed row count does not match its downloaded file. No partial history was saved.");
      return table;
    } };
  });
  return result;
}

async function historyMatches(actor, rows, db) {
  if (!allowed(actor)) return [];
  return db`SELECT d.source_key,d.source_kind,d.item_id::text,d.constituent_id,d.received_on::text,d.voided_at
    FROM stewardship_gift_receipts d JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
    WHERE EXISTS (SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(key text,"itemId" text,"constituentId" text,date text)
      WHERE d.source_key=x.key OR (d.source_kind='app' AND d.item_id=x."itemId"::bigint AND d.constituent_id=x."constituentId" AND (x.date IS NULL OR d.received_on=x.date::date)))`;
}

export async function commitHistoryImport(actor, state, db = sql) {
  if (!allowed(actor) || state.job?.stage !== "preview" || state.job.error ||
      state.job.actorId !== String(actor.id) || !Array.isArray(state.job.preview?.rows) ||
      state.job.preview.rows.some(row => row.status === "conflict" || !receiptId(row.constituentId)) ||
      !Number.isFinite(Date.parse(state.job.loadedAt)) || Date.now() - Date.parse(state.job.loadedAt) > 86400000) return null;
  const rows = state.job.preview.rows;
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(734019,97)`,
    db`SELECT id FROM users WHERE id=${actor.id} FOR UPDATE`,
    db`WITH candidates AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x(key text,"itemId" text,"constituentId" text,name text,date text,"dateBasis" text,item jsonb,"actionId" text,"fieldId" text,category text,value text)
    ), eligible AS MATERIALIZED (
      SELECT s.* FROM stewardship_gift_import_state s JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
      WHERE s.id=1 AND s.lease=${state.lease}::uuid AND s.lease_until>NOW() AND s.job->>'stage'='preview'
        AND s.job->>'actorId'=${String(actor.id)} AND s.job->>'error' IS NULL
        AND (s.job->>'loadedAt')::timestamptz>NOW()-INTERVAL '24 hours'
        AND NOT EXISTS (SELECT 1 FROM candidates x LEFT JOIN stewardship_gift_items i ON i.id=x."itemId"::bigint
          WHERE i.id IS NULL OR i.version<>(x.item->>'version')::integer OR x.date::date>(NOW() AT TIME ZONE 'America/New_York')::date
            OR (x.date IS NULL AND COALESCE((s.job->'preview'->'mapping'->>'allowUndated')::boolean,false)=false))
        AND NOT EXISTS (SELECT 1 FROM candidates x JOIN stewardship_gift_receipts d ON d.source_key=x.key
          WHERE d.item_id<>x."itemId"::bigint OR d.constituent_id<>x."constituentId" OR d.received_on IS DISTINCT FROM x.date::date)
    ), inserted AS (
      INSERT INTO stewardship_gift_receipts(item_id,item_snapshot,constituent_id,constituent_name,owner_name,received_on,note,
        request_token,recorded_by,recorded_by_name,source_kind,source_key,source_snapshot)
      SELECT x."itemId"::bigint,x.item,x."constituentId",x.name,'Not assigned (NXT history)',x.date::date,'Imported historical NXT gift record.',
        gen_random_uuid(),${actor.id},${actor.name},'nxt_history',x.key,
        jsonb_build_object('actionId',x."actionId",'fieldId',x."fieldId",'category',x.category,'value',x.value,
          'queryId',e.config->>'queryId','importId',e.job->>'id','dateBasis',x."dateBasis")
      FROM candidates x CROSS JOIN eligible e
      WHERE NOT EXISTS (SELECT 1 FROM stewardship_gift_receipts d WHERE d.source_key=x.key OR
        (d.source_kind='app' AND d.voided_at IS NULL AND d.item_id=x."itemId"::bigint AND d.constituent_id=x."constituentId" AND (x.date IS NULL OR d.received_on=x.date::date)))
      ON CONFLICT DO NOTHING RETURNING id
    ), updated AS (
      UPDATE stewardship_gift_import_state s SET version=s.version+1,lease=NULL,lease_until=NULL,
        job=jsonb_build_object('stage','committed','id',s.job->>'id','actorId',s.job->>'actorId',
          'inserted',(SELECT COUNT(*) FROM inserted),'skipped',(SELECT COUNT(*) FROM candidates)-(SELECT COUNT(*) FROM inserted),
          'heldCount',s.job->'preview'->'totals'->'needsReview','held',s.job->'preview'->'held','finishedAt',NOW())
      FROM eligible e WHERE s.id=e.id RETURNING s.*
    ), audited AS (
      INSERT INTO stewardship_gift_import_events(actor_id,actor_name,operation,snapshot)
      SELECT ${actor.id},${actor.name},'import',jsonb_build_object('config',config,'result',job) FROM updated RETURNING id
    ) SELECT version,config,job,false AS busy FROM updated`,
  ]);
  return result.at(-1)?.[0] || null;
}

export async function advanceHistoryImport(actor, command, origin, db = sql, deps = {}) {
  if (!allowed(actor) || !Number.isSafeInteger(command.version) || command.version < 1) throw fail("Reload the import with an authorized staff account.");
  const connection = await (deps.connection || getBlackbaudConnection)(actor.id);
  const fingerprint = connectionKey(connection, actor);
  // Reject another actor's continuation before taking a lease or changing saved progress.
  if (command.operation !== "start") {
    const current = await readHistoryState(actor, db);
    if (current?.job?.actorId !== String(actor.id) || current?.job?.connectionKey !== fingerprint)
      throw fail("Continue with the staff account and NXT connection that loaded this query, or load a fresh query.");
  }
  const state = await claim(actor, command.version, db, command.operation, fingerprint);
  let job = state.job;
  let config = state.config;
  try {
    if (command.operation === "start") {
      if (!receiptId(command.queryId) || Number(command.queryId) > Number.MAX_SAFE_INTEGER || command.confirmed !== true)
        throw fail("Enter a saved query system ID and confirm it uses this organization's NXT database.");
      config = { ...config, queryId: command.queryId };
      job = { id: randomUUID(), actorId: String(actor.id), connectionKey: fingerprint, stage: "query", startedAt: new Date().toISOString() };
      const created = await (deps.create || createBlackbaudQueryJob)({ ...contextFor(actor, origin), queryId: command.queryId });
      job.queryJobId = getQueryJobId(created);
      if (!job.queryJobId) throw fail("NXT did not confirm a query job. Reload status before starting a fresh query.");
      job.nextCheckAt = new Date(Date.now() + 15000).toISOString();
    } else {
      if (!job || job.actorId !== String(actor.id) || job.connectionKey !== fingerprint)
        throw fail("Continue with the staff account and NXT connection that loaded this query, or load a fresh query.");
      if (command.operation === "check" && job.stage === "query") {
        if (Date.now() < Date.parse(job.nextCheckAt || "")) return save(actor, state, config, job, db);
        if (Date.now() - Date.parse(job.startedAt) > 30 * 60 * 1000) throw fail("This query has expired. Load a fresh query; saved receipt history is unchanged.");
        const result = await (deps.check || getBlackbaudQueryJob)({ ...contextFor(actor, origin), jobId: job.queryJobId });
        const status = getQueryJobStatus(result);
        if (/(?:fail|cancel|error|declin)/i.test(status)) throw fail("NXT could not complete this query. Check the query and load it again.");
        if (/^(?:completed|complete|succeeded|success)$/i.test(status) && getQueryResultUrl(result)) {
          job.table = await (deps.read || readHistoryQueryResult)(getQueryResultUrl(result), contextFor(actor, origin), getQueryJobMetadataRowCount(result));
          job.stage = "loaded";
          job.loadedAt = new Date().toISOString();
        }
        job.nextCheckAt = new Date(Date.now() + 15000).toISOString();
      } else if (command.operation === "preview" && ["loaded", "preview", "resolving"].includes(job.stage)) {
        if (Date.now() - Date.parse(job.loadedAt) > 24 * 60 * 60 * 1000) throw fail("Load a fresh query before reviewing this import.");
        const items = await readGiftInventory(actor, db);
        let preview;
        try { preview = prepareHistoryRows(job.table, command.mapping, items, today()); }
        catch (error) { throw fail(error.message); }
        job.preview = preview;
        job.stage = preview.rows.some(row => !row.constituentId) ? "resolving" : "preview";
        delete job.nextCheckAt;
        if (job.stage === "preview") preview.rows = classifyHistoryRows(preview.rows, await historyMatches(actor, preview.rows, db));
        config = { ...config, mapping: preview.mapping };
      } else if (command.operation === "resolve" && job.stage === "resolving") {
        if (!Number.isFinite(Date.parse(job.loadedAt)) || Date.now() - Date.parse(job.loadedAt) > 86400000) throw fail("Load a fresh query before checking recipients.");
        if (Date.now() < Date.parse(job.nextCheckAt || "")) return save(actor, state, config, job, db);
        // Only selected gift actions are read, once per action per saved preview.
        const pending = [...new Set(job.preview.rows.filter(row => !row.constituentId).map(row => row.actionId))];
        const deadline = Date.now() + 15000;
        for (const actionId of pending.slice(0, 25)) {
          if (Date.now() >= deadline) break;
          const action = await (deps.action || getBlackbaudAction)({ ...contextFor(actor, origin), actionId, timeoutMs: 5000 });
          if (String(action?.id) !== actionId || !receiptId(action?.constituent_id) || action.completed !== true)
            throw fail(`Action ${actionId} does not confirm a completed constituent action. Review it in NXT before continuing.`);
          for (const row of job.preview.rows) if (row.actionId === actionId) row.constituentId = action.constituent_id;
        }
        if (job.preview.rows.every(row => receiptId(row.constituentId))) {
          job.preview.rows = classifyHistoryRows(job.preview.rows, await historyMatches(actor, job.preview.rows, db));
          job.stage = "preview";
        }
        job.nextCheckAt = new Date(Date.now() + 1000).toISOString();
      } else if (command.operation === "commit" && job.stage === "preview" && command.confirmed === true) {
        if (job.error) throw fail("Resolve the import issue and create a fresh preview before importing.");
        if (!Number.isFinite(Date.parse(job.loadedAt)) || Date.now() - Date.parse(job.loadedAt) > 24 * 60 * 60 * 1000) throw fail("Load a fresh query before importing this history.");
        if (connectionKey(await (deps.connection || getBlackbaudConnection)(actor.id), actor) !== fingerprint)
          throw fail("The NXT connection changed. Load a fresh query before importing.");
        const committed = await commitHistoryImport(actor, state, db);
        if (!committed) throw fail("A catalog item or source record changed. Review the mappings again before importing.");
        return committed;
      } else throw fail("Reload the saved import before continuing.");
    }
    if (connectionKey(await (deps.connection || getBlackbaudConnection)(actor.id), actor) !== fingerprint) {
      job = { stage: "error", actorId: String(actor.id) };
      throw fail("The NXT connection changed while reading this query. Load it again with the correct connection.");
    }
    delete job.error;
    return await save(actor, state, config, job, db);
  } catch (error) {
    const paused = error?.httpStatus === 429 || error?.quotaPaused;
    job = job || { stage: "error", actorId: String(actor.id) };
    job.error = error.historySafe ? error.message : paused ? "Blackbaud paused this read. Saved history is unchanged; check status after the pause." : "The NXT query could not be loaded completely. Check its fields and permissions, then load a fresh query. Saved history is unchanged.";
    if (paused && job.queryJobId) job.nextCheckAt = new Date(Date.now() + Math.max(15000, Number(error.retryAfterMs) || 60000)).toISOString();
    else if (!["loaded", "preview", "resolving"].includes(job.stage)) job.stage = "error";
    return save(actor, state, config, job, db);
  }
}
