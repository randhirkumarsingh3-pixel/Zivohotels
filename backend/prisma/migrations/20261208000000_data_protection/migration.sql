-- Audit trails are append-only: rows in these tables can be added but never changed or removed,
-- by the app or anyone else using the app's database account. The only exception is the
-- retention clean-up (services/retentionService.js), which switches the guard off for its own
-- transaction with: SELECT set_config('zivo.allow_audit_change', 'on', true)
CREATE OR REPLACE FUNCTION zivo_protect_audit() RETURNS trigger AS $$
BEGIN
  IF current_setting('zivo.allow_audit_change', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Audit records in % cannot be changed or deleted', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION zivo_protect_audit_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit records in % cannot be truncated', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AuditLog', 'SecurityLog', 'AdminActionLog', 'LedgerEntry'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zivo_append_only ON %I', t);
    EXECUTE format('CREATE TRIGGER zivo_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION zivo_protect_audit()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS zivo_no_truncate ON %I', t);
    EXECUTE format('CREATE TRIGGER zivo_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION zivo_protect_audit_truncate()', t);
  END LOOP;
END $$;

-- Tables that nothing ever wrote to (kept people looking in the wrong place)
DROP TABLE IF EXISTS "PropertyAudit";
DROP TABLE IF EXISTS "SessionRecord";
DROP TABLE IF EXISTS "SystemEvent";
DROP TABLE IF EXISTS "NotificationSyncLog";
DROP TYPE IF EXISTS "AuditSeverity";
