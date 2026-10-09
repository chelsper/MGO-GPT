import { randomUUID } from "node:crypto";
import sql from "./sql";
import { letterError } from "@/utils/societyLetters";
import { canReturnLetterToReview } from "@/utils/societyLetterRecovery";

let ready;
export function ensureSocietyLetterSchema() {
  ready ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS stewardship_letters (
      id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL DEFAULT 0,
      settings JSONB, templates JSONB NOT NULL DEFAULT '{}'::jsonb,
      snapshot JSONB, job JSONB, lease_token TEXT, lease_until TIMESTAMPTZ,
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS stewardship_letter_deliveries (
      id UUID PRIMARY KEY, batch_id UUID NOT NULL, household_id TEXT NOT NULL,
      period_key TEXT NOT NULL, society_key TEXT NOT NULL, status TEXT NOT NULL,
      payload JSONB NOT NULL, provider_id TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS stewardship_letter_no_duplicate
      ON stewardship_letter_deliveries(household_id, period_key, society_key) WHERE status <> 'cancelled'`;
    await sql`ALTER TABLE stewardship_letters ADD COLUMN IF NOT EXISTS exclusions JSONB NOT NULL DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE stewardship_letters ADD COLUMN IF NOT EXISTS recipient_reviews JSONB NOT NULL DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE stewardship_letters ADD COLUMN IF NOT EXISTS readiness JSONB NOT NULL DEFAULT '{}'::jsonb`;
    await sql`CREATE TABLE IF NOT EXISTS stewardship_letter_postal_batches (
      id UUID PRIMARY KEY, status TEXT NOT NULL, payload JSONB NOT NULL,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS stewardship_letter_one_postal_draft
      ON stewardship_letter_postal_batches ((true)) WHERE status = 'draft'`;
    await sql`CREATE TABLE IF NOT EXISTS stewardship_letter_postal_documents (
      id UUID PRIMARY KEY, batch_id UUID NOT NULL REFERENCES stewardship_letter_postal_batches(id),
      household_id TEXT NOT NULL, sha256 TEXT NOT NULL, content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`INSERT INTO stewardship_letters(id) VALUES(1) ON CONFLICT DO NOTHING`;
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function readSocietyLetterState() {
  const [state] =
    await sql`SELECT revision, settings, templates, snapshot, job, exclusions, recipient_reviews, readiness FROM stewardship_letters WHERE id = 1`;
  const deliveries =
    await sql`SELECT payload, status, provider_id, updated_at, updated_by FROM stewardship_letter_deliveries ORDER BY created_at DESC, id`;
  const drafts =
    await sql`SELECT payload FROM stewardship_letter_postal_batches WHERE status = 'draft' ORDER BY created_at`;
  return {
    ...state,
    postalDraft: drafts[0]?.payload || null,
    history: deliveries.map((row) => ({
      ...row.payload,
      status: row.status,
      providerId: row.provider_id,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    })),
  };
}

export async function readPostalDocument(id) {
  const [row] =
    await sql`SELECT content, sha256 FROM stewardship_letter_postal_documents WHERE id = ${id}::uuid`;
  return row || null;
}

export async function acquireSocietyLetters(userId, revision) {
  const token = randomUUID();
  const [row] =
    await sql`UPDATE stewardship_letters SET lease_token = ${token}, lease_until = NOW() + INTERVAL '120 seconds'
    WHERE id = 1 AND revision = ${revision} AND (lease_until IS NULL OR lease_until < NOW()) RETURNING id`;
  if (!row)
    throw letterError(
      "This workspace changed or another batch is running. Reload saved results before continuing.",
      409,
    );
  return {
    async createPostalDraft(draft) {
      const rows = await sql`WITH lock AS (
        UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
      ) INSERT INTO stewardship_letter_postal_batches(id, status, payload, created_by, updated_by)
        SELECT ${draft.id}::uuid, 'draft', ${JSON.stringify(draft)}::jsonb, ${userId}, ${userId} FROM lock RETURNING id`;
      if (!rows.length)
        throw letterError(
          "The draft was not saved. Reload the workspace.",
          409,
        );
    },
    async savePostalDraft(draft, document = null) {
      const rows = await sql`WITH lock AS (
        UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
      ), changed AS (
        UPDATE stewardship_letter_postal_batches SET payload = ${JSON.stringify(draft)}::jsonb,
          status = ${draft.status}, updated_by = ${userId}, updated_at = NOW()
        WHERE id = ${draft.id}::uuid AND status = 'draft' AND EXISTS(SELECT 1 FROM lock) RETURNING id
      ), document AS (
        INSERT INTO stewardship_letter_postal_documents(id, batch_id, household_id, sha256, content)
        SELECT ${document?.id || null}::uuid, id, ${document?.householdId || null},
          ${document?.sha256 || null}, ${document?.content || null} FROM changed WHERE ${!!document}
        RETURNING id
      ) SELECT id FROM changed`;
      if (!rows.length)
        throw letterError("The draft changed. Reload before continuing.", 409);
    },
    async approvePostalDraft(draft, items) {
      // Freeze the whole approval and reserve every letter in one transaction.
      const rows = await sql`WITH lock AS (
        UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
      ), approved AS (
        UPDATE stewardship_letter_postal_batches SET status = 'approved', payload = ${JSON.stringify(draft)}::jsonb,
          updated_by = ${userId}, updated_at = NOW()
        WHERE id = ${draft.id}::uuid AND status = 'draft' AND EXISTS(SELECT 1 FROM lock) RETURNING id
      ) INSERT INTO stewardship_letter_deliveries(id, batch_id, household_id, period_key, society_key, status, payload, created_by, updated_by)
        SELECT (item->>'id')::uuid, (item->>'batchId')::uuid, item->>'householdId', item#>>'{period,key}',
          item->>'societyKey', item->>'status', item, ${userId}, ${userId}
        FROM jsonb_array_elements(${JSON.stringify(items)}::jsonb) item CROSS JOIN approved RETURNING id`;
      if (rows.length !== items.length)
        throw letterError(
          "The batch could not be approved. Reload saved history before trying again.",
          409,
        );
    },
    async save(state) {
      const rows =
        await sql`UPDATE stewardship_letters SET settings = ${JSON.stringify(state.settings)}::jsonb,
        templates = ${JSON.stringify(state.templates)}::jsonb, snapshot = ${JSON.stringify(state.snapshot)}::jsonb,
        job = ${JSON.stringify(state.job)}::jsonb, exclusions = ${JSON.stringify(state.exclusions || [])}::jsonb,
        recipient_reviews = ${JSON.stringify(state.recipient_reviews || {})}::jsonb,
        readiness = ${JSON.stringify(state.readiness || {})}::jsonb,
        revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING revision`;
      if (!rows.length)
        throw letterError(
          "The operation timed out. Reload saved results; do not repeat a delivery.",
          409,
        );
      state.revision = rows[0].revision;
    },
    async reserve(items) {
      const rows = await sql`WITH lock AS (
          UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
          WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
        ) INSERT INTO stewardship_letter_deliveries(id, batch_id, household_id, period_key, society_key, status, payload, created_by, updated_by)
        SELECT (item->>'id')::uuid, (item->>'batchId')::uuid, item->>'householdId', item#>>'{period,key}',
          item->>'societyKey', item->>'status', item, ${userId}, ${userId}
        FROM jsonb_array_elements(${JSON.stringify(items)}::jsonb) item CROSS JOIN lock RETURNING id`;
      if (rows.length !== items.length)
        throw letterError(
          "Letters could not be reserved. Reload before continuing.",
          409,
        );
    },
    async transition(
      item,
      fromStatus,
      toStatus,
      providerId = item.providerId || null,
    ) {
      const rows = await sql`WITH lock AS (
        UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
      ) UPDATE stewardship_letter_deliveries SET status = ${toStatus}, provider_id = ${providerId},
        updated_by = ${userId}, updated_at = NOW()
        WHERE id = ${item.id}::uuid AND status = ${fromStatus} AND EXISTS(SELECT 1 FROM lock) RETURNING id`;
      if (!rows.length)
        throw letterError(
          "Delivery status changed. Reload; this letter will not be resent automatically.",
          409,
        );
      item.status = toStatus;
      item.providerId = providerId;
    },
    async saveLetterAppeals(item) {
      const rows = await sql`WITH lock AS (
        UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
      ) UPDATE stewardship_letter_deliveries
        SET payload = jsonb_set(payload, '{letterAppeals}', ${JSON.stringify(item.letterAppeals)}::jsonb),
          updated_by = ${userId}, updated_at = NOW()
        WHERE id = ${item.id}::uuid AND status = 'prepared' AND payload ? 'letterAppeals'
          AND EXISTS(SELECT 1 FROM lock) RETURNING id`;
      if (!rows.length)
        throw letterError(
          "The letter update could not be saved. Reload history and verify NXT status; do not create another letter.",
          409,
        );
    },
    async returnLetterToReview(item) {
      if (!canReturnLetterToReview(item))
        throw letterError(
          "Only an approved letter with no attempted NXT updates can return to review.",
          409,
        );
      const audit = {
        at: new Date().toISOString(),
        by: userId,
        reason: "no_nxt_submission_attempted",
      };
      const rows = await sql`WITH lock AS (
        UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
      ) UPDATE stewardship_letter_deliveries
        SET status = 'cancelled', payload = jsonb_set(payload, '{returnToReview}', ${JSON.stringify(audit)}::jsonb),
          updated_by = ${userId}, updated_at = NOW()
        WHERE id = ${item.id}::uuid AND batch_id = ${item.batchId}::uuid
          AND status = 'prepared' AND provider_id IS NULL AND payload->>'channel' = 'post'
          AND payload->'letterAppeals' = ${JSON.stringify(item.letterAppeals)}::jsonb
          AND payload->'members' = ${JSON.stringify(item.members)}::jsonb
          AND payload->'postalApproval' = ${JSON.stringify(item.postalApproval)}::jsonb
          AND payload->'postalDocument' = ${JSON.stringify(item.postalDocument)}::jsonb
          AND EXISTS(SELECT 1 FROM lock) RETURNING id`;
      if (rows.length !== 1)
        throw letterError(
          "The letter changed. Reload history before returning it to review; no reservation was released.",
          409,
        );
    },
    async finishBatch(batchId, status) {
      const rows = await sql`WITH lock AS (
        UPDATE stewardship_letters SET revision = revision + 1, updated_by = ${userId}, updated_at = NOW()
        WHERE id = 1 AND lease_token = ${token} AND lease_until > NOW() RETURNING id
      ) UPDATE stewardship_letter_deliveries SET status = ${status}, updated_by = ${userId}, updated_at = NOW()
        WHERE batch_id = ${batchId}::uuid AND status IN ('prepared', 'pending_email')
          AND (NOT (payload ? 'letterAppeals') OR
            (${status === "mailed"} AND payload#>>'{letterAppeals,status}' = 'complete'))
          AND (${status === "cancelled"} OR payload->>'channel' = 'post') AND EXISTS(SELECT 1 FROM lock) RETURNING id`;
      if (!rows.length)
        throw letterError(
          "No unsent letters were changed. Reload the batch history.",
          409,
        );
    },
    async release() {
      await sql`UPDATE stewardship_letters SET lease_token = NULL, lease_until = NULL WHERE id = 1 AND lease_token = ${token}`;
    },
  };
}
