CREATE OR REPLACE FUNCTION protect_pending_pipeline_change() RETURNS trigger AS $pipeline_guard$
      BEGIN
        IF OLD.pipeline_change_id IS NOT NULL AND NEW.pipeline_change_id IS NOT DISTINCT FROM OLD.pipeline_change_id
          AND (to_jsonb(NEW) - 'nxt_retry_after') IS DISTINCT FROM (to_jsonb(OLD) - 'nxt_retry_after') THEN
          RAISE EXCEPTION 'Opportunity has a pending pipeline change; verify it before editing';
        END IF;
        RETURN NEW;
      END;
      $pipeline_guard$ LANGUAGE plpgsql;
CREATE TRIGGER protect_pending_pipeline_change BEFORE UPDATE ON prospect_opportunities
  FOR EACH ROW EXECUTE FUNCTION protect_pending_pipeline_change();
