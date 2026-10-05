-- Combined migration: Search count function + Notification infrastructure

-- ============================================================================
-- PART 1: Search listings by state count function
-- ============================================================================

-- Migration: true match count for the state/district search
--
-- Why this exists: search_listings_by_state (migration 002) ends with
-- `LIMIT p_limit`, so calling it with PostgREST `count: 'exact'` counts only
-- the rows it returns -- never more than one page. That made the results
-- header ("N homestays found") cap at the page size (e.g. 20) even when
-- hundreds of listings matched. This companion function runs the *same* WHERE
-- with no cursor and no LIMIT and returns the real total.
--
-- Keep the WHERE clause in sync with search_listings_by_state's WHERE. Like
-- that function, p_ratings / p_roomtypes / the date params are accepted for a
-- symmetric call site but are NOT filtered here (ratings, room/stay type and
-- date availability are applied after the RPC in /api/search), so this count
-- mirrors the RPC's own filtering exactly.

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.search_listings_by_state_count(
  p_state TEXT,
  p_district TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_min_price INT DEFAULT NULL,
  p_max_price INT DEFAULT NULL,
  p_total_guests INT DEFAULT NULL,
  p_ratings INT[] DEFAULT NULL,
  p_amenities INT[] DEFAULT NULL,
  p_roomtypes TEXT[] DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = hostiggo_testing_schema, public
AS $$
  SELECT count(*)
  FROM hostiggo_testing_schema.listings l
  LEFT JOIN hostiggo_testing_schema.locations loc ON l.location_id = loc.location_id
  WHERE
    l.is_active = TRUE
    AND (LOWER(loc.state) = LOWER(p_state) OR p_state IS NULL)
    AND (LOWER(loc.district) = LOWER(p_district) OR p_district IS NULL)
    AND (l.price_weekday >= p_min_price OR p_min_price IS NULL)
    AND (l.price_weekday <= p_max_price OR p_max_price IS NULL)
    AND (l.num_guests >= p_total_guests OR p_total_guests IS NULL)
    AND (
      p_amenities IS NULL
      OR p_amenities = ARRAY[]::INT[]
      OR EXISTS (
        SELECT 1 FROM hostiggo_testing_schema.listing_amenities la
        WHERE la.listing_id = l.listing_id
        AND la.amenity_id = ANY(p_amenities)
      )
    );
$$;

-- PostgREST needs the API roles to be able to call it (mirrors how the anon
-- client already calls search_listings_by_state).
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.search_listings_by_state_count(
  TEXT, TEXT, DATE, DATE, INT, INT, INT, INT[], INT[], TEXT[]
) TO anon, authenticated;

-- ============================================================================
-- PART 2: Notification infrastructure indexes and grants
-- ============================================================================

-- Ensure message_log has all required columns
alter table if exists hostiggo_testing_schema.message_log add column if not exists retry_count int default 0;
alter table if exists hostiggo_testing_schema.message_log add column if not exists updated_at timestamptz default now();

-- Indexes for message_log
create index if not exists message_log_status_idx on hostiggo_testing_schema.message_log(status);
create index if not exists message_log_created_at_idx on hostiggo_testing_schema.message_log(created_at desc);
create index if not exists message_log_to_number_idx on hostiggo_testing_schema.message_log(to_number);
create index if not exists message_log_template_idx on hostiggo_testing_schema.message_log(template_name);
create index if not exists message_log_status_created_idx on hostiggo_testing_schema.message_log(status, created_at desc);

-- Grants for message_log
grant all on hostiggo_testing_schema.message_log to service_role;
grant select on hostiggo_testing_schema.message_log to authenticated;

-- Indexes for notification_preferences
create index if not exists notification_preferences_user_id_idx on hostiggo_testing_schema.notification_preferences(user_id);

-- Grants for notification_preferences
grant all on hostiggo_testing_schema.notification_preferences to service_role;
grant select, update on hostiggo_testing_schema.notification_preferences to authenticated;
