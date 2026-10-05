-- ============================================================================
-- admin_alerts: operational alerts written by src/lib/services/adminAlerts.ts
-- (e.g. WhatsApp Business Account disabled by Meta, Twilio 63112). Server-only:
-- written and read with the service role.
-- ============================================================================

create table if not exists hostiggo_testing_schema.admin_alerts (
  id bigint generated always as identity primary key,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  category text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_alerts_created_at_idx
  on hostiggo_testing_schema.admin_alerts(created_at desc);
create index if not exists admin_alerts_unresolved_idx
  on hostiggo_testing_schema.admin_alerts(category, created_at desc) where resolved_at is null;

alter table hostiggo_testing_schema.admin_alerts enable row level security;
grant all on hostiggo_testing_schema.admin_alerts to service_role;
