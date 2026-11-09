-- ============================================================================
-- Hostiggo baseline: the complete database in one idempotent migration.
--
-- Replaces every earlier migration. Captured from the live project on
-- 2026-10-07, then fixed where the live definition was broken (see "FIXES").
-- Safe on an empty database AND on the live one: every statement is
-- create-if-not-exists / create-or-replace / guarded, so re-running it changes
-- nothing that already matches.
--
-- Deliberately NOT in here:
--   * Row Level Security + policies (out of scope for the MVP).
--   * Secrets. The arrival-reminder cron job carries a service-role key, so it
--     is created by hand; a template is at the bottom.
--   * Data changes. The old test-data wipe and the duplicate-user merge are not
--     schema and are gone.
--   * users_email_unique_idx / users_phone_unique_idx / users_email_or_phone_
--     required (old atomic_users_constraints). They were never applied live and
--     the live data has duplicate rows, so they can't be created until those
--     are resolved. Add them in a later migration after cleaning the data.
--
-- FIXES vs the live database:
--   * get_unique_room_types() selected listings.room_type, a column that does
--     not exist, so it failed on call (and would not create on a fresh DB).
--     It now returns the distinct property-type names in use.
--   * search_nearest_listings() (2 overloads) returned listing_id as uuid, but
--     listings.listing_id is integer, so every call failed. Return type fixed.
--   * refresh_listing_search_vector() used unqualified table names with no
--     search_path, so it only worked when called from a trigger. Pinned.
--   * The ical sync cron pointed at a placeholder URL (YOUR_GO_SERVICE_URL).
--     Replaced by ical_cron_tick (needs two settings, see that section).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions and schema
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists postgis with schema extensions;

do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net not enabled: %', sqlerrm; end $$;
do $$ begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron not enabled: %', sqlerrm; end $$;

create schema if not exists hostiggo_testing_schema;

grant usage on schema hostiggo_testing_schema to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Enum types
-- ---------------------------------------------------------------------------
do $$ begin create type public.trip_status as enum ('upcoming', 'completed', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type hostiggo_testing_schema.booking_status_enum as enum ('pending', 'success', 'failed', 'refunded', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.feedback_type as enum ('report_issue', 'suggest_improvement', 'share_experience'); exception when duplicate_object then null; end $$;
do $$ begin create type public.issue_category as enum ('bookings', 'payments_payouts', 'referral_program', 'listing_management', 'account_security', 'app_performance', 'others'); exception when duplicate_object then null; end $$;
do $$ begin create type hostiggo_testing_schema.payout_status as enum ('processing', 'credited', 'failed', 'partial', 'pending'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. Sequences (serial-style columns; identity columns own their own)
-- ---------------------------------------------------------------------------
create sequence if not exists hostiggo_testing_schema.addons_addon_id_seq;
create sequence if not exists hostiggo_testing_schema.amenities_amenity_id_seq;
create sequence if not exists hostiggo_testing_schema.bookings_booking_id_seq;
create sequence if not exists hostiggo_testing_schema.feedback_id_seq;
create sequence if not exists hostiggo_testing_schema.listing_addons_id_seq;
create sequence if not exists hostiggo_testing_schema.listing_addresses_address_id_seq;
create sequence if not exists hostiggo_testing_schema.listing_bedrooms_id_seq;
create sequence if not exists hostiggo_testing_schema.listing_calendar_calendar_id_seq;
create sequence if not exists hostiggo_testing_schema.listing_discounts_id_seq;
create sequence if not exists hostiggo_testing_schema.listings_listing_id_seq;
create sequence if not exists hostiggo_testing_schema.locations_location_id_seq;
create sequence if not exists hostiggo_testing_schema.message_log_id_seq;
create sequence if not exists hostiggo_testing_schema.property_types_id_seq;
create sequence if not exists hostiggo_testing_schema.review_review_id_seq;
create sequence if not exists hostiggo_testing_schema.stay_types_id_seq;

-- ---------------------------------------------------------------------------
-- 4. Tables (foreign keys are added afterwards, in section 5)
-- ---------------------------------------------------------------------------
create table if not exists hostiggo_testing_schema.aadhaar_kyc (
  id bigint generated always as identity not null,
  user_id uuid not null,
  full_name text not null,
  aadhaar_last4 text not null,
  aadhaar_hash text not null,
  status text not null default 'pending'::text,
  submitted_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  front_image_path text,
  back_image_path text,
  provider_reference text,
  reason text,
  constraint aadhaar_kyc_pkey PRIMARY KEY (id),
  constraint aadhaar_kyc_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);

create table if not exists hostiggo_testing_schema.addons (
  addon_id integer not null default nextval('hostiggo_testing_schema.addons_addon_id_seq'::regclass),
  name text not null,
  icon text,
  category text not null,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  constraint addons_pkey PRIMARY KEY (addon_id)
);

create table if not exists hostiggo_testing_schema.admin_alerts (
  id bigint generated always as identity not null,
  severity text not null,
  category text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint admin_alerts_pkey PRIMARY KEY (id),
  constraint admin_alerts_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'warning'::text, 'info'::text])))
);

create table if not exists hostiggo_testing_schema.amenities (
  amenity_id integer not null default nextval('hostiggo_testing_schema.amenities_amenity_id_seq'::regclass),
  name text not null,
  icon text,
  category text,
  constraint amenities_name_key UNIQUE (name),
  constraint amenities_pkey PRIMARY KEY (amenity_id)
);

create table if not exists hostiggo_testing_schema.bank_verifications (
  id bigint generated always as identity not null,
  kyc_request_id bigint not null,
  account_hash text,
  account_last4 text,
  ifsc_code text,
  account_holder_name text,
  bank_name text,
  is_valid boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint bank_verifications_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.booking_addons (
  id bigint generated by default as identity not null,
  booking_id integer not null,
  name text not null,
  price numeric not null default 0,
  type text,
  created_at timestamp with time zone not null default now(),
  constraint booking_addons_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.booking_status (
  status_id integer not null,
  status_name character varying not null,
  description text,
  constraint booking_status_status_name_key UNIQUE (status_name),
  constraint booking_status_pkey PRIMARY KEY (status_id)
);

create table if not exists hostiggo_testing_schema.bookings (
  booking_id integer not null default nextval('hostiggo_testing_schema.bookings_booking_id_seq'::regclass),
  start_date date,
  end_date date,
  nom_guests integer,
  amount numeric,
  status_id integer,
  booked_at timestamp without time zone default CURRENT_TIMESTAMP,
  listing_id integer,
  user_id uuid,
  num_adults integer,
  num_children integer,
  host_uuid uuid,
  cancellation_reason text,
  reminder_call_sent boolean default false,
  razorpay_payment_id text,
  refund_status text,
  refund_amount numeric,
  refund_reason text,
  refund_transaction_id text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  policy_used text,
  refund_processed_at timestamp with time zone,
  payout_released_at timestamp with time zone,
  razorpay_order_id text,
  razorpay_transfer_id text,
  transfer_status text,
  settlement_id text,
  settlement_status text,
  utr text,
  amount_paise bigint,
  invoice jsonb,
  invoice_number text,
  host_payout_paise bigint,
  platform_fee_paise bigint,
  gst_collected_paise bigint,
  paid_at timestamp with time zone,
  currency text not null default 'INR'::text,
  constraint bookings_pkey PRIMARY KEY (booking_id),
  constraint bookings_settlement_status_check CHECK (((settlement_status IS NULL) OR (settlement_status = ANY (ARRAY['pending'::text, 'processed'::text])))),
  constraint bookings_transfer_status_check CHECK (((transfer_status IS NULL) OR (transfer_status = ANY (ARRAY['created'::text, 'processed'::text, 'failed'::text]))))
);

create table if not exists hostiggo_testing_schema.calendar_events (
  id uuid not null default gen_random_uuid(),
  calendar_id uuid,
  start_date date not null,
  end_date date not null,
  source text,
  external_uid text,
  created_at timestamp with time zone default now(),
  constraint calendar_events_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.calendars (
  calendar_id uuid not null default gen_random_uuid(),
  host_id uuid not null,
  listing_id integer not null,
  ical_url text not null,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint calendars_pkey PRIMARY KEY (calendar_id)
);

create table if not exists hostiggo_testing_schema.categories (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone default now(),
  user_id uuid not null,
  constraint categories_user_id_name_key UNIQUE (user_id, name),
  constraint categories_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.chat_messages (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  host_id uuid not null,
  sender_type text not null,
  content text not null,
  is_blocked boolean default false,
  created_at timestamp with time zone default now(),
  constraint chat_messages_pkey PRIMARY KEY (id),
  constraint chat_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['user'::text, 'host'::text])))
);

create table if not exists hostiggo_testing_schema.chat_moderation (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  user_id uuid not null,
  original_text text,
  extracted_sequence text,
  action_taken text default 'BLOCK'::text,
  client_ip text,
  fragment_buffer text,
  flag_reasons text,
  constraint chat_moderation_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.external_taxonomy_map (
  id bigint generated always as identity not null,
  source text not null,
  entity_type text not null,
  external_value text not null,
  internal_id bigint,
  internal_slug text,
  created_at timestamp with time zone not null default now(),
  constraint external_taxonomy_map_source_entity_type_external_value_key UNIQUE (source, entity_type, external_value),
  constraint external_taxonomy_map_pkey PRIMARY KEY (id),
  constraint external_taxonomy_map_entity_type_check CHECK ((entity_type = ANY (ARRAY['amenity'::text, 'property_type'::text, 'stay_type'::text])))
);

create table if not exists hostiggo_testing_schema.fcm_tokens (
  id bigint generated always as identity not null,
  user_id uuid not null,
  token text not null,
  platform text not null,
  device_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint fcm_tokens_pkey PRIMARY KEY (id),
  constraint fcm_tokens_platform_check CHECK ((platform = ANY (ARRAY['web'::text, 'ios'::text, 'android'::text]))),
  -- Target of saveFCMToken's onConflict "user_id,device_id". NULLS NOT DISTINCT so
  -- a client that sends no device_id still gets one row per user.
  constraint fcm_tokens_user_device_key UNIQUE NULLS NOT DISTINCT (user_id, device_id)
);

create table if not exists hostiggo_testing_schema.feedback (
  id integer not null default nextval('hostiggo_testing_schema.feedback_id_seq'::regclass),
  type public.feedback_type not null,
  category public.issue_category,
  description text,
  rating smallint,
  comment text,
  created_at timestamp with time zone default now(),
  user_id uuid default gen_random_uuid(),
  constraint feedback_pkey PRIMARY KEY (id),
  constraint feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

create table if not exists hostiggo_testing_schema.host (
  is_verified boolean default false,
  verified_at timestamp without time zone,
  photo text,
  host_uuid uuid not null default gen_random_uuid(),
  user_id uuid,
  about text,
  constraint host_user_id_unique UNIQUE (user_id),
  constraint host_pkey PRIMARY KEY (host_uuid)
);

create table if not exists hostiggo_testing_schema.host_bank_details (
  id integer not null,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc_code text,
  bank_branch_name text,
  upi_id text,
  host_uuid uuid,
  constraint host_bank_details_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.host_documents (
  id integer not null,
  aadhar_number text,
  aadhar_image_front text,
  aadhar_image_back text,
  pan_number text,
  pan_image text,
  passport_number text,
  passport_image text,
  host_uuid uuid,
  constraint host_documents_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.host_payout_methods (
  id bigint generated by default as identity not null,
  host_uuid uuid not null,
  account_holder_name text not null,
  bank_account_number text not null,
  bank_ifsc text not null,
  pan_number text not null,
  address_line1 text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  razorpay_account_id text,
  razorpay_stakeholder_id text,
  status text not null default 'submitted'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  razorpay_product_id text,
  constraint host_payout_methods_host_uuid_key UNIQUE (host_uuid),
  constraint host_payout_methods_pkey PRIMARY KEY (id),
  constraint host_payout_methods_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'onboarding'::text, 'active'::text, 'rejected'::text])))
);

create table if not exists hostiggo_testing_schema.hostiggo_coupons (
  id bigint generated always as identity not null,
  code text not null,
  discount_type text not null,
  value numeric not null,
  active boolean not null default true,
  expires_at timestamp with time zone,
  usage_limit integer,
  used_count integer not null default 0,
  min_booking_amount numeric,
  created_at timestamp with time zone not null default now(),
  constraint hostiggo_coupons_code_key UNIQUE (code),
  constraint hostiggo_coupons_pkey PRIMARY KEY (id),
  constraint hostiggo_coupons_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text])))
);

