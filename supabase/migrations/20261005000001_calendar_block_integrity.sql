BEGIN;

-- Calendar integrity using only the retained schema. Source ownership lives in
-- the existing calendars/calendar_events tables:
--   source = 'hostiggo' -> a host's manual block
--   source = 'ical'     -> an imported calendar block
-- listing_calendar remains the read model consumed by the website and app.

-- Preserve legacy unavailable rows as explicit host blocks before the source
-- aware functions take over. This is intentionally conservative.
INSERT INTO hostiggo_testing_schema.calendars (host_id, listing_id, ical_url)
SELECT l.host_uuid, l.listing_id, coalesce(l."icalLink", '')
FROM hostiggo_testing_schema.listings l
WHERE l.host_uuid IS NOT NULL
  AND EXISTS (SELECT 1 FROM hostiggo_testing_schema.listing_calendar lc
              WHERE lc.listing_id = l.listing_id AND NOT lc.is_available)
  AND NOT EXISTS (SELECT 1 FROM hostiggo_testing_schema.calendars c
                  WHERE c.listing_id = l.listing_id);

INSERT INTO hostiggo_testing_schema.calendar_events
  (calendar_id, start_date, end_date, source, external_uid)
SELECT c.calendar_id, lc.date, lc.date + 1, 'hostiggo',
       'legacy-host-block:' || lc.listing_id || ':' || lc.date
FROM hostiggo_testing_schema.listing_calendar lc
JOIN hostiggo_testing_schema.calendars c ON c.listing_id = lc.listing_id
WHERE NOT lc.is_available
  AND NOT EXISTS (SELECT 1 FROM hostiggo_testing_schema.bookings b
                  WHERE b.listing_id = lc.listing_id AND b.status_id = 2
                    AND b.start_date <= lc.date AND b.end_date > lc.date)
  AND NOT EXISTS (SELECT 1 FROM hostiggo_testing_schema.calendar_events ce
                  WHERE ce.calendar_id = c.calendar_id AND ce.start_date = lc.date
                    AND ce.end_date = lc.date + 1);

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.ensure_listing_calendar(p_listing_id integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result_id uuid; listing_host uuid; feed_url text;
BEGIN
  SELECT c.calendar_id INTO result_id
  FROM hostiggo_testing_schema.calendars c
  WHERE c.listing_id = p_listing_id ORDER BY c.created_at DESC NULLS LAST LIMIT 1;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  SELECT l.host_uuid, coalesce(l."icalLink", '') INTO listing_host, feed_url
  FROM hostiggo_testing_schema.listings l WHERE l.listing_id = p_listing_id;
  IF listing_host IS NULL THEN RAISE EXCEPTION 'Listing has no host'; END IF;
  INSERT INTO hostiggo_testing_schema.calendars (host_id, listing_id, ical_url)
  VALUES (listing_host, p_listing_id, feed_url) RETURNING calendar_id INTO result_id;
  RETURN result_id;
END;
$$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.calendar_day_available(p_listing_id integer, p_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.calendar_events ce
    JOIN hostiggo_testing_schema.calendars c ON c.calendar_id = ce.calendar_id
    WHERE c.listing_id = p_listing_id AND ce.source IN ('hostiggo', 'ical')
      AND ce.start_date <= p_date AND ce.end_date > p_date
  ) AND NOT EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.bookings b
    WHERE b.listing_id = p_listing_id AND b.status_id = 2
      AND b.start_date <= p_date AND b.end_date > p_date
  );
