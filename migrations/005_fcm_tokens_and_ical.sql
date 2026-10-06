-- ============================================================================
-- Migration 005: FCM Tokens and iCal Sync
-- ============================================================================
-- Creates tables for Firebase Cloud Messaging tokens (cross-platform push
-- notifications) and adds iCal sync tracking to listings
-- ============================================================================

-- Create fcm_tokens table for storing device tokens
CREATE TABLE IF NOT EXISTS hostiggo_testing_schema.fcm_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON hostiggo_testing_schema.fcm_tokens(user_id);

-- Index for token cleanup (finding old tokens)
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_updated_at ON hostiggo_testing_schema.fcm_tokens(updated_at);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON hostiggo_testing_schema.fcm_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hostiggo_testing_schema.fcm_tokens TO service_role;
GRANT USAGE, SELECT ON SEQUENCE hostiggo_testing_schema.fcm_tokens_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hostiggo_testing_schema.fcm_tokens_id_seq TO service_role;

-- Add iCal sync tracking columns to listings
ALTER TABLE hostiggo_testing_schema.listings 
  ADD COLUMN IF NOT EXISTS ical_url TEXT,
  ADD COLUMN IF NOT EXISTS ical_last_sync TIMESTAMPTZ;

-- Create blocked_dates table for iCal imported dates
CREATE TABLE IF NOT EXISTS hostiggo_testing_schema.blocked_dates (
  id BIGSERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'ical', 'booking')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by listing
CREATE INDEX IF NOT EXISTS idx_blocked_dates_listing_id ON hostiggo_testing_schema.blocked_dates(listing_id);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_blocked_dates_dates ON hostiggo_testing_schema.blocked_dates(start_date, end_date);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON hostiggo_testing_schema.blocked_dates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hostiggo_testing_schema.blocked_dates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE hostiggo_testing_schema.blocked_dates_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hostiggo_testing_schema.blocked_dates_id_seq TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE hostiggo_testing_schema.fcm_tokens IS 
'Stores Firebase Cloud Messaging tokens for push notifications across web and mobile platforms';

COMMENT ON TABLE hostiggo_testing_schema.blocked_dates IS 
'Stores blocked date ranges for listings from various sources (manual, iCal, bookings)';

COMMENT ON COLUMN hostiggo_testing_schema.listings.ical_url IS 
'iCal feed URL for syncing blocked dates from external calendars (Airbnb, Booking.com, etc.)';

COMMENT ON COLUMN hostiggo_testing_schema.listings.ical_last_sync IS 
'Timestamp of last successful iCal sync';
