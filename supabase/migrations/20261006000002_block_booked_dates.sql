BEGIN;

-- A host can't block a night that already has a confirmed booking. Checked
-- inside set_host_calendar_dates() after taking the per-listing advisory lock
-- (the same lock guard_booking_availability() takes), so a block and a booking
-- for the same night can never both succeed. Unblocking and price-only edits
-- are unaffected; blocking free nights in the same request as booked ones is
-- rejected as a whole so the host sees exactly which dates conflict.

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.set_host_calendar_dates(
  p_listing_id integer, p_dates date[], p_is_available boolean, p_price numeric DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_calendar_id uuid; day date; v_booked date[];
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

  IF NOT p_is_available THEN
    SELECT array_agg(DISTINCT d ORDER BY d) INTO v_booked
    FROM unnest(p_dates) AS d
    WHERE EXISTS (
      SELECT 1 FROM hostiggo_testing_schema.bookings b
      WHERE b.listing_id = p_listing_id AND b.status_id = 2
        AND b.start_date <= d AND b.end_date > d
    );
    IF v_booked IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'HOSTIGGO_DATES_BOOKED',
        DETAIL = array_to_string(v_booked, ',');
    END IF;
  END IF;

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

NOTIFY pgrst, 'reload schema';
COMMIT;
