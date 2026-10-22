import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { blackbaudApiFetch, getBlackbaudConfig } from "./blackbaud";
import { calculateAnnualGivingSocieties, getEarliestAnnualStartDate } from "./annualGivingSocieties";
import { normalizeGivingSocietyConfigurations } from "./givingSocietyDefinitions";

export const SOCIETY_SOURCE_VERSION = 1;
export const SOCIETY_SOURCE_TTL_MS = 20 * 60 * 60 * 1000;
const MAX_PAGES = 200;
const CALL_BUDGET = 5;
const PAGE_SIZE = 500;
const LEASE_MS = 90_000;
const id = (value) => typeof value === "string" || typeof value === "number"
  ? String(value).trim() : "";
const validId = (value) => /^[1-9]\d*$/.test(id(value));
const dateOnly = (value) => value.toISOString().slice(0, 10);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let schemaReady;

export async function ensureSocietyGivingSchema(db = sql) {
  if (db === sql && schemaReady) return schemaReady;
  const ready = db`DO $society_source$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('society-giving-source-v1'));
    CREATE TABLE IF NOT EXISTS society_giving_sources (
      scope_key TEXT PRIMARY KEY, auth_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      active_generation TEXT, active_metadata JSONB,
      pending JSONB, lease_token TEXT, lease_until TIMESTAMPTZ,
      retry_after TIMESTAMPTZ, last_error TEXT,
      reconcile_cursor JSONB, reconciled_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS society_giving_source_pages (
      scope_key TEXT NOT NULL REFERENCES society_giving_sources(scope_key) ON DELETE CASCADE,
      generation TEXT NOT NULL, page_number INTEGER NOT NULL,
      gifts JSONB NOT NULL, PRIMARY KEY(scope_key, generation, page_number)
    );
  END $society_source$`;
  if (db === sql) {
    schemaReady = Promise.resolve(ready).catch((error) => { schemaReady = undefined; throw error; });
    return schemaReady;
  }
  return ready;
}

export async function societySourceScope({ authUserId, origin, db = sql }) {
  // Cron requests use a deployment hostname, unlike browser requests. Bind the
  // cache to the configured application origin, not that changing hostname.
  // This changes cache identity only, never the OAuth/token request settings.
  if (process.env.VERCEL_ENV === "preview") throw new Error("Society source unavailable in preview");
  let sourceOrigin = origin;
  if (process.env.AUTH_URL) {
    const url = new URL(process.env.AUTH_URL);
    const local = process.env.VERCEL_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) {
      throw new Error("Invalid society source application origin");
    }
    sourceOrigin = url.origin;
  } else if (process.env.VERCEL_ENV === "production" && !process.env.BLACKBAUD_REDIRECT_URI) {
    throw new Error("Society source requires a stable application origin");
  }
  const rows = await db`SELECT id, connected_at FROM blackbaud_connections WHERE user_id = ${authUserId}`;
  if (!rows[0]) throw new Error("No connected society refresh account");
  const config = getBlackbaudConfig(sourceOrigin);
  return hash([SOCIETY_SOURCE_VERSION, authUserId, rows[0].id, rows[0].connected_at,
    config.clientId, config.redirectUri, hash(config.subscriptionKey)]);
}

export function validateSocietyNextLink(value, kind) {
  if (value == null || value === "") return null;
  const url = new URL(value, "https://api.sky.blackbaud.com");
  const path = kind === "funds" ? "/fundraising/v1/funds" : "/gift/v1/gifts";
  if (url.origin !== "https://api.sky.blackbaud.com" || url.pathname !== path ||
      url.username || url.password || url.hash) throw new Error("Invalid society source continuation");
  return url.href;
}

