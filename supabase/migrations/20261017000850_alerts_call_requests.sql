-- alerts and call_requests (specs/01-database/schema.md).
--
-- These two tables were created by hand on the hosted project, so no earlier migration makes them.
-- A fresh or local database needs them: the dashboard reads both, and the call webhook is meant to
-- write them (a flag from a call becomes an alert; "wants a call from Maya" becomes a call request).
--
-- "if not exists" keeps this harmless on the hosted project, which already has them. Their
-- columns match what is there. A fresh database gets two sensible rules the hosted tables lack:
-- the values the spec lists for type, severity and status, and no row without a senior.
-- Realtime and read-only access for the dashboard come from 20261017001000_dashboard_realtime.sql,
-- which runs after this one.

create table if not exists alerts (
  id               uuid primary key default gen_random_uuid(),
  senior_id        uuid not null references seniors(id) on delete cascade,
  check_in_id      uuid references check_ins(id) on delete set null,
  type             text not null
                     check (type in ('low_mood', 'health', 'missed_checkin', 'wants_contact')),
  severity         text not null default 'info'
                     check (severity in ('info', 'warn', 'urgent')),
  message          text not null,
  acknowledged_by  uuid references family_members(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists alerts_senior_created_idx on alerts (senior_id, created_at desc);

create table if not exists call_requests (
  id                uuid primary key default gen_random_uuid(),
  senior_id         uuid not null references seniors(id) on delete cascade,
  check_in_id       uuid references check_ins(id) on delete set null,
  -- null means "anyone in the family"
  target_member_id  uuid references family_members(id) on delete set null,
  reason            text,
  urgency           text,
  status            text not null default 'pending'
                      check (status in ('pending', 'accepted', 'declined', 'done')),
  accepted_by       uuid references family_members(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists call_requests_pending_idx on call_requests (status) where status = 'pending';

-- Only the server (service role) writes these; the browser's key may not.
alter table alerts enable row level security;
alter table call_requests enable row level security;
