BEGIN;

-- iCal imports every 15 seconds. Vercel cron can't go below 1 minute, so
-- pg_cron (>= 1.5 supports "N seconds") calls the site's sync endpoint via
-- pg_net. The URL and CRON_SECRET live in a locked-down table, never in SQL:
--
--   INSERT INTO hostiggo_testing_schema.internal_config (key, value) VALUES
--     ('ical_sync_url',    'https://<your-site>/api/cron/ical-sync'),
--     ('ical_sync_secret', '<same value as CRON_SECRET>')
--   ON CONFLICT (key) DO UPDATE SET value = excluded.value;
--
-- Until both rows exist the tick is a harmless no-op.

CREATE TABLE IF NOT EXISTS hostiggo_testing_schema.internal_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE hostiggo_testing_schema.internal_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hostiggo_testing_schema.internal_config FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.ical_cron_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT value INTO v_url FROM hostiggo_testing_schema.internal_config WHERE key = 'ical_sync_url';
  SELECT value INTO v_secret FROM hostiggo_testing_schema.internal_config WHERE key = 'ical_sync_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 14000
  );
END;
$$;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.ical_cron_tick() FROM PUBLIC, anon, authenticated;

-- The old job posted to a placeholder ("YOUR_GO_SERVICE_URL") every 5 minutes.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('sync-hostigo-calendars', 'ical-sync-15s');
SELECT cron.schedule('ical-sync-15s', '15 seconds', 'select hostiggo_testing_schema.ical_cron_tick()');

COMMIT;