$$;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.calendar_day_available(integer, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.recalculate_calendar_days(p_listing_id integer, p_dates date[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE day date; existing_price numeric; existing_currency text; row_exists boolean;
BEGIN
  FOREACH day IN ARRAY coalesce(p_dates, ARRAY[]::date[]) LOOP
    SELECT true, lc.price, lc.currency
      INTO row_exists, existing_price, existing_currency
    FROM hostiggo_testing_schema.listing_calendar lc
    WHERE lc.listing_id = p_listing_id AND lc.date = day
    ORDER BY lc.calendar_id LIMIT 1;
    IF NOT coalesce(row_exists, false) THEN
      INSERT INTO hostiggo_testing_schema.listing_calendar
        (listing_id, date, price, currency, is_available, updated_at)
      VALUES (p_listing_id, day, 0, 'INR',
              hostiggo_testing_schema.calendar_day_available(p_listing_id, day), now());
    ELSE
      UPDATE hostiggo_testing_schema.listing_calendar
      SET is_available = hostiggo_testing_schema.calendar_day_available(p_listing_id, day),
          updated_at = now()
      WHERE listing_id = p_listing_id AND date = day;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.guard_booking_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.listing_id <> NEW.listing_id THEN
    PERFORM pg_advisory_xact_lock(476001, least(OLD.listing_id, NEW.listing_id));
    PERFORM pg_advisory_xact_lock(476001, greatest(OLD.listing_id, NEW.listing_id));
  ELSE
    PERFORM pg_advisory_xact_lock(476001, NEW.listing_id);
  END IF;
  IF NEW.status_id <> 2 THEN RETURN NEW; END IF;
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.end_date <= NEW.start_date THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'HOSTIGGO_DATES_UNAVAILABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM hostiggo_testing_schema.bookings b
             WHERE b.listing_id = NEW.listing_id AND b.status_id = 2
               AND b.booking_id IS DISTINCT FROM NEW.booking_id
               AND b.start_date < NEW.end_date AND b.end_date > NEW.start_date)
     OR EXISTS (SELECT 1 FROM hostiggo_testing_schema.calendar_events ce
                JOIN hostiggo_testing_schema.calendars c ON c.calendar_id = ce.calendar_id
                WHERE c.listing_id = NEW.listing_id AND ce.source IN ('hostiggo', 'ical')
                  AND ce.start_date < NEW.end_date AND ce.end_date > NEW.start_date)
     OR EXISTS (SELECT 1 FROM hostiggo_testing_schema.listing_calendar lc
                WHERE lc.listing_id = NEW.listing_id AND lc.date >= NEW.start_date
                  AND lc.date < NEW.end_date AND NOT lc.is_available) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'HOSTIGGO_DATES_UNAVAILABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS booking_availability_guard ON hostiggo_testing_schema.bookings;
CREATE TRIGGER booking_availability_guard
BEFORE INSERT OR UPDATE OF status_id, start_date, end_date, listing_id
ON hostiggo_testing_schema.bookings FOR EACH ROW
EXECUTE FUNCTION hostiggo_testing_schema.guard_booking_availability();

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.refresh_booking_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE dates date[];
BEGIN
  PERFORM pg_advisory_xact_lock(476001, coalesce(NEW.listing_id, OLD.listing_id));
  SELECT array_agg(DISTINCT d::date) INTO dates FROM (
    SELECT generate_series(OLD.start_date::timestamp, (OLD.end_date - 1)::timestamp, interval '1 day') d
    WHERE TG_OP <> 'INSERT'
    UNION ALL
    SELECT generate_series(NEW.start_date::timestamp, (NEW.end_date - 1)::timestamp, interval '1 day') d
    WHERE TG_OP <> 'DELETE'
  ) affected;
  PERFORM hostiggo_testing_schema.recalculate_calendar_days(coalesce(NEW.listing_id, OLD.listing_id), dates);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS booking_calendar_refresh ON hostiggo_testing_schema.bookings;
CREATE TRIGGER booking_calendar_refresh
AFTER INSERT OR DELETE OR UPDATE OF status_id, start_date, end_date, listing_id
ON hostiggo_testing_schema.bookings FOR EACH ROW
EXECUTE FUNCTION hostiggo_testing_schema.refresh_booking_calendar();

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(p_listing_id integer, p_dates date[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_calendar_id uuid; old_dates date[]; affected date[];
BEGIN
  IF p_dates IS NULL OR array_position(p_dates, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A complete, non-null iCal date list is required';
  END IF;
  PERFORM pg_advisory_xact_lock(476001, p_listing_id);
  v_calendar_id := hostiggo_testing_schema.ensure_listing_calendar(p_listing_id);
  SELECT array_agg(DISTINCT ce.start_date) INTO old_dates
  FROM hostiggo_testing_schema.calendar_events ce
  WHERE ce.calendar_id = v_calendar_id AND ce.source = 'ical';
  SELECT array_agg(DISTINCT d) INTO affected FROM (
    SELECT unnest(coalesce(old_dates, ARRAY[]::date[])) d
    UNION SELECT unnest(p_dates) d
  ) all_dates;
  DELETE FROM hostiggo_testing_schema.calendar_events ce
  WHERE ce.calendar_id = v_calendar_id AND ce.source = 'ical';
  INSERT INTO hostiggo_testing_schema.calendar_events
    (calendar_id, start_date, end_date, source, external_uid)
  SELECT v_calendar_id, d, d + 1, 'ical', 'ical:' || p_listing_id || ':' || d
  FROM (SELECT DISTINCT unnest(p_dates) d) incoming;
  PERFORM hostiggo_testing_schema.recalculate_calendar_days(p_listing_id, affected);
  UPDATE hostiggo_testing_schema.listing_ical_feeds f
  SET blocked_dates = to_jsonb(p_dates), last_pulled_at = now(), updated_at = now()
  WHERE f.id = (SELECT id FROM hostiggo_testing_schema.listing_ical_feeds
                WHERE listing_id = p_listing_id ORDER BY updated_at DESC NULLS LAST LIMIT 1);
END;
$$;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(integer, date[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(integer, date[]) TO service_role;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.set_host_calendar_dates(
  p_listing_id integer, p_dates date[], p_is_available boolean, p_price numeric DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_calendar_id uuid; day date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.listings l
    JOIN hostiggo_testing_schema.host h ON h.host_uuid = l.host_uuid
    WHERE l.listing_id = p_listing_id AND h.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Only the listing host may edit its calendar'; END IF;
  IF p_dates IS NULL OR array_position(p_dates, NULL) IS NOT NULL OR p_is_available IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Invalid calendar changes';
  END IF;
  PERFORM pg_advisory_xact_lock(476001, p_listing_id);
  v_calendar_id := hostiggo_testing_schema.ensure_listing_calendar(p_listing_id);
  FOREACH day IN ARRAY p_dates LOOP
    IF p_is_available THEN
      DELETE FROM hostiggo_testing_schema.calendar_events ce
      WHERE ce.calendar_id = v_calendar_id AND ce.source = 'hostiggo'
        AND ce.start_date = day AND ce.end_date = day + 1;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM hostiggo_testing_schema.calendar_events ce
        WHERE ce.calendar_id = v_calendar_id AND ce.source = 'hostiggo'
          AND ce.start_date = day AND ce.end_date = day + 1
      ) THEN
        INSERT INTO hostiggo_testing_schema.calendar_events
          (calendar_id, start_date, end_date, source, external_uid)
        VALUES (v_calendar_id, day, day + 1, 'hostiggo', 'host:' || p_listing_id || ':' || day);
      END IF;
    END IF;
  END LOOP;
  PERFORM hostiggo_testing_schema.recalculate_calendar_days(p_listing_id, p_dates);
  IF p_price IS NOT NULL THEN
    UPDATE hostiggo_testing_schema.listing_calendar
    SET price = p_price, updated_at = now()
    WHERE listing_id = p_listing_id AND date = ANY(p_dates);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.set_host_calendar_dates(integer, date[], boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.set_host_calendar_dates(integer, date[], boolean, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION hostiggo_testing_schema.guard_booking_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.refresh_booking_calendar() FROM PUBLIC;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.recalculate_calendar_days(integer, date[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.ensure_listing_calendar(integer) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'hostiggo_testing_schema' AND tablename = 'listing_calendar') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE hostiggo_testing_schema.listing_calendar;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'hostiggo_testing_schema' AND tablename = 'bookings') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE hostiggo_testing_schema.bookings;
    END IF;
  END IF;
END $$;

ALTER TABLE hostiggo_testing_schema.listing_calendar REPLICA IDENTITY FULL;
ALTER TABLE hostiggo_testing_schema.bookings REPLICA IDENTITY FULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