export function readSocietySourcePage(payload, kind, funds = {}) {
  if (!payload || !Array.isArray(payload.value) || payload.value.length > PAGE_SIZE) {
    throw new Error("Incomplete society source response");
  }
  const records = payload.value;
  if (records.some((row) => !validId(row?.id))) throw new Error("Invalid society source record ID");
  if (kind === "funds") {
    for (const row of records) {
      if (typeof row.description !== "string" || !row.description.trim()) throw new Error("Fund description unavailable");
      funds[id(row.id)] = row.description.trim();
    }
    return { funds, next: validateSocietyNextLink(payload.next_link, kind), count: records.length };
  }
  const gifts = records.map((row) => {
    if (!validId(row.constituent_id) || typeof row.type !== "string" ||
        typeof row.date !== "string" || !Number.isFinite(Date.parse(row.date)) ||
        typeof row.amount?.value !== "number" || !Number.isFinite(row.amount.value) ||
        (row.soft_credits != null && !Array.isArray(row.soft_credits)) ||
        (row.gift_splits != null && !Array.isArray(row.gift_splits))) {
      throw new Error("Incomplete society gift details");
    }
    const softCredits = (row.soft_credits || []).map((credit) => {
      if (!validId(credit.constituent_id) || typeof credit.amount?.value !== "number" ||
          !Number.isFinite(credit.amount.value) || credit.amount.value < 0 ||
          (credit.gift_id && id(credit.gift_id) !== id(row.id))) throw new Error("Invalid society recognition credit");
      return { id: id(credit.id), constituent_id: id(credit.constituent_id), amount: credit.amount };
    });
    const splits = (row.gift_splits || []).map((split) => {
      if (!validId(split.fund_id) || !funds[id(split.fund_id)]) throw new Error("Society gift fund is not verified");
      return { fund_id: id(split.fund_id), fund: { description: funds[id(split.fund_id)] } };
    });
    // Do not persist names, addresses, card data, notes or other unneeded Gift fields.
    return { id: id(row.id), constituent_id: id(row.constituent_id), type: row.type,
      date: row.date, amount: row.amount, soft_credits: softCredits, gift_splits: splits };
  });
  return { gifts, next: validateSocietyNextLink(payload.next_link, kind), count: records.length };
}

export function giftBelongsTo(gift, constituentId) {
  return id(gift.constituent_id) === id(constituentId) ||
    gift.soft_credits.some((credit) => id(credit.constituent_id) === id(constituentId));
}

export async function loadSocietyAnnualGifts({ authUserId, origin, constituentId, startDate, endDate, db = sql }) {
  await ensureSocietyGivingSchema(db);
  const scopeKey = await societySourceScope({ authUserId, origin, db });
  // The generation pointer and its rows must be read in one MVCC statement.
  // Otherwise a publication/cleanup between two reads could look like no gifts.
  const rows = await db`SELECT s.active_metadata, COALESCE((
      SELECT jsonb_agg(gift.value) FROM society_giving_source_pages AS p
      CROSS JOIN LATERAL jsonb_array_elements(p.gifts) AS gift
      WHERE p.scope_key = s.scope_key AND p.generation = s.active_generation
        AND (gift.value->>'constituent_id' = ${String(constituentId)}
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(gift.value->'soft_credits') AS c
            WHERE c->>'constituent_id' = ${String(constituentId)}))
    ), '[]'::jsonb) AS gifts FROM society_giving_sources AS s WHERE s.scope_key = ${scopeKey}`;
  const source = rows[0]?.active_metadata;
  if (!source || source.version !== SOCIETY_SOURCE_VERSION || source.startDate > startDate ||
      source.endDate < startDate || source.endDate > endDate ||
      Date.now() - Date.parse(source.checkedAt) > 36 * 60 * 60 * 1000 ||
      !Number.isFinite(Date.parse(source.checkedAt))) {
    throw new Error("Society recognition refresh is pending; saved societies are retained");
  }
  return { gifts: rows[0].gifts, source };
}

// Refresh only the annual portion; lifetime and planned-gift history still use
// their existing verified sources. This never changes the letter ledger.
export function replaceAnnualSocieties(previous, annual) {
  const lifetimeSocieties = previous.lifetimeSocieties || [];
  return { ...annual,
    primaryLifetimeSociety: previous.primaryLifetimeSociety || null,
    lifetimeSocieties,
    allQualifiedLifetimeSocieties: previous.allQualifiedLifetimeSocieties || [],
    lifetimeGiving: previous.lifetimeGiving,
    societies: [...annual.annualSocieties, ...lifetimeSocieties].sort((a, b) =>
      a.hierarchy - b.hierarchy || (a.basis === b.basis ? 0 : a.basis === "annual" ? -1 : 1)),
  };
}

