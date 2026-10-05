# Database migrations

Migrations are applied in filename order (`supabase db push` or the SQL editor).

- `20260901000003` … `20260901000005` are the incremental migrations that used
  to live in `/migrations` (copied here so the Supabase CLI tracks them).
  `/migrations` is kept only as the original reference copy.
- **Not in the repo yet:** the baseline schema (tables 001–002 and the
  `hostiggo_testing_schema` itself were created in the Supabase dashboard).
  Before launch, capture it with `supabase db dump --schema hostiggo_testing_schema -f supabase/migrations/20260901000000_baseline.sql`
  and commit it, otherwise the database cannot be rebuilt from this repo.
- The schema name is read from `NEXT_PUBLIC_DB_SCHEMA` (default
  `hostiggo_testing_schema`). The SQL files still name the schema explicitly,
  so renaming it for production means a find/replace in them too.
