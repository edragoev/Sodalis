-- family_members (specs/01-database/schema.md). Members join an elder through
-- phone linking, so there is no seed list. Deleting a senior removes their family.

create table family_members (
  id                    uuid primary key default gen_random_uuid(),
  senior_id             uuid not null references seniors(id) on delete cascade,
  name                  text not null,
  relationship          text,
  phone                 text,
  fcm_token             text,
  google_refresh_token  text,
  manual_availability   jsonb not null default '{}',
  calendar_connected    boolean not null default false,
  joined_at             timestamptz not null default now()
);

create index family_members_senior_idx on family_members (senior_id);

alter table family_members enable row level security;
create policy "anon read family_members" on family_members for select to anon using (true);