async function reconcileSavedSocieties({ db, scopeKey, source, generation, definitions, token, cursor }) {
  // Annual planned-gift presence needs additional authoritative realization
  // checks; leave that uncommon configuration to the regular summary refresh.
  if (definitions.some((d) => d.active !== false && d.basis === "annual" && d.countSources.includes("planned_gift"))) {
    await db`UPDATE society_giving_sources SET reconciled_at = NOW() WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
    return 0;
  }
  const targets = await db`SELECT workspace_user_id, constituent_id FROM (
      SELECT workspace_user_id, constituent_id FROM portfolio_giving_snapshots
      UNION SELECT workspace_user_id, constituent_id FROM portfolio_constituent_snapshots
    ) AS p WHERE (workspace_user_id, constituent_id) > (${cursor?.[0] || 0}::bigint, ${cursor?.[1] || ""}::text)
    ORDER BY workspace_user_id, constituent_id LIMIT 100`;
  if (!targets.length) {
    await db`UPDATE society_giving_sources SET reconciled_at = NOW() WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
    return 0;
  }
  const pages = await db`SELECT gifts FROM society_giving_source_pages WHERE scope_key = ${scopeKey} AND generation = ${generation}`;
  const giftsByRecipient = new Map();
  for (const gift of pages.flatMap((p) => p.gifts)) {
    for (const recipient of new Set([gift.constituent_id, ...gift.soft_credits.map((c) => c.constituent_id)])) {
      if (!giftsByRecipient.has(recipient)) giftsByRecipient.set(recipient, []);
      giftsByRecipient.get(recipient).push(gift);
    }
  }
  const now = new Date(source.checkedAt);
  const values = targets.map((t) => ({ ...t, annual: {
    ...calculateAnnualGivingSocieties({ constituentId: t.constituent_id,
      gifts: giftsByRecipient.get(t.constituent_id) || [], societyDefinitions: definitions, now }),
    recognitionSource: source,
  } }));
  // Read/compare/write only the society subtree so a concurrent contact, gift,
  // opportunity, or full-summary refresh is not overwritten by reconciliation.
  for (const [table, column] of [["portfolio_giving_snapshots", "payload"], ["portfolio_constituent_snapshots", "summary_payload"]]) {
    const rows = await db(`SELECT p.workspace_user_id, p.constituent_id,
      p.${column}->'mapped'->'annualGivingSocieties' AS previous
      FROM ${table} AS p JOIN jsonb_to_recordset($1::jsonb) AS v(workspace_user_id bigint, constituent_id text)
      USING (workspace_user_id, constituent_id)`, [JSON.stringify(values)]);
    const updates = rows.filter((r) => r.previous &&
      (!r.previous.recognitionSource || Date.parse(r.previous.recognitionSource.checkedAt) < Date.parse(source.checkedAt) ||
        (Date.parse(r.previous.recognitionSource.checkedAt) === Date.parse(source.checkedAt) &&
          r.previous.recognitionSource.configurationSignature !== source.configurationSignature)))
      .map((r) => ({ ...r, replacement: replaceAnnualSocieties(r.previous,
        values.find((v) => String(v.workspace_user_id) === String(r.workspace_user_id) && v.constituent_id === r.constituent_id).annual) }));
    if (updates.length) await db(`UPDATE ${table} AS p SET ${column} =
      jsonb_set(p.${column}, '{mapped,annualGivingSocieties}', v.replacement)
      FROM jsonb_to_recordset($1::jsonb) AS v(workspace_user_id bigint, constituent_id text, previous jsonb, replacement jsonb)
      WHERE p.workspace_user_id = v.workspace_user_id AND p.constituent_id = v.constituent_id
        AND p.${column}->'mapped'->'annualGivingSocieties' = v.previous
        AND EXISTS (SELECT 1 FROM society_giving_sources WHERE scope_key = $2 AND lease_token = $3
          AND active_generation = $4)`, [JSON.stringify(updates), scopeKey, token, generation]);
  }
  const last = targets.at(-1);
  await db`UPDATE society_giving_sources SET reconcile_cursor = ${JSON.stringify([last.workspace_user_id, last.constituent_id])}::jsonb
    WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
  return targets.length;
}

export async function advanceSocietyGivingSource({ authUserId, origin, societyDefinitions, db = sql, apiFetch = blackbaudApiFetch, now = new Date() }) {
  await ensureSocietyGivingSchema(db);
  const definitions = normalizeGivingSocietyConfigurations(societyDefinitions);
  const startDate = getEarliestAnnualStartDate(definitions, now);
  const scopeKey = await societySourceScope({ authUserId, origin, db });
  await db`INSERT INTO society_giving_sources(scope_key, auth_user_id) VALUES (${scopeKey}, ${authUserId}) ON CONFLICT DO NOTHING`;
  const token = randomUUID();
  const claimed = await db`UPDATE society_giving_sources SET lease_token = ${token},
      lease_until = ${new Date(now.getTime() + LEASE_MS).toISOString()}, updated_at = NOW()
    WHERE scope_key = ${scopeKey} AND (lease_until IS NULL OR lease_until <= NOW())
      AND (retry_after IS NULL OR retry_after <= NOW()) RETURNING *`;
  if (!claimed[0]) return { status: "waiting" };
  const state = claimed[0];
  let pending = state.pending;
  let calls = 0;
  try {
    if (state.active_metadata?.startDate === startDate &&
        state.active_metadata.configurationSignature !== hash(definitions)) {
      state.active_metadata.configurationSignature = hash(definitions);
      state.reconcile_cursor = null;
      state.reconciled_at = null;
      await db`UPDATE society_giving_sources SET active_metadata = ${JSON.stringify(state.active_metadata)}::jsonb,
        reconcile_cursor = NULL, reconciled_at = NULL WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
    }
    if (!pending && state.active_metadata?.startDate === startDate &&
        (!state.reconciled_at || now.getTime() - Date.parse(state.active_metadata.checkedAt) < SOCIETY_SOURCE_TTL_MS)) {
      const reconciled = state.reconciled_at ? 0 : await reconcileSavedSocieties({ db, scopeKey,
        source: state.active_metadata, generation: state.active_generation, definitions, token, cursor: state.reconcile_cursor });
      return { status: reconciled ? "reconciling" : "current", reconciled };
    }
    if (!pending || pending.startDate !== startDate || now.getTime() - Date.parse(pending.startedAt) > 36 * 60 * 60 * 1000) {
      pending = { generation: randomUUID(), startDate, endDate: dateOnly(now), startedAt: now.toISOString(),
        kind: "funds", funds: {}, next: "/fundraising/v1/funds?limit=500&include_inactive=true", page: 0, rows: 0, fundRows: 0, visited: [] };
    }
    while (calls < CALL_BUDGET) {
      if (pending.page >= MAX_PAGES) throw new Error("Society source exceeded its safe page limit");
      const path = validateSocietyNextLink(pending.next, pending.kind);
      if (!path || pending.visited.includes(hash(path))) throw new Error("Society source repeated a page");
      calls += 1;
      const payload = await apiFetch(path, { userId: authUserId, authUserId, origin, timeoutMs: 12_000, maxRetries: 0 });
      const owned = await db`SELECT scope_key FROM society_giving_sources
        WHERE scope_key = ${scopeKey} AND lease_token = ${token} AND lease_until > NOW()`;
      if (!owned.length) return { status: "superseded", calls };
      const page = readSocietySourcePage(payload, pending.kind, pending.funds);
      if (page.next && !page.count) throw new Error("Society source returned an empty continuing page");
      if (pending.kind === "funds") {
        pending.fundRows += page.count;
        if (payload.count != null && (!Number.isInteger(payload.count) || payload.count < 0 ||
            (!page.next && pending.fundRows !== payload.count))) throw new Error("Society fund pages are incomplete");
      }
      if (pending.kind === "gifts") {
        // Counts are the total filtered result count, when supplied by NXT.
        if (payload.count != null) {
          if (!Number.isInteger(payload.count) || payload.count < 0 ||
              (pending.expectedCount != null && pending.expectedCount !== payload.count)) throw new Error("Society source changed during refresh");
          pending.expectedCount = payload.count;
        }
        pending.rows += page.count;
        if (!page.next && pending.expectedCount != null && pending.rows !== pending.expectedCount) throw new Error("Society gift pages are incomplete");
        await db`INSERT INTO society_giving_source_pages(scope_key, generation, page_number, gifts)
          SELECT ${scopeKey}, ${pending.generation}, ${pending.page}, ${JSON.stringify(page.gifts)}::jsonb
          WHERE EXISTS (SELECT 1 FROM society_giving_sources WHERE scope_key = ${scopeKey} AND lease_token = ${token})
          ON CONFLICT(scope_key, generation, page_number) DO UPDATE SET gifts = EXCLUDED.gifts`;
      }
      pending.visited.push(hash(path));
      pending.page += 1;
      if (!page.next && pending.kind === "funds") {
        pending.kind = "gifts";
        pending.next = `/gift/v1/gifts?limit=500&start_gift_date=${pending.startDate}&end_gift_date=${pending.endDate}`;
      } else pending.next = page.next;
      if (!pending.next) {
        const counts = await db`SELECT COUNT(*)::int AS row_count, COUNT(DISTINCT gift->>'id')::int AS unique_count
          FROM society_giving_source_pages AS p CROSS JOIN LATERAL jsonb_array_elements(p.gifts) AS gift
          WHERE p.scope_key = ${scopeKey} AND p.generation = ${pending.generation}`;
        if (Number(counts[0]?.row_count) !== pending.rows || Number(counts[0]?.unique_count) !== pending.rows) {
          throw new Error("Society gift pages overlap or are incomplete");
        }
        const metadata = { version: SOCIETY_SOURCE_VERSION, startDate: pending.startDate,
          endDate: pending.endDate, checkedAt: pending.startedAt, giftCount: pending.rows,
          configurationSignature: hash(definitions) };
        await db`UPDATE society_giving_sources SET active_generation = ${pending.generation},
          active_metadata = ${JSON.stringify(metadata)}::jsonb, pending = NULL,
          reconcile_cursor = NULL, reconciled_at = NULL, last_error = NULL, retry_after = NULL
          WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
        await db`DELETE FROM society_giving_source_pages WHERE scope_key = ${scopeKey}
          AND generation <> ${pending.generation}
          AND EXISTS (SELECT 1 FROM society_giving_sources WHERE scope_key = ${scopeKey} AND lease_token = ${token})`;
        return { status: "published", calls, giftCount: pending.rows };
      }
      await db`UPDATE society_giving_sources SET pending = ${JSON.stringify(pending)}::jsonb, last_error = NULL, retry_after = NULL
        WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
    }
    return { status: "processing", calls };
  } catch (error) {
    const retryMs = Math.max(60_000, Number(error?.retryAfterMs) || 15 * 60 * 1000);
    const quota = error?.quotaPaused || Number(error?.httpStatus) === 429 || error?.name === "BlackbaudQuotaExceededError";
    // Preserve checkpoint for transient failures. Invalid/changing source data
    // restarts later rather than publishing a mixture of incompatible pages.
    const keepCheckpoint = quota || /timeout|timed out|fetch failed|network/i.test(String(error?.message));
    const safeReason = /^(Society|Incomplete society|Invalid society|Fund description)/.test(String(error?.message))
      ? error.message : "Society source incomplete";
    await db`UPDATE society_giving_sources SET pending = ${keepCheckpoint && pending ? JSON.stringify(pending) : null}::jsonb,
      retry_after = ${new Date(now.getTime() + retryMs).toISOString()},
      last_error = ${quota ? "Blackbaud cooldown; saved societies retained" : `${safeReason}; saved societies retained`}
      WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
    return { status: "paused", calls, quotaPaused: Boolean(quota) };
  } finally {
    await db`UPDATE society_giving_sources SET lease_token = NULL, lease_until = NULL, updated_at = NOW()
      WHERE scope_key = ${scopeKey} AND lease_token = ${token}`;
  }
}
