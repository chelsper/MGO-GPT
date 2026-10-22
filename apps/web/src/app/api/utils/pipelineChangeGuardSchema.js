export default async function pipelineChangeGuardSchema(sql) {
  // Neon HTTP queries do not share a session. Keep the lock, catalog checks,
  // and any required DDL in one statement/transaction, not separate requests.
  await sql`
    DO $pipeline_guard_schema$
    DECLARE
      guard_body CONSTANT text := $pipeline_guard$
      BEGIN
        IF OLD.pipeline_change_id IS NOT NULL AND NEW.pipeline_change_id IS NOT DISTINCT FROM OLD.pipeline_change_id
          AND (to_jsonb(NEW) - 'nxt_retry_after') IS DISTINCT FROM (to_jsonb(OLD) - 'nxt_retry_after') THEN
          RAISE EXCEPTION 'Opportunity has a pending pipeline change; verify it before editing';
        END IF;
        RETURN NEW;
      END;
      $pipeline_guard$;
      guard_id oid;
    BEGIN
      PERFORM set_config('lock_timeout', '5s', true);
      PERFORM pg_advisory_xact_lock(734019, 8);
      guard_id := to_regprocedure('protect_pending_pipeline_change()');

      -- The stored body is the definition fingerprint. Current installations
      -- need no catalog writes, including installations made by older releases.
      IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
        WHERE p.oid = guard_id AND p.prosrc = guard_body
          AND p.prorettype = 'trigger'::regtype AND l.lanname = 'plpgsql'
      ) THEN
        EXECUTE format(
          'CREATE OR REPLACE FUNCTION protect_pending_pipeline_change() RETURNS trigger AS %L LANGUAGE plpgsql',
          guard_body
        );
        guard_id := to_regprocedure('protect_pending_pipeline_change()');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'protect_pending_pipeline_change'
          AND tgrelid = 'prospect_opportunities'::regclass
      ) THEN
        CREATE TRIGGER protect_pending_pipeline_change BEFORE UPDATE ON prospect_opportunities
          FOR EACH ROW EXECUTE FUNCTION protect_pending_pipeline_change();
      END IF;

      -- Do not silently accept a disabled or repurposed protection trigger.
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'protect_pending_pipeline_change'
          AND tgrelid = 'prospect_opportunities'::regclass
          AND tgfoid = guard_id AND tgtype = 19 AND tgenabled IN ('O', 'A')
          AND NOT tgisinternal AND tgqual IS NULL AND tgattr = ''::int2vector
      ) THEN
        RAISE EXCEPTION 'Pending opportunity protection trigger needs administrator review';
      END IF;
    END $pipeline_guard_schema$
  `;
}