create table if not exists hostiggo_testing_schema.import_batches (
  batch_id bigint generated always as identity not null,
  source_url text not null,
  provider text not null,
  host_name text,
  host_uuid uuid,
  created_at timestamp with time zone not null default now(),
  constraint import_batches_pkey PRIMARY KEY (batch_id)
);

create table if not exists hostiggo_testing_schema.kyc_requests (
  id bigint generated always as identity not null,
  user_id uuid not null,
  service_type text not null,
  masked_id text,
  status text not null,
  provider_ref_id text,
  error_message text,
  created_at timestamp with time zone not null default now(),
  constraint kyc_requests_pkey PRIMARY KEY (id),
  constraint kyc_requests_service_type_check CHECK ((service_type = ANY (ARRAY['pan'::text, 'passport'::text, 'bank'::text, 'aadhaar'::text])))
);

create table if not exists hostiggo_testing_schema.listing_addons (
  id integer not null default nextval('hostiggo_testing_schema.listing_addons_id_seq'::regclass),
  listing_id integer not null,
  addon_id integer not null,
  price numeric,
  includes text,
  timing_from time without time zone,
  timing_to time without time zone,
  another_details jsonb,
  additional_notes text,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  constraint listing_addons_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.listing_addresses (
  address_id integer not null default nextval('hostiggo_testing_schema.listing_addresses_address_id_seq'::regclass),
  country text not null,
  state text not null,
  city text not null,
  full_address text,
  landmark text,
  pincode text,
  latitude numeric,
  longitude numeric,
  constraint listing_addresses_pkey PRIMARY KEY (address_id)
);

create table if not exists hostiggo_testing_schema.listing_amenities (
  listing_id integer not null,
  amenity_id integer not null,
  constraint listing_amenities_pkey PRIMARY KEY (listing_id, amenity_id)
);

create table if not exists hostiggo_testing_schema.listing_bedrooms (
  id integer not null default nextval('hostiggo_testing_schema.listing_bedrooms_id_seq'::regclass),
  listing_id integer not null,
  bedroom_index integer not null,
  beds integer not null,
  bathrooms integer not null,
  max_guests integer not null,
  constraint listing_bedrooms_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.listing_calendar (
  calendar_id bigint not null default nextval('hostiggo_testing_schema.listing_calendar_calendar_id_seq'::regclass),
  listing_id integer not null,
  date date not null,
  price numeric,
  currency text default 'INR'::text,
  is_available boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint unique_listing_date UNIQUE (listing_id, date),
  constraint listing_calendar_pkey PRIMARY KEY (calendar_id)
);

create table if not exists hostiggo_testing_schema.listing_discounts (
  id integer not null default nextval('hostiggo_testing_schema.listing_discounts_id_seq'::regclass),
  listing_id integer not null,
  discount_type text not null,
  percent numeric,
  enabled boolean default true,
  valid_from timestamp with time zone,
  valid_to timestamp with time zone,
  min_stay_nights integer,
  constraint listing_discounts_pkey PRIMARY KEY (id),
  constraint listing_discounts_percent_check CHECK (((percent > (0)::numeric) AND (percent <= (100)::numeric)))
);

create table if not exists hostiggo_testing_schema.listing_house_rules (
  listing_id integer not null,
  check_in_time time without time zone,
  check_out_time time without time zone,
  smoking_allowed boolean default false,
  pets_allowed boolean default false,
  parties_allowed boolean default false,
  quiet_hours boolean default false,
  id integer generated by default as identity not null,
  constraint listing_house_rules_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.listing_ical_feeds (
  id bigint generated always as identity not null,
  listing_id bigint,
  import_id bigint,
  feed_url text not null,
  calendar_name text,
  last_pulled_at timestamp with time zone,
  last_status text,
  blocked_dates jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint listing_ical_feeds_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.listing_imports (
  import_id bigint generated always as identity not null,
  batch_id bigint,
  listing_id integer,
  host_uuid uuid,
  created_by uuid,
  source text not null default 'airbnb_import'::text,
  provider text not null default 'airbnb'::text,
  source_url text not null,
  external_listing_id text,
  status text not null default 'pending'::text,
  stage text not null default 'queued'::text,
  tier_used smallint,
  options jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  normalized_payload jsonb,
  field_coverage jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  fx jsonb,
  ical jsonb,
  source_currency text,
  fx_rate numeric,
  source_photo_urls jsonb not null default '[]'::jsonb,
  mirrored_photos jsonb not null default '[]'::jsonb,
  logs jsonb not null default '[]'::jsonb,
  host_confirmed_ownership boolean not null default false,
  error_message text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint listing_imports_pkey PRIMARY KEY (import_id),
  constraint listing_imports_provider_check CHECK ((provider = ANY (ARRAY['airbnb'::text, 'booking'::text, 'agoda'::text, 'makemytrip'::text, 'goibibo'::text, 'unknown'::text]))),
  constraint listing_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fetching'::text, 'parsed'::text, 'needs_review'::text, 'published'::text, 'failed'::text])))
);

create table if not exists hostiggo_testing_schema.listing_media (
  id uuid not null default gen_random_uuid(),
  listing_id integer not null,
  media_url text not null,
  media_type text not null,
  is_cover boolean default false,
  uploaded_at timestamp with time zone default now(),
  source text not null default 'upload'::text,
  source_url text,
  import_id bigint,
  constraint listing_media_pkey PRIMARY KEY (id),
  constraint listing_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])))
);

create table if not exists hostiggo_testing_schema.listing_safety (
  listing_id integer not null,
  security_camera boolean default false,
  noise_monitoring boolean default false,
  weapons boolean default false,
  smoke_alarm boolean default false,
  constraint listing_safety_pkey PRIMARY KEY (listing_id)
);

