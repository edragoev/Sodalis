-- calendar_events (specs/10-calendar/google-calendar-import.md): events a member imported from a
-- Google Calendar .ics/.zip export. Times are UTC. A recurring series is one row holding the raw
-- RRULE; occurrences are expanded when read.
-- Served only through the API (service role): no anon policy, because notes can be personal.

create table calendar_events (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references family_members(id) on delete cascade,
  uid              text not null,
  -- UTC of the overridden occurrence, for an edited single instance of a series. Null otherwise.
  recurrence_id    timestamptz,
  title            text not null,
  notes            text,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  all_day          boolean not null default false,
  rrule            text,
  exdates          timestamptz[] not null default '{}',
  -- IANA zone the event was created in, so a recurrence keeps its wall-clock time across DST.
  source_tz        text not null default 'UTC',
  source           text not null default 'ics_import',
  import_batch_id  uuid not null,
  created_at       timestamptz not null default now(),
  -- Re-importing the same export updates rows instead of duplicating them.
  constraint calendar_events_identity unique nulls not distinct (member_id, uid, recurrence_id)
);

create index calendar_events_member_starts_idx on calendar_events (member_id, starts_at);
create index calendar_events_batch_idx on calendar_events (import_batch_id);

alter table calendar_events enable row level security;
