// Independent snapshots retain assignment/outcome history if a pool row is removed.
export default async function prospectLifecycleSchema(db) {
  await db`DO $lifecycle_schema$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('prospect-lifecycle-v1'));
    CREATE TABLE IF NOT EXISTS prospect_lifecycle_assignments (
      id BIGINT PRIMARY KEY, pool_id BIGINT, constituent_id TEXT, constituent_name TEXT NOT NULL,
      fundraiser_id BIGINT, fundraiser_name TEXT NOT NULL, assigned_at TIMESTAMPTZ NOT NULL,
      field_date DATE, field_value TEXT, sync_state TEXT, nxt_field_id TEXT,
      synced_at TIMESTAMPTZ, ended_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS prospect_lifecycle_outcomes (
      id BIGSERIAL PRIMARY KEY, assignment_id BIGINT NOT NULL REFERENCES prospect_lifecycle_assignments(id),
      value TEXT NOT NULL, selected_at TIMESTAMPTZ NOT NULL, sync_state TEXT, nxt_field_id TEXT,
      synced_at TIMESTAMPTZ, historical_snapshot BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS prospect_lifecycle_outcome_assignment ON prospect_lifecycle_outcomes(assignment_id,id);

    CREATE OR REPLACE FUNCTION capture_prospect_lifecycle_assignment() RETURNS trigger AS $assignment$
    BEGIN
      INSERT INTO prospect_lifecycle_assignments
        (id,pool_id,constituent_id,constituent_name,fundraiser_id,fundraiser_name,assigned_at,field_date,field_value,sync_state,nxt_field_id,synced_at)
      VALUES (NEW.id,NEW.prospect_pool_id,NEW.blackbaud_constituent_id,NEW.constituent_name,
        NEW.assigned_to_user_id,NEW.assigned_to_name,NEW.assigned_at,NEW.desired_nxt_start_date,
        NEW.desired_nxt_custom_field_value,NEW.nxt_sync_status,NEW.nxt_sync_debug->>'customFieldId',NEW.nxt_synced_at)
      ON CONFLICT(id) DO UPDATE SET sync_state=EXCLUDED.sync_state,nxt_field_id=EXCLUDED.nxt_field_id,synced_at=EXCLUDED.synced_at;
      RETURN NEW;
    END $assignment$ LANGUAGE plpgsql;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='capture_prospect_lifecycle_assignment' AND tgrelid='prospect_pool_assignment_audits'::regclass) THEN
      CREATE TRIGGER capture_prospect_lifecycle_assignment AFTER INSERT OR UPDATE ON prospect_pool_assignment_audits
        FOR EACH ROW EXECUTE FUNCTION capture_prospect_lifecycle_assignment();
    END IF;
    INSERT INTO prospect_lifecycle_assignments
      (id,pool_id,constituent_id,constituent_name,fundraiser_id,fundraiser_name,assigned_at,field_date,field_value,sync_state,nxt_field_id,synced_at)
    SELECT id,prospect_pool_id,blackbaud_constituent_id,constituent_name,assigned_to_user_id,assigned_to_name,
      assigned_at,desired_nxt_start_date,desired_nxt_custom_field_value,nxt_sync_status,nxt_sync_debug->>'customFieldId',nxt_synced_at
    FROM prospect_pool_assignment_audits ON CONFLICT(id) DO NOTHING;

    CREATE OR REPLACE FUNCTION capture_prospect_lifecycle_outcome() RETURNS trigger AS $outcome$
    DECLARE latest_id BIGINT; latest_value TEXT;
    BEGIN
      IF TG_OP='DELETE' THEN
        UPDATE prospect_lifecycle_assignments SET ended_at=NOW() WHERE pool_id=OLD.id AND ended_at IS NULL;
        RETURN OLD;
      END IF;
      IF NULLIF(BTRIM(NEW.mgogpt_disposition_value),'') IS NULL THEN
        IF NULLIF(BTRIM(OLD.mgogpt_disposition_value),'') IS NOT NULL
          AND NEW.current_assignment_audit_id=OLD.current_assignment_audit_id
          AND EXISTS(SELECT 1 FROM prospect_lifecycle_assignments WHERE id=NEW.current_assignment_audit_id) THEN
          INSERT INTO prospect_lifecycle_outcomes(assignment_id,value,selected_at,sync_state)
          VALUES(NEW.current_assignment_audit_id,'Outcome cleared',NOW(),'app_only');
        END IF;
        RETURN NEW;
      END IF;
      IF NEW.mgogpt_disposition_updated_at IS NULL THEN RETURN NEW; END IF;
      IF NOT EXISTS(SELECT 1 FROM prospect_lifecycle_assignments a WHERE a.id=NEW.current_assignment_audit_id
        AND a.fundraiser_id=NEW.assigned_user_id AND a.constituent_id=NEW.blackbaud_constituent_id
        AND NEW.mgogpt_disposition_updated_at >= a.assigned_at) THEN RETURN NEW; END IF;
      SELECT id,value INTO latest_id,latest_value FROM prospect_lifecycle_outcomes
        WHERE assignment_id=NEW.current_assignment_audit_id ORDER BY id DESC LIMIT 1;
      IF latest_id IS NULL OR latest_value IS DISTINCT FROM NEW.mgogpt_disposition_value THEN
        INSERT INTO prospect_lifecycle_outcomes(assignment_id,value,selected_at,sync_state,nxt_field_id,synced_at)
        VALUES(NEW.current_assignment_audit_id,NEW.mgogpt_disposition_value,NEW.mgogpt_disposition_updated_at,
          NEW.mgogpt_disposition_sync_state,NEW.mgogpt_disposition_sync_debug->>'customFieldId',NEW.mgogpt_disposition_synced_at);
      ELSE
        UPDATE prospect_lifecycle_outcomes SET sync_state=NEW.mgogpt_disposition_sync_state,
          nxt_field_id=NEW.mgogpt_disposition_sync_debug->>'customFieldId',synced_at=NEW.mgogpt_disposition_synced_at WHERE id=latest_id;
      END IF;
      RETURN NEW;
    END $outcome$ LANGUAGE plpgsql;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='capture_prospect_lifecycle_outcome' AND tgrelid='prospect_pool'::regclass) THEN
      CREATE TRIGGER capture_prospect_lifecycle_outcome AFTER UPDATE OR DELETE ON prospect_pool
        FOR EACH ROW EXECUTE FUNCTION capture_prospect_lifecycle_outcome();
    END IF;
    INSERT INTO prospect_lifecycle_outcomes(assignment_id,value,selected_at,sync_state,nxt_field_id,synced_at,historical_snapshot)
    SELECT a.id,p.mgogpt_disposition_value,p.mgogpt_disposition_updated_at,p.mgogpt_disposition_sync_state,
      p.mgogpt_disposition_sync_debug->>'customFieldId',p.mgogpt_disposition_synced_at,TRUE
    FROM prospect_pool p JOIN prospect_lifecycle_assignments a ON a.id=p.current_assignment_audit_id
      AND a.fundraiser_id=p.assigned_user_id AND a.constituent_id=p.blackbaud_constituent_id
    WHERE NULLIF(BTRIM(p.mgogpt_disposition_value),'') IS NOT NULL AND p.mgogpt_disposition_updated_at >= a.assigned_at
      AND NOT EXISTS(SELECT 1 FROM prospect_lifecycle_outcomes o WHERE o.assignment_id=a.id);
  END $lifecycle_schema$`;
}
