BEGIN;

-- iCal imports every 15 seconds. Vercel cron can't go below 1 minute, so
-- pg_cron (>= 1.5 supports "N seconds") calls the site's sync endpoint via
-- pg_net. No new tables: the endpoint URL and CRON_SECRET are database-level
-- settings, set once by an admin (run as a superuser / in the SQL editor):
--
--   ALTER DATABASE postgres SET app.ical_sync_url    = 'https://<your-site>/api/cron/ical-sync';
--   ALTER DATABASE postgres SET app.ical_sync_secret = '<same value as CRON_SECRET>';
--
-- Until both are set the tick is a harmless no-op.

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.ical_cron_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_url text := nullif(current_setting('app.ical_sync_url', true), '');
        v_secret text := nullif(current_setting('app.ical_sync_secret', true), '');
BEGIN
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