create table if not exists hostiggo_testing_schema.listing_safety_details (
  id bigint generated always as identity not null,
  listing_id bigint not null,
  feature_id bigint not null,
  enabled boolean default true,
  created_at timestamp with time zone default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone default CURRENT_TIMESTAMP,
  constraint listing_safety_details_listing_id_feature_id_key UNIQUE (listing_id, feature_id),
  constraint listing_safety_details_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.listing_status (
  listing_status bigint generated by default as identity not null,
  status_name text,
  constraint listing_status_pkey PRIMARY KEY (listing_status)
);

create table if not exists hostiggo_testing_schema.listings (
  listing_id integer not null default nextval('hostiggo_testing_schema.listings_listing_id_seq'::regclass),
  title text not null,
  description text not null,
  price_weekday numeric,
  price_weekend numeric,
  num_guests integer,
  num_bedrooms integer,
  num_beds integer,
  num_bathrooms integer,
  is_active boolean default true,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP,
  host_uuid uuid,
  check_in_time time without time zone,
  check_out_time time without time zone,
  address_line1 text,
  address_line2 text,
  landmark text,
  longitude numeric,
  latitude numeric,
  location_id integer,
  booking_mode text,
  currency text default 'INR'::text,
  lisiting_status bigint default '1'::bigint,
  property_type_id integer,
  stay_type_id integer,
  pincode integer,
  "icalLink" text,
  cancellation_policy text not null default 'moderate'::text,
  source text not null default 'native'::text,
  import_id bigint,
  external_url text,
  external_listing_id text,
  import_confirmed_by_host boolean not null default false,
  min_nights integer,
  max_nights integer,
  strict_partial_refund_percent numeric,
  search_vector tsvector,
  delist_requested_at timestamp with time zone,
  delist_requested_by uuid,
  delist_reason text,
  delisted_at timestamp with time zone,
  constraint listings_pkey PRIMARY KEY (listing_id)
);

create table if not exists hostiggo_testing_schema.locations (
  location_id integer not null default nextval('hostiggo_testing_schema.locations_location_id_seq'::regclass),
  state text not null,
  district text not null,
  lower_division_name text not null,
  lower_division_type text not null,
  pincode text not null,
  search_vector tsvector generated always as (to_tsvector('english'::regconfig, ((((COALESCE(state, ''::text) || ' '::text) || COALESCE(district, ''::text)) || ' '::text) || COALESCE(lower_division_name, ''::text)))) stored,
  constraint locations_state_district_lower_division_name_lower_division_key UNIQUE (state, district, lower_division_name, lower_division_type, pincode),
  constraint locations_pkey PRIMARY KEY (location_id)
);

create table if not exists hostiggo_testing_schema.login_events (
  id bigint generated by default as identity not null,
  user_id uuid not null,
  method text not null,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  constraint login_events_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.manual_settlement_flags (
  id bigint generated by default as identity not null,
  booking_id integer not null,
  reason text not null,
  flagged_at timestamp with time zone not null default now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  constraint manual_settlement_flags_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.message_log (
  id bigint not null default nextval('hostiggo_testing_schema.message_log_id_seq'::regclass),
  to_number text not null,
  template_name text not null,
  language_code text,
  status text not null,
  twilio_sid text,
  error text,
  context jsonb default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  retry_count integer default 0,
  updated_at timestamp with time zone default now(),
  constraint message_log_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.notification_preferences (
  user_id uuid not null,
  channels jsonb not null default '{"push": true, "email": true, "in_app": true}'::jsonb,
  categories jsonb not null default '{"account": true, "bookings": true, "marketing": false}'::jsonb,
  updated_at timestamp with time zone not null default now(),
  constraint notification_preferences_pkey PRIMARY KEY (user_id)
);

create table if not exists hostiggo_testing_schema.notification_templates (
  id text not null,
  name text not null,
  title_template text not null,
  body_template text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint notification_templates_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.notifications (
  id bigint generated always as identity not null,
  user_id uuid not null,
  title text not null,
  message text not null,
  type text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamp with time zone not null default now(),
  template_id text,
  constraint notifications_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.pan_verifications (
  id bigint generated always as identity not null,
  kyc_request_id bigint not null,
  pan_number_masked text,
  full_name text,
  pan_status text,
  pan_status_desc text,
  aadhaar_seeding_status text,
  is_valid boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint pan_verifications_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.passport_verifications (
  id bigint generated always as identity not null,
  kyc_request_id bigint not null,
  file_number_masked text,
  passport_number_masked text,
  full_name text,
  dob text,
  nationality text,
  is_valid boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint passport_verifications_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.payment (
  payment_id integer not null,
  booking_id integer,
  amount numeric,
  comission numeric,
  host_payout numeric,
  gst_amount numeric,
  transaction_time timestamp without time zone default CURRENT_TIMESTAMP,
  payment_gatway_id integer,
  constraint payment_pkey PRIMARY KEY (payment_id)
);

create table if not exists hostiggo_testing_schema.payment_gateways (
  payment_gatway_id integer not null,
  name text,
  description text,
  constraint payment_gateways_name_key UNIQUE (name),
  constraint payment_gateways_pkey PRIMARY KEY (payment_gatway_id)
);

create table if not exists hostiggo_testing_schema.payout_items (
  payout_item_id uuid not null default gen_random_uuid(),
  payout_id uuid,
  booking_id integer,
  host_amount numeric not null,
  commission numeric,
  gst numeric,
  constraint payout_items_booking_uniq UNIQUE (booking_id),
  constraint payout_items_pkey PRIMARY KEY (payout_item_id)
);

create table if not exists hostiggo_testing_schema.payouts (
  payout_id uuid not null default gen_random_uuid(),
  host_id uuid not null,
  total_amount numeric not null,
  payout_date timestamp without time zone default now(),
  status hostiggo_testing_schema.payout_status default 'processing'::hostiggo_testing_schema.payout_status,
  payment_gateway_id integer,
  reference_id text,
  constraint payouts_pkey PRIMARY KEY (payout_id)
);

create table if not exists hostiggo_testing_schema.pricing_rules (
  id integer not null,
  gst_rate numeric,
  commission_rate numeric,
  constraint pricing_rules_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.property_types (
  id integer not null default nextval('hostiggo_testing_schema.property_types_id_seq'::regclass),
  type_id text not null,
  name text not null,
  description text,
  icon text,
  category text,
  constraint property_types_type_id_key UNIQUE (type_id),
  constraint property_types_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.razorpay_webhook_events (
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  error text,
  constraint razorpay_webhook_events_pkey PRIMARY KEY (event_id)
);

create table if not exists hostiggo_testing_schema.review (
  review_id integer not null default nextval('hostiggo_testing_schema.review_review_id_seq'::regclass),
  listing_id integer,
  rating integer default 1,
  comment text,
  reviewd_at timestamp without time zone default CURRENT_TIMESTAMP,
  user_id uuid,
  constraint review_pkey PRIMARY KEY (review_id),
  constraint review_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

create table if not exists hostiggo_testing_schema.safety_features (
  feature_id bigint generated always as identity not null,
  name character varying(255) not null,
  icon character varying(100),
  description text,
  created_at timestamp with time zone default CURRENT_TIMESTAMP,
  constraint safety_features_pkey PRIMARY KEY (feature_id)
);

create table if not exists hostiggo_testing_schema.state_language_map (
  state text not null,
  language_code text not null,
  constraint state_language_map_pkey PRIMARY KEY (state)
);

create table if not exists hostiggo_testing_schema.stay_types (
  id integer not null default nextval('hostiggo_testing_schema.stay_types_id_seq'::regclass),
  type_id text not null,
  title text not null,
  description text,
  logo_url text,
  constraint stay_types_type_id_key UNIQUE (type_id),
  constraint stay_types_pkey PRIMARY KEY (id)
);

create table if not exists hostiggo_testing_schema.users (
  name text not null,
  email text,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  phone character varying,
  age integer,
  is_active boolean default true,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP,
  profile_pic_url text,
  is_verified boolean,
  emergency_contact character varying,
  user_id uuid not null default gen_random_uuid(),
  email_notifications boolean not null default true,
  sms_alerts boolean not null default true,
  promo_notifications boolean not null default false,
  host_message_notifications boolean not null default true,
  show_profile_to_hosts boolean not null default true,
  include_in_search boolean not null default true,
  activity_status boolean not null default true,
  constraint users_pkey PRIMARY KEY (user_id)
);

create table if not exists hostiggo_testing_schema.video_verification (
  video_id uuid,
  video text,
  created_at timestamp with time zone
);

create table if not exists hostiggo_testing_schema.video_verification_table (
  verification_id uuid,
  host_name text,
  "full address" text,
  video_id uuid,
  created_at timestamp with time zone,
  verified boolean,
  listing_id integer
);

create table if not exists hostiggo_testing_schema.wishlists (
  user_id uuid not null,
  listing_id bigint not null,
  created_at timestamp with time zone default now(),
  category_id uuid not null,
  constraint wishlists_pkey PRIMARY KEY (user_id, listing_id, category_id)
);

-- Tie serial sequences to their columns so they drop with the table.
alter sequence hostiggo_testing_schema.addons_addon_id_seq owned by hostiggo_testing_schema.addons.addon_id;
alter sequence hostiggo_testing_schema.amenities_amenity_id_seq owned by hostiggo_testing_schema.amenities.amenity_id;
alter sequence hostiggo_testing_schema.bookings_booking_id_seq owned by hostiggo_testing_schema.bookings.booking_id;
alter sequence hostiggo_testing_schema.feedback_id_seq owned by hostiggo_testing_schema.feedback.id;
alter sequence hostiggo_testing_schema.listing_addons_id_seq owned by hostiggo_testing_schema.listing_addons.id;
alter sequence hostiggo_testing_schema.listing_addresses_address_id_seq owned by hostiggo_testing_schema.listing_addresses.address_id;
alter sequence hostiggo_testing_schema.listing_bedrooms_id_seq owned by hostiggo_testing_schema.listing_bedrooms.id;
alter sequence hostiggo_testing_schema.listing_calendar_calendar_id_seq owned by hostiggo_testing_schema.listing_calendar.calendar_id;
alter sequence hostiggo_testing_schema.listing_discounts_id_seq owned by hostiggo_testing_schema.listing_discounts.id;
alter sequence hostiggo_testing_schema.listings_listing_id_seq owned by hostiggo_testing_schema.listings.listing_id;
alter sequence hostiggo_testing_schema.locations_location_id_seq owned by hostiggo_testing_schema.locations.location_id;
alter sequence hostiggo_testing_schema.message_log_id_seq owned by hostiggo_testing_schema.message_log.id;
alter sequence hostiggo_testing_schema.property_types_id_seq owned by hostiggo_testing_schema.property_types.id;
alter sequence hostiggo_testing_schema.review_review_id_seq owned by hostiggo_testing_schema.review.review_id;
alter sequence hostiggo_testing_schema.stay_types_id_seq owned by hostiggo_testing_schema.stay_types.id;

-- ---------------------------------------------------------------------------
-- 5. Foreign keys (guarded so a re-run is a no-op)
--    Rows that pre-date a constraint are kept: those were created NOT VALID.
-- ---------------------------------------------------------------------------
do $$ begin alter table hostiggo_testing_schema.aadhaar_kyc add constraint aadhaar_kyc_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.bank_verifications add constraint bank_verifications_kyc_request_id_fkey FOREIGN KEY (kyc_request_id) REFERENCES hostiggo_testing_schema.kyc_requests(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.booking_addons add constraint booking_addons_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES hostiggo_testing_schema.bookings(booking_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.bookings add constraint bookings_host_uuid_fkey FOREIGN KEY (host_uuid) REFERENCES hostiggo_testing_schema.host(host_uuid); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.bookings add constraint bookings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.bookings add constraint bookings_status_id_fkey FOREIGN KEY (status_id) REFERENCES hostiggo_testing_schema.booking_status(status_id) ON UPDATE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.bookings add constraint bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.calendar_events add constraint calendar_events_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES hostiggo_testing_schema.calendars(calendar_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.categories add constraint categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.chat_messages add constraint chat_messages_host_id_fkey FOREIGN KEY (host_id) REFERENCES hostiggo_testing_schema.users(user_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.chat_messages add constraint chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES hostiggo_testing_schema.users(user_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.chat_moderation add constraint chat_moderation_user_id_fkey FOREIGN KEY (user_id) REFERENCES hostiggo_testing_schema.users(user_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.fcm_tokens add constraint fcm_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.feedback add constraint feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES hostiggo_testing_schema.users(user_id) ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.host add constraint host_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.host_payout_methods add constraint host_payout_methods_host_uuid_fkey FOREIGN KEY (host_uuid) REFERENCES hostiggo_testing_schema.host(host_uuid) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.kyc_requests add constraint kyc_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_addons add constraint listing_addons_addon_fk FOREIGN KEY (addon_id) REFERENCES hostiggo_testing_schema.addons(addon_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_addons add constraint listing_addons_listing_fk FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_amenities add constraint listing_amenities_amenity_id_fkey FOREIGN KEY (amenity_id) REFERENCES hostiggo_testing_schema.amenities(amenity_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_amenities add constraint listing_amenities_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_bedrooms add constraint listing_bedrooms_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_calendar add constraint fk_listing FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_discounts add constraint listing_discounts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_house_rules add constraint listing_house_rules_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_ical_feeds add constraint listing_ical_feeds_import_id_fkey FOREIGN KEY (import_id) REFERENCES hostiggo_testing_schema.listing_imports(import_id) ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_imports add constraint listing_imports_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES hostiggo_testing_schema.import_batches(batch_id) ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_imports add constraint listing_imports_listing_fk FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE SET NULL NOT VALID; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_media add constraint listing_media_import_fk FOREIGN KEY (import_id) REFERENCES hostiggo_testing_schema.listing_imports(import_id) ON DELETE SET NULL NOT VALID; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_media add constraint listing_media_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_safety add constraint listing_safety_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_safety_details add constraint listing_safety_details_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES hostiggo_testing_schema.safety_features(feature_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listing_safety_details add constraint listing_safety_details_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listings add constraint fk_listing_location FOREIGN KEY (location_id) REFERENCES hostiggo_testing_schema.locations(location_id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listings add constraint listings_host_uuid_fkey FOREIGN KEY (host_uuid) REFERENCES hostiggo_testing_schema.host(host_uuid); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listings add constraint listings_import_fk FOREIGN KEY (import_id) REFERENCES hostiggo_testing_schema.listing_imports(import_id) ON DELETE SET NULL NOT VALID; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listings add constraint listings_lisiting_status_fkey FOREIGN KEY (lisiting_status) REFERENCES hostiggo_testing_schema.listing_status(listing_status); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listings add constraint listings_property_type_fk FOREIGN KEY (property_type_id) REFERENCES hostiggo_testing_schema.property_types(id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.listings add constraint listings_stay_type_fk FOREIGN KEY (stay_type_id) REFERENCES hostiggo_testing_schema.stay_types(id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.login_events add constraint login_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES hostiggo_testing_schema.users(user_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.manual_settlement_flags add constraint manual_settlement_flags_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES hostiggo_testing_schema.bookings(booking_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.notification_preferences add constraint notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.notifications add constraint notifications_template_id_fkey FOREIGN KEY (template_id) REFERENCES hostiggo_testing_schema.notification_templates(id) ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.pan_verifications add constraint pan_verifications_kyc_request_id_fkey FOREIGN KEY (kyc_request_id) REFERENCES hostiggo_testing_schema.kyc_requests(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.passport_verifications add constraint passport_verifications_kyc_request_id_fkey FOREIGN KEY (kyc_request_id) REFERENCES hostiggo_testing_schema.kyc_requests(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.payout_items add constraint payout_items_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES hostiggo_testing_schema.bookings(booking_id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.payout_items add constraint payout_items_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES hostiggo_testing_schema.payouts(payout_id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.payouts add constraint payouts_host_id_fkey FOREIGN KEY (host_id) REFERENCES hostiggo_testing_schema.host(host_uuid) NOT VALID; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.review add constraint review_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id); exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.review add constraint review_user_id_fkey FOREIGN KEY (user_id) REFERENCES hostiggo_testing_schema.users(user_id) ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.wishlists add constraint wishlist_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES hostiggo_testing_schema.listings(listing_id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.wishlists add constraint wishlists_category_id_fkey FOREIGN KEY (category_id) REFERENCES hostiggo_testing_schema.categories(id) ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table hostiggo_testing_schema.wishlists add constraint wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 6. Indexes (those not already created by a primary key / unique constraint)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_aadhaar_kyc_hash ON hostiggo_testing_schema.aadhaar_kyc USING btree (aadhaar_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aadhaar_kyc_user_id ON hostiggo_testing_schema.aadhaar_kyc USING btree (user_id);
CREATE INDEX IF NOT EXISTS admin_alerts_created_at_idx ON hostiggo_testing_schema.admin_alerts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_alerts_unresolved_idx ON hostiggo_testing_schema.admin_alerts USING btree (category, created_at DESC) WHERE (resolved_at IS NULL);
CREATE INDEX IF NOT EXISTS booking_addons_booking_id_idx ON hostiggo_testing_schema.booking_addons USING btree (booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_invoice_number_uniq ON hostiggo_testing_schema.bookings USING btree (invoice_number) WHERE (invoice_number IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_razorpay_order_id_uniq ON hostiggo_testing_schema.bookings USING btree (razorpay_order_id) WHERE (razorpay_order_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS bookings_razorpay_payment_id_idx ON hostiggo_testing_schema.bookings USING btree (razorpay_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_razorpay_payment_id_uniq ON hostiggo_testing_schema.bookings USING btree (razorpay_payment_id) WHERE (razorpay_payment_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS bookings_razorpay_transfer_id_idx ON hostiggo_testing_schema.bookings USING btree (razorpay_transfer_id);
CREATE INDEX IF NOT EXISTS fcm_tokens_token_idx ON hostiggo_testing_schema.fcm_tokens USING btree (token);
CREATE INDEX IF NOT EXISTS fcm_tokens_user_updated_idx ON hostiggo_testing_schema.fcm_tokens USING btree (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_chat_history ON hostiggo_testing_schema.chat_messages USING btree (user_id, host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_user_uuid ON hostiggo_testing_schema.chat_moderation USING btree (user_id);
CREATE INDEX IF NOT EXISTS host_payout_methods_host_uuid_idx ON hostiggo_testing_schema.host_payout_methods USING btree (host_uuid);
CREATE INDEX IF NOT EXISTS idx_kyc_requests_user_id ON hostiggo_testing_schema.kyc_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_listing_calendar_listing_date ON hostiggo_testing_schema.listing_calendar USING btree (listing_id, date);
CREATE INDEX IF NOT EXISTS idx_listing_house_rules_listing_id ON hostiggo_testing_schema.listing_house_rules USING btree (listing_id);
CREATE INDEX IF NOT EXISTS listing_imports_batch_idx ON hostiggo_testing_schema.listing_imports USING btree (batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS listing_imports_dedupe_idx ON hostiggo_testing_schema.listing_imports USING btree (provider, external_listing_id) WHERE ((external_listing_id IS NOT NULL) AND (status <> 'failed'::text));
CREATE INDEX IF NOT EXISTS listing_imports_host_idx ON hostiggo_testing_schema.listing_imports USING btree (host_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_imports_status_created_idx ON hostiggo_testing_schema.listing_imports USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS idx_listing_media_cover ON hostiggo_testing_schema.listing_media USING btree (listing_id) WHERE (is_cover = true);
CREATE INDEX IF NOT EXISTS idx_listing_media_listing_id ON hostiggo_testing_schema.listing_media USING btree (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_safety_details_feature_id ON hostiggo_testing_schema.listing_safety_details USING btree (feature_id);
CREATE INDEX IF NOT EXISTS idx_listing_safety_details_listing_id ON hostiggo_testing_schema.listing_safety_details USING btree (listing_id);
CREATE INDEX IF NOT EXISTS idx_listings_price_guests_active ON hostiggo_testing_schema.listings USING btree (price_weekday, num_guests, is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_listings_search_vector ON hostiggo_testing_schema.listings USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_listings_state_active_id ON hostiggo_testing_schema.listings USING btree (location_id, is_active, listing_id) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS listings_pending_delist_idx ON hostiggo_testing_schema.listings USING btree (delist_requested_at) WHERE ((delist_requested_at IS NOT NULL) AND (delisted_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_location_state_district ON hostiggo_testing_schema.locations USING btree (state, district);
CREATE INDEX IF NOT EXISTS idx_locations_search_vector ON hostiggo_testing_schema.locations USING gin (search_vector);
CREATE INDEX IF NOT EXISTS login_events_user_id_created_at_idx ON hostiggo_testing_schema.login_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS manual_settlement_flags_booking_id_idx ON hostiggo_testing_schema.manual_settlement_flags USING btree (booking_id);
CREATE INDEX IF NOT EXISTS message_log_created_at_idx ON hostiggo_testing_schema.message_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS message_log_status_created_idx ON hostiggo_testing_schema.message_log USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS message_log_status_idx ON hostiggo_testing_schema.message_log USING btree (status);
CREATE INDEX IF NOT EXISTS message_log_template_idx ON hostiggo_testing_schema.message_log USING btree (template_name);
CREATE INDEX IF NOT EXISTS message_log_to_number_idx ON hostiggo_testing_schema.message_log USING btree (to_number);
CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx ON hostiggo_testing_schema.notification_preferences USING btree (user_id);
CREATE INDEX IF NOT EXISTS notifications_template_id_idx ON hostiggo_testing_schema.notifications USING btree (template_id);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON hostiggo_testing_schema.notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON hostiggo_testing_schema.notifications USING btree (user_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Views
-- ---------------------------------------------------------------------------
create or replace view hostiggo_testing_schema.arrival_reminder_view as
 SELECT b.booking_id,
    b.host_uuid,
    b.reminder_call_sent,
    u.phone,
    b.start_date::timestamp without time zone + lhr.check_in_time::interval AS checkin_datetime
   FROM hostiggo_testing_schema.bookings b
     JOIN hostiggo_testing_schema.listing_house_rules lhr ON b.listing_id = lhr.listing_id
     JOIN hostiggo_testing_schema.host h ON b.host_uuid = h.host_uuid
     JOIN hostiggo_testing_schema.users u ON h.user_id = u.user_id;

create or replace view hostiggo_testing_schema.listing_search_view as
 SELECT l.listing_id,
    l.title,
    l.description,
    l.price_weekday,
    l.price_weekend,
    l.num_guests,
    l.num_bedrooms,
    l.num_beds,
    l.num_bathrooms,
    l.is_active,
    l.created_at,
    l.updated_at,
    l.host_uuid,
    l.check_in_time,
    l.check_out_time,
    l.address_line1,
    l.address_line2,
    l.landmark,
    l.longitude,
    l.latitude,
    l.location_id,
    l.booking_mode,
    l.currency,
    l.lisiting_status,
    l.property_type_id,
    l.stay_type_id,
    l.pincode,
    loc.state,
    loc.district,
    COALESCE(avg(r.rating), 0::numeric) AS avg_rating,
    count(r.rating) AS review_count,
    array_agg(DISTINCT a.name) AS amenity_names,
    array_agg(DISTINCT a.amenity_id) AS amenity_ids,
    ( SELECT m.media_url
           FROM hostiggo_testing_schema.listing_media m
          WHERE m.listing_id = l.listing_id AND m.is_cover = true
         LIMIT 1) AS cover_image_url,
    pt.type_id AS property_type_type_id,
    pt.name AS property_type_name,
    pt.description AS property_type_description,
    pt.icon AS property_type_icon,
    pt.category AS property_type_category,
    st.type_id AS stay_type_type_id,
    st.title AS stay_type_title,
    st.description AS stay_type_description,
    ls.listing_status AS listing_status_id,
    ls.status_name AS listing_status_name
   FROM hostiggo_testing_schema.listings l
     LEFT JOIN hostiggo_testing_schema.locations loc ON l.location_id = loc.location_id
     LEFT JOIN hostiggo_testing_schema.review r ON l.listing_id = r.listing_id
     LEFT JOIN hostiggo_testing_schema.listing_amenities la ON l.listing_id = la.listing_id
     LEFT JOIN hostiggo_testing_schema.amenities a ON la.amenity_id = a.amenity_id
     LEFT JOIN hostiggo_testing_schema.property_types pt ON l.property_type_id = pt.id
     LEFT JOIN hostiggo_testing_schema.stay_types st ON l.stay_type_id = st.id
     LEFT JOIN hostiggo_testing_schema.listing_status ls ON l.lisiting_status = ls.listing_status
  GROUP BY l.listing_id, loc.state, loc.district, pt.type_id, pt.name, pt.description, pt.icon, pt.category, st.type_id, st.title, st.description, ls.listing_status, ls.status_name;

create or replace view hostiggo_testing_schema.user_bookings_detailed as
 SELECT b.booking_id,
    b.user_id,
    b.start_date,
    b.end_date,
    b.num_adults,
    b.num_children,
    bs.status_name,
    lsv.title AS listing_title,
    lsv.avg_rating,
    lsv.amenity_names,
    lsv.cover_image_url AS cover_photo_url,
    ( SELECT array_agg(listing_media.media_url) AS array_agg
           FROM hostiggo_testing_schema.listing_media
          WHERE listing_media.listing_id = b.listing_id) AS all_media_urls,
        CASE
            WHEN bs.status_name::text = 'CANCELLED'::text THEN 'cancelled'::text
            WHEN bs.status_name::text = 'CONFIRMED'::text AND b.end_date <= CURRENT_DATE THEN 'completed'::text
            WHEN bs.status_name::text = 'CONFIRMED'::text AND b.end_date > CURRENT_DATE THEN 'upcoming'::text
            ELSE 'cancelled'::text
        END AS booking_label
   FROM hostiggo_testing_schema.bookings b
     JOIN hostiggo_testing_schema.booking_status bs ON b.status_id = bs.status_id
     JOIN hostiggo_testing_schema.listing_search_view lsv ON b.listing_id = lsv.listing_id;

-- ---------------------------------------------------------------------------
-- 8. Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end $function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

-- Calendar integrity -------------------------------------------------------
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.calendar_day_available(p_listing_id integer, p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.ensure_listing_calendar(p_listing_id integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.recalculate_calendar_days(p_listing_id integer, p_dates date[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.refresh_booking_calendar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.guard_booking_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.set_host_calendar_dates(p_listing_id integer, p_dates date[], p_is_available boolean, p_price numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(p_listing_id integer, p_dates date[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.get_listing_booked_dates(p_listing_id integer, p_start date, p_end date)
 RETURNS TABLE(listing_id integer, start_date date, end_date date, status_id integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
  select b.listing_id, b.start_date, b.end_date, b.status_id
  from hostiggo_testing_schema.bookings b
  where b.listing_id = p_listing_id
    and b.status_id <> 3
    and b.start_date <= p_end
    and b.end_date >= p_start
  order by b.start_date asc;
$function$;

-- Notifications -----------------------------------------------------------
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.notification_in_app_enabled(p_user_id uuid, p_category text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
  select coalesce(
    (
      select coalesce((np.channels->>'in_app')::boolean, true)
         and coalesce((np.categories->>p_category)::boolean, true)
      from hostiggo_testing_schema.notification_preferences np
      where np.user_id = p_user_id
    ),
    true
  );
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.create_notification(p_user_id uuid, p_title text, p_message text, p_type text, p_metadata jsonb DEFAULT '{}'::jsonb, p_template_id text DEFAULT NULL::text, p_category text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
declare
  v_id bigint;
begin
  if p_user_id is null then
    return null;
  end if;

  if p_category is not null
     and not hostiggo_testing_schema.notification_in_app_enabled(p_user_id, p_category) then
    return null;
  end if;

  insert into hostiggo_testing_schema.notifications
    (user_id, title, message, type, metadata, template_id)
  values
    (p_user_id, p_title, p_message, p_type, coalesce(p_metadata, '{}'::jsonb), p_template_id)
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.enqueue_wishlist_nudges(p_min_age interval DEFAULT '3 days'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select w.user_id, w.listing_id, l.title
      from hostiggo_testing_schema.wishlists w
      join hostiggo_testing_schema.listings l on l.listing_id = w.listing_id
     where w.created_at < now() - p_min_age
       and l.is_active is true
       and not exists (
         select 1 from hostiggo_testing_schema.bookings b
          where b.user_id = w.user_id and b.listing_id = w.listing_id and b.status_id = 2
       )
       and not exists (
         select 1 from hostiggo_testing_schema.notifications n
          where n.user_id = w.user_id and n.type = 'wishlist_nudge'
            and (n.metadata->>'property_id') = w.listing_id::text
            and n.created_at > now() - interval '7 days'
       )
  loop
    perform hostiggo_testing_schema.create_notification(
      r.user_id, 'Still thinking about it?',
      'Still thinking about ' || coalesce(nullif(trim(r.title), ''), 'this property') || '? Book soon before the dates fill up!',
      'wishlist_nudge',
      jsonb_build_object('property_id', r.listing_id, 'listing_id', r.listing_id, 'source', 'scheduled'),
      'wishlist_nudge');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.tg_notify_on_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
declare
  v_guest_name    text;
  v_listing_title text;
  v_host_user     uuid;
  v_meta          jsonb;
begin
  select coalesce(nullif(trim(u.name), ''), 'A guest') into v_guest_name
    from hostiggo_testing_schema.users u where u.user_id = NEW.user_id;
  select coalesce(nullif(trim(l.title), ''), 'your property') into v_listing_title
    from hostiggo_testing_schema.listings l where l.listing_id = NEW.listing_id;
  select h.user_id into v_host_user
    from hostiggo_testing_schema.host h where h.host_uuid = NEW.host_uuid;

  v_meta := jsonb_build_object(
    'booking_id', NEW.booking_id, 'property_id', NEW.listing_id, 'listing_id', NEW.listing_id,
    'start_date', NEW.start_date, 'end_date', NEW.end_date
  );

  if v_host_user is not null then
    perform hostiggo_testing_schema.create_notification(
      v_host_user, 'New Booking Received!',
      coalesce(v_guest_name, 'A guest') || ' has booked ' || coalesce(v_listing_title, 'your property') || '.',
      'booking_host', v_meta || jsonb_build_object('role', 'host'), 'booking_received_host');
  end if;

  if NEW.user_id is not null then
    perform hostiggo_testing_schema.create_notification(
      NEW.user_id, 'Booking Confirmed!',
      'You''re booked for ' || coalesce(v_listing_title, 'your stay') || '.',
      'booking_guest', v_meta || jsonb_build_object('role', 'guest'), 'booking_confirmed_guest');
  end if;

  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.tg_notify_on_booking_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
declare v_host_user uuid; v_meta jsonb;
begin
  select h.user_id into v_host_user from host h where h.host_uuid = NEW.host_uuid;
  v_meta := jsonb_build_object('booking_id', NEW.booking_id, 'listing_id', NEW.listing_id);

  if NEW.status_id = 3 and OLD.status_id is distinct from 3 then
    if NEW.user_id is not null then
      perform create_notification(NEW.user_id, 'Booking cancelled', 'Your booking has been cancelled.',
        'booking_guest', v_meta || '{"role":"guest"}', 'booking_cancelled_guest');
    end if;
    if v_host_user is not null then
      perform create_notification(v_host_user, 'Booking cancelled', 'A guest cancelled their booking.',
        'booking_host', v_meta || '{"role":"host"}', 'booking_cancelled_host');
    end if;
  end if;

  if NEW.refund_status is distinct from OLD.refund_status
     and NEW.refund_status in ('processed', 'initiated') and NEW.user_id is not null then
    perform create_notification(NEW.user_id, 'Refund initiated',
      'Your refund is on its way to your original payment method.',
      'booking_guest', v_meta || '{"role":"guest"}', 'refund_processed_guest');
  end if;

  if NEW.transfer_status is distinct from OLD.transfer_status and v_host_user is not null then
    if NEW.transfer_status = 'processed' then
      perform create_notification(v_host_user, 'Payout on the way',
        'Your share of a booking was transferred to your bank account.',
        'booking_host', v_meta || '{"role":"host"}', 'payout_sent_host');
    elsif NEW.transfer_status = 'failed' then
      perform create_notification(v_host_user, 'Payout needs attention',
        'We could not transfer a payout. Please check your payout details.',
        'booking_host', v_meta || '{"role":"host"}', 'payout_failed_host');
    end if;
  end if;
  return NEW;
exception when others then
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.tg_notify_on_host_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
declare
  v_host_user     uuid;
  v_listing_count integer;
begin
  if NEW.host_uuid is null then return NEW; end if;

  select h.user_id into v_host_user
    from hostiggo_testing_schema.host h where h.host_uuid = NEW.host_uuid;
  if v_host_user is null then return NEW; end if;

  select count(*) into v_listing_count
    from hostiggo_testing_schema.listings l where l.host_uuid = NEW.host_uuid;

  if v_listing_count = 1 and not exists (
    select 1 from hostiggo_testing_schema.notifications n
     where n.user_id = v_host_user and n.type = 'host_onboarding'
  ) then
    perform hostiggo_testing_schema.create_notification(
      v_host_user, 'Welcome to Hostiggo Hosting!',
      'Your host account is active. Start receiving guest bookings.',
      'host_onboarding',
      jsonb_build_object(
        'listing_id', NEW.listing_id, 'property_id', NEW.listing_id,
        'actions', jsonb_build_array(
          jsonb_build_object('label', 'Complete your listing', 'route', '/edit-listing', 'params', jsonb_build_object('listing_id', NEW.listing_id)),
          jsonb_build_object('label', 'Manage bookings', 'route', '/(tabs)/bookings')
        )
      ),
      'host_onboarded');
  end if;

  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.tg_notify_on_wishlist_add()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
declare
  v_title text;
begin
  select coalesce(nullif(trim(l.title), ''), 'this property') into v_title
    from hostiggo_testing_schema.listings l where l.listing_id = NEW.listing_id;

  if exists (
    select 1 from hostiggo_testing_schema.notifications n
     where n.user_id = NEW.user_id and n.type = 'wishlist_nudge'
       and (n.metadata->>'property_id') = NEW.listing_id::text
       and n.created_at > now() - interval '24 hours'
  ) then
    return NEW;
  end if;

  perform hostiggo_testing_schema.create_notification(
    NEW.user_id, 'Still thinking about it?',
    'Still thinking about ' || v_title || '? Book soon before the dates fill up!',
    'wishlist_nudge',
    jsonb_build_object('property_id', NEW.listing_id, 'listing_id', NEW.listing_id),
    'wishlist_nudge');

  return NEW;
end;
$function$;

-- Bookings guards ---------------------------------------------------------
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.tg_guard_paid_booking_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if NEW.status_id = 3
     and OLD.status_id is distinct from 3
     and OLD.razorpay_payment_id is not null
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'Paid bookings must be cancelled through the refund flow.'
      using errcode = '42501';
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.try_lock_booking_cancellation(p_booking_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
begin
  return pg_try_advisory_xact_lock(hashtext('booking_cancel:' || p_booking_id::text));
end;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.process_pending_delistings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
declare
  n integer;
begin
  update hostiggo_testing_schema.listings l
     set is_active = false,
         lisiting_status = 3,
         delisted_at = now(),
         updated_at = now()
   where l.delist_requested_at is not null
     and l.delisted_at is null
     and l.delist_requested_at <= now() - interval '24 hours'
     and not exists (
       select 1
         from hostiggo_testing_schema.bookings b
        where b.listing_id = l.listing_id
          and coalesce(b.status_id, 0) <> 3
          and b.end_date >= current_date
     );
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- Search --------------------------------------------------------------------
-- FIX: pinned search_path (it used unqualified table names, so it only worked
-- when called from a trigger that had set one).
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.refresh_listing_search_vector(p_listing_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
BEGIN
  UPDATE listings l
  SET search_vector = sub.vec
  FROM (
    SELECT
      l2.listing_id,
      setweight(to_tsvector('english', coalesce(l2.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(l2.description, '')), 'B') ||
      setweight(to_tsvector('english',
        coalesce(pt.name, '') || ' ' || coalesce(st.title, '') || ' ' ||
        coalesce(loc.district, '') || ' ' || coalesce(loc.state, '') || ' ' ||
        coalesce(loc.lower_division_name, '')
      ), 'C') ||
      setweight(to_tsvector('english',
        coalesce(l2.address_line1, '') || ' ' || coalesce(l2.address_line2, '') || ' ' ||
        coalesce(l2.landmark, '') || ' ' || coalesce(am.amenity_names, '')
      ), 'D') AS vec
    FROM listings l2
    LEFT JOIN property_types pt ON pt.id = l2.property_type_id
    LEFT JOIN stay_types st ON st.id = l2.stay_type_id
    LEFT JOIN locations loc ON loc.location_id = l2.location_id
    LEFT JOIN LATERAL (
      SELECT string_agg(a.name, ' ') AS amenity_names
      FROM listing_amenities la JOIN amenities a ON a.amenity_id = la.amenity_id
      WHERE la.listing_id = l2.listing_id
    ) am ON TRUE
    WHERE l2.listing_id = p_listing_id
  ) sub
  WHERE l.listing_id = sub.listing_id;
END;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.listings_search_vector_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
BEGIN
  PERFORM refresh_listing_search_vector(NEW.listing_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.listing_amenities_search_vector_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_listing_search_vector(OLD.listing_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_listing_search_vector(NEW.listing_id);
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.search_text(rec hostiggo_testing_schema.locations)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- COALESCE keeps the whole string from becoming NULL if one column is empty
  SELECT COALESCE(rec.state, '') || ' ' ||
         COALESCE(rec.district, '') || ' ' ||
         COALESCE(rec.lower_division_name, '');
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.search_locations_partial(search_term text)
 RETURNS SETOF hostiggo_testing_schema.locations
 LANGUAGE plpgsql
AS $function$
DECLARE
  safe_query text;
BEGIN
  -- A. Remove punctuation (like commas) that crash to_tsquery
  safe_query := regexp_replace(trim(search_term), '[^\w\s]', '', 'g');

  -- B. Replace spaces with the '&' (AND) operator and add ':*' for partial matching
  -- This transforms "Pune, Mah" into "Pune & Mah:*"
  safe_query := regexp_replace(safe_query, '\s+', ' & ', 'g') || ':*';

  RETURN QUERY
  SELECT l.*
  FROM hostiggo_testing_schema.locations l
  WHERE to_tsvector('english', hostiggo_testing_schema.search_text(l))
        @@ to_tsquery('english', safe_query);
END;
$function$;

-- FIX: SELECT room_type FROM listings failed (no such column). Property-type
-- names in use are the room types the filter UI offers.
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.get_unique_room_types()
 RETURNS TABLE(room_type text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT DISTINCT pt.name::text
  FROM hostiggo_testing_schema.property_types pt
  JOIN hostiggo_testing_schema.listings l ON l.property_type_id = pt.id
  WHERE pt.name IS NOT NULL
  ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.search_listing_box(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_state text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_min_price numeric DEFAULT NULL::numeric, p_max_price numeric DEFAULT NULL::numeric, p_total_guests integer DEFAULT NULL::integer, p_ratings integer[] DEFAULT '{}'::integer[], p_amenities integer[] DEFAULT '{}'::integer[], p_roomtypes text[] DEFAULT '{}'::text[], p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_num_rooms integer DEFAULT NULL::integer)
 RETURNS TABLE(listing hostiggo_testing_schema.listing_search_view, distance double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN

  RETURN QUERY
  SELECT
    sub.v,
    sub.distance
  FROM (
    SELECT
      v,
      -- Calculate Distance
      CASE
        WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
          ST_Distance(
            ST_SetSRID(ST_MakePoint(v.longitude,v.latitude),4326)::geography,
            ST_SetSRID(ST_MakePoint(p_lon,p_lat),4326)::geography
          )
        ELSE NULL
      END AS distance
    FROM hostiggo_testing_schema.listing_search_view v
    WHERE
      v.is_active = true
      AND (p_min_price IS NULL OR v.price_weekday >= p_min_price)
      AND (p_max_price IS NULL OR v.price_weekday <= p_max_price)
      AND (p_total_guests IS NULL OR v.num_guests >= p_total_guests)

      -- Room Type filter
      AND (
        cardinality(p_roomTypes) = 0
        OR v.property_type_name = ANY(p_roomTypes)
      )

      -- Ratings Filter
      AND (
        cardinality(p_ratings) = 0
        OR ARRAY[FLOOR(v.avg_rating)::integer] && p_ratings
      )

      -- Amenities Filter (Contains ANY)
      AND (
        cardinality(p_amenities) = 0
        OR v.amenity_ids && p_amenities
      )

      -- Number of Bedrooms Filter (joining raw listings table)
      AND (
        p_num_rooms IS NULL OR
        (SELECT l.num_bedrooms FROM hostiggo_testing_schema.listings l WHERE l.listing_id = v.listing_id) >= p_num_rooms
      )

      -- Availability check (Bookings AND Calendar)
      AND (
        p_start_date IS NULL OR p_end_date IS NULL OR
        (
          -- Check bookings (status_id != 3)
          NOT EXISTS (
            SELECT 1
            FROM hostiggo_testing_schema.bookings b
            WHERE b.listing_id = v.listing_id
              AND b.status_id != 3
              AND b.start_date < p_end_date
              AND b.end_date > p_start_date
          )
          AND
          -- Check listing_calendar (is_available = false)
          NOT EXISTS (
            SELECT 1
            FROM hostiggo_testing_schema.listing_calendar cal
            WHERE cal.listing_id = v.listing_id
              AND cal.is_available = false
              AND cal.date >= p_start_date
              AND cal.date < p_end_date
          )
        )
      )
  ) sub
  WHERE
    CASE
      -- Case 1: Coordinates AND Boundary are provided (Search box with geocoded result)
      -- Returns properties if they are strictly inside the boundary OR if they are within 50km
      WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL AND (p_state IS NOT NULL OR p_district IS NOT NULL) THEN
        ((p_state IS NULL OR (sub.v).state ILIKE '%' || p_state || '%') AND (p_district IS NULL OR (sub.v).district ILIKE '%' || p_district || '%'))
        OR (sub.distance <= 50000)

      -- Case 2: Only Coordinates provided (Map Search)
      WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL AND p_state IS NULL AND p_district IS NULL THEN
        (sub.distance <= 50000)

      -- Case 3: Only Boundary provided
      WHEN (p_lat IS NULL OR p_lon IS NULL) AND (p_state IS NOT NULL OR p_district IS NOT NULL) THEN
        ((p_state IS NULL OR (sub.v).state ILIKE '%' || p_state || '%') AND (p_district IS NULL OR (sub.v).district ILIKE '%' || p_district || '%'))

      -- Case 4: No location filters (Return all)
      ELSE
        TRUE
    END

  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL THEN sub.distance END ASC NULLS LAST,
    (sub.v).listing_id ASC

  LIMIT p_limit
  OFFSET p_offset;

END;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.search_listings(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_state text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_min_price numeric DEFAULT NULL::numeric, p_max_price numeric DEFAULT NULL::numeric, p_total_guests integer DEFAULT NULL::integer, p_ratings integer[] DEFAULT '{}'::integer[], p_amenities integer[] DEFAULT '{}'::integer[], p_roomtypes text[] DEFAULT '{}'::text[], p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS TABLE(listing hostiggo_testing_schema.listing_search_view, distance double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN

  RETURN QUERY
  SELECT
    v,
    CASE
      WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL THEN
        ST_Distance(
          ST_SetSRID(ST_MakePoint(v.longitude,v.latitude),4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lon,p_lat),4326)::geography
        )
      ELSE NULL
    END AS distance

  FROM hostiggo_testing_schema.listing_search_view v

  WHERE
    (p_state IS NULL OR v.state ILIKE p_state)
    AND (p_district IS NULL OR v.district ILIKE p_district)
    AND (p_min_price IS NULL OR v.price_weekday >= p_min_price)
    AND (p_max_price IS NULL OR v.price_weekday <= p_max_price)
    AND (p_total_guests IS NULL OR v.num_guests >= p_total_guests)
    AND (
      cardinality(p_ratings) = 0
      OR ARRAY[FLOOR(v.avg_rating)::integer] && p_ratings
    )
    AND (
      cardinality(p_amenities) = 0
      OR v.amenity_ids && p_amenities
    )

    -- Room type filter
    AND (
      cardinality(p_roomTypes) = 0
      OR v.property_type_name = ANY(p_roomTypes)
    )

    AND (
      p_start_date IS NULL OR p_end_date IS NULL OR
      NOT EXISTS (
        SELECT 1
        FROM hostiggo_testing_schema.bookings b
        WHERE b.listing_id = v.listing_id
          AND b.status_id != 3
          AND b.start_date < p_end_date
          AND b.end_date > p_start_date
      )
    )

  ORDER BY
    CASE
      WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(v.longitude,v.latitude),4326)
           <-> ST_SetSRID(ST_MakePoint(p_lon,p_lat),4326)
    END,
    v.listing_id

  LIMIT p_limit
  OFFSET p_offset;

END;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.search_listings_by_state(p_state text, p_district text DEFAULT NULL::text, p_cursor integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_min_price integer DEFAULT NULL::integer, p_max_price integer DEFAULT NULL::integer, p_total_guests integer DEFAULT NULL::integer, p_ratings integer[] DEFAULT NULL::integer[], p_amenities integer[] DEFAULT NULL::integer[], p_roomtypes text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50)
 RETURNS TABLE(listing jsonb, distance double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    jsonb_build_object(
      'listing_id', l.listing_id,
      'title', l.title,
      'description', l.description,
      'price_weekday', l.price_weekday,
      'price_weekend', l.price_weekend,
      'num_guests', l.num_guests,
      'num_bedrooms', l.num_bedrooms,
      'num_beds', l.num_beds,
      'num_bathrooms', l.num_bathrooms,
      'latitude', l.latitude,
      'longitude', l.longitude,
      'property_type_id', l.property_type_id,
      'stay_type_id', l.stay_type_id,
      'location_id', l.location_id,
      'locations', jsonb_build_object(
        'state', loc.state,
        'district', loc.district
      ),
      'listing_media', (
        SELECT jsonb_agg(jsonb_build_object('media_url', media_url, 'is_cover', is_cover))
        FROM hostiggo_testing_schema.listing_media
        WHERE listing_id = l.listing_id
      ),
      'listing_amenities', (
        SELECT jsonb_agg(jsonb_build_object('amenities', jsonb_build_object('name', a.name)))
        FROM hostiggo_testing_schema.listing_amenities la
        JOIN hostiggo_testing_schema.amenities a ON la.amenity_id = a.amenity_id
        WHERE la.listing_id = l.listing_id
      )
    ) AS listing,
    NULL::FLOAT AS distance
  FROM hostiggo_testing_schema.listings l
  LEFT JOIN hostiggo_testing_schema.locations loc ON l.location_id = loc.location_id
  WHERE
    l.is_active = TRUE
    AND (LOWER(loc.state) = LOWER(p_state) OR p_state IS NULL)
    AND (LOWER(loc.district) = LOWER(p_district) OR p_district IS NULL)
    AND (l.price_weekday >= p_min_price OR p_min_price IS NULL)
    AND (l.price_weekday <= p_max_price OR p_max_price IS NULL)
    AND (l.num_guests >= p_total_guests OR p_total_guests IS NULL)
    AND (p_cursor IS NULL OR l.listing_id > p_cursor)
    AND (
      p_amenities IS NULL
      OR p_amenities = ARRAY[]::INT[]
      OR EXISTS (
        SELECT 1 FROM hostiggo_testing_schema.listing_amenities la
        WHERE la.listing_id = l.listing_id
        AND la.amenity_id = ANY(p_amenities)
      )
    )
  ORDER BY l.listing_id ASC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION hostiggo_testing_schema.search_listings_by_state_count(p_state text, p_district text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_min_price integer DEFAULT NULL::integer, p_max_price integer DEFAULT NULL::integer, p_total_guests integer DEFAULT NULL::integer, p_ratings integer[] DEFAULT NULL::integer[], p_amenities integer[] DEFAULT NULL::integer[], p_roomtypes text[] DEFAULT NULL::text[])
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hostiggo_testing_schema', 'public'
AS $function$
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
$function$;

-- FIX: both overloads returned listing_id as uuid; listings.listing_id is an
-- integer, so every call failed with a type mismatch. A return-type change
-- needs drop + create (nothing in the app calls these today).
DROP FUNCTION IF EXISTS hostiggo_testing_schema.search_nearest_listings(double precision, double precision, integer);
DROP FUNCTION IF EXISTS hostiggo_testing_schema.search_nearest_listings(double precision, double precision, integer, integer);

CREATE FUNCTION hostiggo_testing_schema.search_nearest_listings(p_lat double precision, p_lon double precision, p_limit integer DEFAULT 10)
 RETURNS TABLE(listing_id integer, title text, price_weekday numeric, distance_meters double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
      l.listing_id,
      l.title,
      l.price_weekday,
      ST_Distance(
          ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
      ) AS distance_meters
  FROM hostiggo_testing_schema.listings l
  WHERE l.longitude IS NOT NULL
    AND l.latitude IS NOT NULL
  ORDER BY distance_meters ASC
  LIMIT p_limit;
END;
$function$;

CREATE FUNCTION hostiggo_testing_schema.search_nearest_listings(p_lat double precision, p_lon double precision, p_limit integer, p_offset integer)
 RETURNS TABLE(listing_id integer, title text, price_weekday numeric, distance_meters double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
      l.listing_id,
      l.title,
      l.price_weekday,
      ST_Distance(
          ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
      ) AS distance_meters
  FROM hostiggo_testing_schema.listings l
  WHERE l.longitude IS NOT NULL
    AND l.latitude IS NOT NULL
  ORDER BY distance_meters ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- iCal sync tick (called by pg_cron, see section 13) ------------------------
-- Vercel cron can't go below 1 minute, so pg_cron (>= 1.5 supports "N seconds")
-- calls the site's sync endpoint through pg_net. The endpoint URL and CRON_SECRET
-- are database-level settings, set once by an admin (superuser / SQL editor):
--
--   ALTER DATABASE postgres SET app.ical_sync_url    = 'https://<your-site>/api/cron/ical-sync';
--   ALTER DATABASE postgres SET app.ical_sync_secret = '<same value as CRON_SECRET>';
--
-- Until both are set the tick is a harmless no-op.
CREATE OR REPLACE FUNCTION hostiggo_testing_schema.ical_cron_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- 9. Triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS booking_availability_guard ON hostiggo_testing_schema.bookings;
CREATE TRIGGER booking_availability_guard BEFORE INSERT OR UPDATE OF status_id, start_date, end_date, listing_id ON hostiggo_testing_schema.bookings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.guard_booking_availability();

DROP TRIGGER IF EXISTS booking_calendar_refresh ON hostiggo_testing_schema.bookings;
CREATE TRIGGER booking_calendar_refresh AFTER INSERT OR DELETE OR UPDATE OF status_id, start_date, end_date, listing_id ON hostiggo_testing_schema.bookings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.refresh_booking_calendar();

DROP TRIGGER IF EXISTS tg_guard_paid_booking_cancel ON hostiggo_testing_schema.bookings;
CREATE TRIGGER tg_guard_paid_booking_cancel BEFORE UPDATE ON hostiggo_testing_schema.bookings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.tg_guard_paid_booking_cancel();

DROP TRIGGER IF EXISTS tg_notify_on_booking ON hostiggo_testing_schema.bookings;
CREATE TRIGGER tg_notify_on_booking AFTER INSERT ON hostiggo_testing_schema.bookings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.tg_notify_on_booking();

DROP TRIGGER IF EXISTS tg_notify_on_booking_change ON hostiggo_testing_schema.bookings;
CREATE TRIGGER tg_notify_on_booking_change AFTER UPDATE ON hostiggo_testing_schema.bookings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.tg_notify_on_booking_change();

DROP TRIGGER IF EXISTS trg_listing_amenities_search_vector ON hostiggo_testing_schema.listing_amenities;
CREATE TRIGGER trg_listing_amenities_search_vector AFTER INSERT OR DELETE ON hostiggo_testing_schema.listing_amenities FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.listing_amenities_search_vector_trigger();

DROP TRIGGER IF EXISTS trg_listing_ical_feeds_updated ON hostiggo_testing_schema.listing_ical_feeds;
CREATE TRIGGER trg_listing_ical_feeds_updated BEFORE UPDATE ON hostiggo_testing_schema.listing_ical_feeds FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.set_updated_at();

DROP TRIGGER IF EXISTS trg_listing_imports_updated ON hostiggo_testing_schema.listing_imports;
CREATE TRIGGER trg_listing_imports_updated BEFORE UPDATE ON hostiggo_testing_schema.listing_imports FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.set_updated_at();

DROP TRIGGER IF EXISTS tg_notify_on_host_onboarding ON hostiggo_testing_schema.listings;
CREATE TRIGGER tg_notify_on_host_onboarding AFTER INSERT ON hostiggo_testing_schema.listings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.tg_notify_on_host_onboarding();

DROP TRIGGER IF EXISTS trg_listings_search_vector ON hostiggo_testing_schema.listings;
CREATE TRIGGER trg_listings_search_vector AFTER INSERT OR UPDATE OF title, description, property_type_id, stay_type_id, location_id, address_line1, address_line2, landmark ON hostiggo_testing_schema.listings FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.listings_search_vector_trigger();

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON hostiggo_testing_schema.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at BEFORE UPDATE ON hostiggo_testing_schema.notification_preferences FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_templates_updated_at ON hostiggo_testing_schema.notification_templates;
CREATE TRIGGER trg_notification_templates_updated_at BEFORE UPDATE ON hostiggo_testing_schema.notification_templates FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_notify_on_wishlist_add ON hostiggo_testing_schema.wishlists;
CREATE TRIGGER tg_notify_on_wishlist_add AFTER INSERT ON hostiggo_testing_schema.wishlists FOR EACH ROW EXECUTE FUNCTION hostiggo_testing_schema.tg_notify_on_wishlist_add();

-- ---------------------------------------------------------------------------
-- 10. Function execute grants (mirrors the live, hardened set)
-- ---------------------------------------------------------------------------
-- Owner only: internal helpers and trigger functions.
REVOKE ALL ON FUNCTION hostiggo_testing_schema.calendar_day_available(integer, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.ensure_listing_calendar(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.guard_booking_availability() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.process_pending_delistings() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.recalculate_calendar_days(integer, date[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.refresh_booking_calendar() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.tg_notify_on_booking() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.tg_notify_on_host_onboarding() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.tg_notify_on_wishlist_add() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.ical_cron_tick() FROM PUBLIC, anon, authenticated, service_role;

-- Server (service role) only.
REVOKE ALL ON FUNCTION hostiggo_testing_schema.create_notification(uuid, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.create_notification(uuid, text, text, text, jsonb, text, text) TO service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.enqueue_wishlist_nudges(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.enqueue_wishlist_nudges(interval) TO service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.notification_in_app_enabled(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.notification_in_app_enabled(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(integer, date[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.sync_listing_ical_dates(integer, date[]) TO service_role;

-- Host calendar edits come from the signed-in host (the function checks ownership).
REVOKE ALL ON FUNCTION hostiggo_testing_schema.set_host_calendar_dates(integer, date[], boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.set_host_calendar_dates(integer, date[], boolean, numeric) TO authenticated, service_role;

-- Public availability lookup.
REVOKE ALL ON FUNCTION hostiggo_testing_schema.get_listing_booked_dates(integer, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hostiggo_testing_schema.get_listing_booked_dates(integer, date, date) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Table grants
--     KYC, bank, payout, payment and ops tables are reached only through the
--     server (service role); the browser never touches them, so anon and
--     authenticated get nothing on those. Everything else mirrors the live grants.
-- ---------------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA hostiggo_testing_schema TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA hostiggo_testing_schema TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA hostiggo_testing_schema TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA hostiggo_testing_schema GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hostiggo_testing_schema GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hostiggo_testing_schema GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

GRANT ALL ON
  hostiggo_testing_schema.addons,
  hostiggo_testing_schema.amenities,
  hostiggo_testing_schema.arrival_reminder_view,
  hostiggo_testing_schema.booking_addons,
  hostiggo_testing_schema.booking_status,
  hostiggo_testing_schema.calendar_events,
  hostiggo_testing_schema.calendars,
  hostiggo_testing_schema.categories,
  hostiggo_testing_schema.chat_messages,
  hostiggo_testing_schema.chat_moderation,
  hostiggo_testing_schema.external_taxonomy_map,
  hostiggo_testing_schema.feedback,
  hostiggo_testing_schema.hostiggo_coupons,
  hostiggo_testing_schema.import_batches,
  hostiggo_testing_schema.listing_addons,
  hostiggo_testing_schema.listing_addresses,
  hostiggo_testing_schema.listing_amenities,
  hostiggo_testing_schema.listing_bedrooms,
  hostiggo_testing_schema.listing_calendar,
  hostiggo_testing_schema.listing_discounts,
  hostiggo_testing_schema.listing_house_rules,
  hostiggo_testing_schema.listing_ical_feeds,
  hostiggo_testing_schema.listing_imports,
  hostiggo_testing_schema.listing_media,
  hostiggo_testing_schema.listing_safety,
  hostiggo_testing_schema.listing_safety_details,
  hostiggo_testing_schema.listing_search_view,
  hostiggo_testing_schema.listing_status,
  hostiggo_testing_schema.listings,
  hostiggo_testing_schema.locations,
  hostiggo_testing_schema.login_events,
  hostiggo_testing_schema.notification_preferences,
  hostiggo_testing_schema.notification_templates,
  hostiggo_testing_schema.notifications,
  hostiggo_testing_schema.payment_gateways,
  hostiggo_testing_schema.pricing_rules,
  hostiggo_testing_schema.property_types,
  hostiggo_testing_schema.review,
  hostiggo_testing_schema.safety_features,
  hostiggo_testing_schema.state_language_map,
  hostiggo_testing_schema.stay_types,
  hostiggo_testing_schema.user_bookings_detailed,
  hostiggo_testing_schema.video_verification,
  hostiggo_testing_schema.video_verification_table,
  hostiggo_testing_schema.wishlists
TO anon, authenticated;

GRANT SELECT ON hostiggo_testing_schema.host TO anon, authenticated;
GRANT SELECT ON hostiggo_testing_schema.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hostiggo_testing_schema.users TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. Realtime + storage
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; skipping realtime tables';
    return;
  end if;
  foreach t in array array['listings','review','bookings','listing_media','chat_messages','listing_calendar','notifications','notification_preferences'] loop
    begin
      execute format('alter publication supabase_realtime add table hostiggo_testing_schema.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found; skipping buckets';
    return;
  end if;
  insert into storage.buckets (id, name, public) values
    ('homestay photos', 'homestay photos', true),
    ('homestay-photos', 'homestay-photos', true),
    ('profile-images', 'profile-images', true),
    ('identity-documents', 'identity-documents', false),
    ('frontend_images', 'frontend_images', false),
    ('property-video-verification', 'property-video-verification', false)
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 13. Scheduled jobs (pg_cron)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron not installed; skipping scheduled jobs';
    return;
  end if;
  -- 'sync-hostigo-calendars' was a placeholder posting to YOUR_GO_SERVICE_URL
  -- every 5 minutes; ical_cron_tick replaces it.
  perform cron.unschedule(jobid) from cron.job where jobname in ('sync-hostigo-calendars', 'ical-sync-15s');
  perform cron.schedule('ical-sync-15s', '15 seconds', 'select hostiggo_testing_schema.ical_cron_tick()');
  perform cron.schedule('process-pending-delistings', '*/15 * * * *', 'select hostiggo_testing_schema.process_pending_delistings()');
end $$;

-- 'arrival-reminder-job' is NOT created here: it embeds a service-role key, and
-- secrets don't belong in a repo. It already exists on the live project. To
-- recreate it elsewhere, run once in the SQL editor with real values:
--
--   select cron.schedule('arrival-reminder-job', '*/5 * * * *', $job$
--     select net.http_post(
--       url := 'https://<project-ref>.supabase.co/functions/v1/arrival-reminder',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer <SERVICE_ROLE_KEY>'));
--   $job$);
