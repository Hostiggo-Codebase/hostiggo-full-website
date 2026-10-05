BEGIN;

-- Separate ownership from the public calendar so cancelling a booking or
-- removing an imported event cannot release a host's manual block.
CREATE TABLE IF NOT EXISTS hostiggo_testing_schema.calendar_block_sources (
  listing_id integer NOT NULL REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE,
  date date NOT NULL,
  host_blocked boolean NOT NULL DEFAULT false,
  ical_blocked boolean NOT NULL DEFAULT false,
  PRIMARY KEY (listing_id, date)
);
ALTER TABLE hostiggo_testing_schema.calendar_block_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hostiggo_testing_schema.calendar_block_sources FROM anon, authenticated;
GRANT ALL ON hostiggo_testing_schema.calendar_block_sources TO service_role;

-- Legacy unavailability has no source metadata. Preserve it conservatively;
-- hosts may explicitly release those legacy blocks after reviewing them.
INSERT INTO hostiggo_testing_schema.calendar_block_sources (listing_id, date, host_blocked)
SELECT c.listing_id, c.date, true
FROM hostiggo_testing_schema.listing_calendar c
WHERE c.is_available = false AND NOT EXISTS (
  SELECT 1 FROM hostiggo_testing_schema.bookings b
  WHERE b.listing_id = c.listing_id AND b.status_id = 2
    AND b.start_date <= c.date AND b.end_date > c.date
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.calendar_day_available(p_listing_id integer, p_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.calendar_block_sources s
    WHERE s.listing_id = p_listing_id AND s.date = p_date AND (s.host_blocked OR s.ical_blocked)
  ) AND NOT EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.bookings b
    WHERE b.listing_id = p_listing_id AND b.status_id = 2
      AND b.start_date <= p_date AND b.end_date > p_date
  );
$$;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.calendar_day_available(integer, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.enforce_calendar_block_sources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(476001, NEW.listing_id);
  IF TG_OP = 'UPDATE' AND (NEW.listing_id <> OLD.listing_id OR NEW.date <> OLD.date) THEN
    RAISE EXCEPTION 'Calendar dates cannot be moved; edit availability instead';
  END IF;
  IF current_setting('hostiggo.calendar_write', true) IS DISTINCT FROM 'managed' THEN
    -- Legacy booking clients also write is_available=false after confirming.
    -- Do not misclassify those writes as new manual host blocks.
    IF NOT NEW.is_available AND NOT EXISTS (
      SELECT 1 FROM hostiggo_testing_schema.bookings b
      WHERE b.listing_id = NEW.listing_id AND b.status_id = 2
        AND b.start_date <= NEW.date AND b.end_date > NEW.date
    ) THEN
      INSERT INTO hostiggo_testing_schema.calendar_block_sources (listing_id, date, host_blocked)
      VALUES (NEW.listing_id, NEW.date, NOT NEW.is_available)
      ON CONFLICT (listing_id, date) DO UPDATE SET host_blocked = EXCLUDED.host_blocked;
    END IF;
  END IF;
  NEW.is_available := hostiggo_testing_schema.calendar_day_available(NEW.listing_id, NEW.date);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS calendar_block_sources_guard ON hostiggo_testing_schema.listing_calendar;
CREATE TRIGGER calendar_block_sources_guard BEFORE INSERT OR UPDATE OF is_available, listing_id, date
ON hostiggo_testing_schema.listing_calendar FOR EACH ROW
EXECUTE FUNCTION hostiggo_testing_schema.enforce_calendar_block_sources();

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.prevent_blocked_calendar_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(476001, OLD.listing_id);
  IF NOT hostiggo_testing_schema.calendar_day_available(OLD.listing_id, OLD.date) THEN
    RAISE EXCEPTION 'A blocked calendar date must be released before deletion';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS calendar_block_delete_guard ON hostiggo_testing_schema.listing_calendar;
CREATE TRIGGER calendar_block_delete_guard BEFORE DELETE ON hostiggo_testing_schema.listing_calendar
FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.prevent_blocked_calendar_delete();

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.guard_booking_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE old_start date; old_end date;
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
  IF TG_OP = 'UPDATE' AND OLD.status_id = 2 AND OLD.listing_id = NEW.listing_id THEN
    IF OLD.start_date = NEW.start_date AND OLD.end_date = NEW.end_date THEN RETURN NEW; END IF;
    old_start := OLD.start_date;
    old_end := OLD.end_date;
  END IF;
  IF EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.bookings b
    WHERE b.listing_id = NEW.listing_id AND b.status_id = 2
      AND b.booking_id IS DISTINCT FROM NEW.booking_id
      AND b.start_date < NEW.end_date AND b.end_date > NEW.start_date
  ) OR EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.calendar_block_sources s
    WHERE s.listing_id = NEW.listing_id AND s.date >= NEW.start_date AND s.date < NEW.end_date
      AND (s.host_blocked OR s.ical_blocked)
  ) OR EXISTS (
    SELECT 1 FROM hostiggo_testing_schema.listing_calendar c
    WHERE c.listing_id = NEW.listing_id AND c.date >= NEW.start_date AND c.date < NEW.end_date
      AND c.is_available = false
      AND (old_start IS NULL OR c.date < old_start OR c.date >= old_end)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'HOSTIGGO_DATES_UNAVAILABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS booking_availability_guard ON hostiggo_testing_schema.bookings;
CREATE TRIGGER booking_availability_guard BEFORE INSERT OR UPDATE OF status_id, start_date, end_date, listing_id
ON hostiggo_testing_schema.bookings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.guard_booking_availability();

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.refresh_booking_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE booking_row record; day date; previous_mode text;
BEGIN
  previous_mode := current_setting('hostiggo.calendar_write', true);
  PERFORM set_config('hostiggo.calendar_write', 'managed', true);
  FOR booking_row IN
    SELECT * FROM (VALUES
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.listing_id END, CASE WHEN TG_OP <> 'INSERT' THEN OLD.start_date END, CASE WHEN TG_OP <> 'INSERT' THEN OLD.end_date END),
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.listing_id END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.start_date END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.end_date END)
    ) AS affected(listing_id, start_date, end_date) WHERE listing_id IS NOT NULL
  LOOP
    PERFORM pg_advisory_xact_lock(476001, booking_row.listing_id);
    FOR day IN SELECT d::date FROM generate_series(booking_row.start_date::timestamp, (booking_row.end_date - 1)::timestamp, interval '1 day') d
    LOOP
      INSERT INTO hostiggo_testing_schema.listing_calendar (listing_id, date, price, currency, is_available, updated_at)
      VALUES (booking_row.listing_id, day, 0, 'INR', hostiggo_testing_schema.calendar_day_available(booking_row.listing_id, day), now())
      ON CONFLICT (listing_id, date) DO UPDATE SET is_available = EXCLUDED.is_available, updated_at = EXCLUDED.updated_at;
    END LOOP;
  END LOOP;
  PERFORM set_config('hostiggo.calendar_write', coalesce(previous_mode, ''), true);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS booking_calendar_refresh ON hostiggo_testing_schema.bookings;
