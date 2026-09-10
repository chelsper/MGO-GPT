import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { isPledgeQueryJob } from "./pledgeQuerySource";
import { OPEN_PLEDGE_QUERY_ID } from "@/utils/pledgePayments";

export const pledgeScope = (userId, origin) => createHash("sha256").update(`pledges:v1:${userId}:${origin}`).digest("hex");
function assertSaved(rows) {
  if (!rows.length) throw new Error("Pledge refresh lease expired. Resume to continue.");
}
const itemFromRow = (row) => ({ pledgeId: row.pledge_id, runId: row.run_id, status: row.status,
  stage: row.stage, draft: row.draft, payload: row.payload, error: row.error });

export async function readPledgeCache(scope) {
  const [row] = await sql`SELECT job FROM pledge_payment_jobs WHERE scope_key = ${scope}`;
  const job = row?.job || null;
  const items = job ? await sql`
    SELECT pledge_id, run_id, status, stage, payload, error FROM pledge_payment_items
    WHERE scope_key = ${scope} AND (${!job.discoveryComplete} OR run_id = ${job.id})
    ORDER BY pledge_id
  ` : [];
  const current = items.filter((item) => item.run_id === job?.id);
  const counts = { total: current.length, success: current.filter((i) => i.status === "success").length,
    failed: current.filter((i) => i.status === "failed").length };
  return { source: { queryId: OPEN_PLEDGE_QUERY_ID }, requiresQueryRefresh: Boolean(job && !isPledgeQueryJob(job)),
    job: job ? { id: job.id, status: job.status, discoveryComplete: job.discoveryComplete,
    queryStage: job.queryStage, queryRowCount: job.queryRowCount, nextPollAt: job.nextPollAt,
    startedAt: job.startedAt, completedAt: job.completedAt, resumeAfter: job.resumeAfter, error: job.error, ...counts } : null,
    records: items.filter((item) => item.payload).map((item) => ({ ...item.payload,
      stale: !isPledgeQueryJob(job) || item.run_id !== job.id || item.status !== "success" })),
    issues: current.filter((item) => item.status === "failed").map((item) => ({ pledgeId: item.pledge_id,
      stage: item.stage, ...item.error, hasCachedData: Boolean(item.payload) })) };
}

export async function acquirePledgeStore(scope, userId) {
  await sql`INSERT INTO pledge_payment_jobs (scope_key, user_id) VALUES (${scope}, ${userId}) ON CONFLICT DO NOTHING`;
  const token = randomUUID();
  const [row] = await sql`
    UPDATE pledge_payment_jobs SET lease_token = ${token}, lease_until = NOW() + INTERVAL '180 seconds'
    WHERE scope_key = ${scope} AND (lease_until IS NULL OR lease_until < NOW()) RETURNING job
  `;
  if (!row) return null;
  const store = {
    job: row.job,
    async saveJob(job) {
      assertSaved(await sql`UPDATE pledge_payment_jobs SET job = ${JSON.stringify(job)}::jsonb, updated_at = NOW(),
        lease_until = NOW() + INTERVAL '180 seconds'
        WHERE scope_key = ${scope} AND lease_token = ${token} AND lease_until > NOW() RETURNING scope_key`);
    },
    async discover(runId, ids) {
      if (!ids.length) return;
      const rows = await sql`
        INSERT INTO pledge_payment_items (scope_key, pledge_id, run_id)
        SELECT ${scope}, id, ${runId} FROM unnest(${ids}::text[]) AS id
        WHERE EXISTS (SELECT 1 FROM pledge_payment_jobs WHERE scope_key = ${scope} AND lease_token = ${token} AND lease_until > NOW())
        ON CONFLICT (scope_key, pledge_id) DO UPDATE SET
          run_id = EXCLUDED.run_id,
          status = CASE WHEN pledge_payment_items.run_id = EXCLUDED.run_id THEN pledge_payment_items.status ELSE 'pending' END,
          stage = CASE WHEN pledge_payment_items.run_id = EXCLUDED.run_id THEN pledge_payment_items.stage ELSE 'gift' END,
          draft = CASE WHEN pledge_payment_items.run_id = EXCLUDED.run_id THEN pledge_payment_items.draft ELSE '{}'::jsonb END,
          error = CASE WHEN pledge_payment_items.run_id = EXCLUDED.run_id THEN pledge_payment_items.error ELSE NULL END,
          updated_at = NOW()
        RETURNING pledge_id
      `;
      assertSaved(rows);
    },
    async nextItem(runId) {
      const [item] = await sql`SELECT * FROM pledge_payment_items
        WHERE scope_key = ${scope} AND run_id = ${runId} AND status = 'pending' ORDER BY pledge_id LIMIT 1`;
      return item ? itemFromRow(item) : null;
    },
    async saveItem(item) {
      assertSaved(await sql`
        UPDATE pledge_payment_items SET status = ${item.status}, stage = ${item.stage}, draft = ${JSON.stringify(item.draft)}::jsonb,
          payload = ${JSON.stringify(item.payload ?? null)}::jsonb, error = ${JSON.stringify(item.error ?? null)}::jsonb, updated_at = NOW()
        WHERE scope_key = ${scope} AND pledge_id = ${item.pledgeId} AND run_id = ${item.runId}
          AND EXISTS (SELECT 1 FROM pledge_payment_jobs WHERE scope_key = ${scope} AND lease_token = ${token} AND lease_until > NOW())
        RETURNING pledge_id
      `);
    },
    async counts(runId) {
      const [counts] = await sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM pledge_payment_items WHERE scope_key = ${scope} AND run_id = ${runId}`;
      return counts;
    },
    async retryFailed(runId) {
      await sql`UPDATE pledge_payment_items SET status = 'pending', stage = 'gift', draft = '{}'::jsonb, error = NULL
        WHERE scope_key = ${scope} AND run_id = ${runId} AND status = 'failed'
          AND EXISTS (SELECT 1 FROM pledge_payment_jobs WHERE scope_key = ${scope} AND lease_token = ${token} AND lease_until > NOW())`;
    },
    async release() {
      await sql`UPDATE pledge_payment_jobs SET lease_token = NULL, lease_until = NULL WHERE scope_key = ${scope} AND lease_token = ${token}`;
    },
  };
  return store;
}
