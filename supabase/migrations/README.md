# Database migrations

There is **one** migration: `20261007000001_baseline.sql`. It is the whole
database (schema, enums, tables, foreign keys, indexes, views, functions,
triggers, grants, realtime tables, storage buckets and cron jobs), captured from
the live project and fixed where the live version was broken. The list of fixes
is at the top of the file.

It is idempotent, so it is safe on an empty database and on the live one.

## Applying it

- **New database:** `supabase db push` (or paste the file into the SQL editor).
- **The existing live project:** its migration history (`supabase_migrations.
  schema_migrations`) lists 24 versions that no longer exist in this repo, so
  `supabase db push` will refuse until the history is reconciled. Either run the
  file once in the SQL editor, or mark the old versions as reverted first:
  `supabase migration repair --status reverted <version> ...`, then push.

## Not in the migration, on purpose

- **Row Level Security / policies.** Out of scope for the MVP. The live project
  still has the policies it had; this file neither adds nor removes them. On a
  fresh database there is no RLS, so the sensitive tables (KYC, bank, payout,
  payment) are granted to the service role only, and the browser can't reach them.
- **Secrets.** The `arrival-reminder-job` cron job carries a service-role key, so
  it is created by hand. A template is at the bottom of the baseline file.
- **One-time settings.** The 15-second iCal sync is a no-op until you run, once
  as an admin:
  ```sql
  ALTER DATABASE postgres SET app.ical_sync_url    = 'https://<your-site>/api/cron/ical-sync';
  ALTER DATABASE postgres SET app.ical_sync_secret = '<same value as CRON_SECRET>';
  ```
- **Unique users.** `users_email_unique_idx`, `users_phone_unique_idx` and the
  email-or-phone check from the old `atomic_users_constraints` migration were
  never applied, and the live data has duplicate email/phone rows, so they can't
  be created yet. Resolve the duplicates, then add them in a new migration.

## Adding changes later

Add a new file with a later timestamp, e.g. `20261101000001_add_thing.sql`. Keep
statements idempotent (`if not exists`, `create or replace`) and name the schema
explicitly. The schema name is read from `NEXT_PUBLIC_DB_SCHEMA` (default
`hostiggo_testing_schema`); the SQL names it explicitly, so renaming it for
production means a find/replace in the baseline.