CREATE TRIGGER booking_calendar_refresh AFTER INSERT OR DELETE OR UPDATE OF status_id, start_date, end_date, listing_id
ON hostiggo_testing_schema.bookings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.refresh_booking_calendar();

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(p_listing_id integer, p_dates date[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE affected_dates date[]; day date; previous_mode text;
BEGIN
  PERFORM pg_advisory_xact_lock(476001, p_listing_id);
  IF p_dates IS NULL OR array_position(p_dates, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A complete, non-null iCal date list is required';
  END IF;
  SELECT array_agg(DISTINCT date) INTO affected_dates FROM (
    SELECT date FROM hostiggo_testing_schema.calendar_block_sources WHERE listing_id = p_listing_id AND ical_blocked
    UNION SELECT unnest(p_dates)
  ) dates;
  UPDATE hostiggo_testing_schema.calendar_block_sources SET ical_blocked = false WHERE listing_id = p_listing_id AND ical_blocked;
  INSERT INTO hostiggo_testing_schema.calendar_block_sources (listing_id, date, ical_blocked)
  SELECT p_listing_id, d, true FROM (SELECT DISTINCT unnest(p_dates) AS d) dates
  ON CONFLICT (listing_id, date) DO UPDATE SET ical_blocked = true;
  previous_mode := current_setting('hostiggo.calendar_write', true);
  PERFORM set_config('hostiggo.calendar_write', 'managed', true);
  FOREACH day IN ARRAY coalesce(affected_dates, ARRAY[]::date[])
  LOOP
    INSERT INTO hostiggo_testing_schema.listing_calendar (listing_id, date, price, currency, is_available, updated_at)
    VALUES (p_listing_id, day, 0, 'INR', hostiggo_testing_schema.calendar_day_available(p_listing_id, day), now())
    ON CONFLICT (listing_id, date) DO UPDATE SET is_available = EXCLUDED.is_available, updated_at = EXCLUDED.updated_at;
  END LOOP;
  PERFORM set_config('hostiggo.calendar_write', coalesce(previous_mode, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(integer, date[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(integer, date[]) TO service_role;

-- Only this explicit host action may remove a manual block. Generic calendar
-- releases from older booking/cancellation clients cannot remove ownership.
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.set_host_calendar_dates(
  p_listing_id integer, p_dates date[], p_is_available boolean, p_price numeric DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE day date; previous_mode text;
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
  previous_mode := current_setting('hostiggo.calendar_write', true);
  PERFORM set_config('hostiggo.calendar_write', 'managed', true);
  FOREACH day IN ARRAY p_dates LOOP
    INSERT INTO hostiggo_testing_schema.calendar_block_sources (listing_id, date, host_blocked)
    VALUES (p_listing_id, day, NOT p_is_available)
    ON CONFLICT (listing_id, date) DO UPDATE SET host_blocked = EXCLUDED.host_blocked;
    INSERT INTO hostiggo_testing_schema.listing_calendar (listing_id, date, price, currency, is_available, updated_at)
    VALUES (p_listing_id, day, coalesce(p_price, 0), 'INR', hostiggo_testing_schema.calendar_day_available(p_listing_id, day), now())
    ON CONFLICT (listing_id, date) DO UPDATE SET
      price = coalesce(p_price, hostiggo_testing_schema.listing_calendar.price),
      is_available = EXCLUDED.is_available, updated_at = EXCLUDED.updated_at;
  END LOOP;
  PERFORM set_config('hostiggo.calendar_write', coalesce(previous_mode, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.set_host_calendar_dates(integer, date[], boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.set_host_calendar_dates(integer, date[], boolean, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION hostiggo_testing_schema.enforce_calendar_block_sources() FROM PUBLIC;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.prevent_blocked_calendar_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.guard_booking_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.refresh_booking_calendar() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND schemaname = 'hostiggo_testing_schema' AND tablename = 'listing_calendar'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hostiggo_testing_schema.listing_calendar;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
