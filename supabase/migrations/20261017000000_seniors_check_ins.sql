-- First slice of the schema (specs/01-database/schema.md): seniors and check_ins.
-- The remaining tables, realtime publication and policies come in later migrations.

create table seniors (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  phone_e164         text not null unique,
  timezone           text not null default 'UTC',
  preferred_windows  jsonb not null default '[]',
  hope_call_windows  jsonb not null default '[]',
  notes              text,
  created_at         timestamptz not null default now()
);

create table check_ins (
  id                uuid primary key default gen_random_uuid(),
  senior_id         uuid not null references seniors(id) on delete cascade,
  vapi_call_id      text not null unique, -- idempotency: Vapi retries webhooks
  started_at        timestamptz not null,
  ended_at          timestamptz,
  duration_s        integer,
  status            text not null default 'completed'
                      check (status in ('completed', 'no_answer', 'failed')),
  transcript        text,
  summary           text,
  mood_score        numeric check (mood_score between -1 and 1),
  mood_label        text,
  topics            text[] not null default '{}',
  engagement_score  numeric check (engagement_score between 0 and 1),
  flags             jsonb not null default '{}',
  raw_extraction    jsonb,
  created_at        timestamptz not null default now()
);

create index check_ins_senior_started_at_idx on check_ins (senior_id, started_at desc);

-- No auth: the dashboard reads with the anon key; all writes use the service role.
alter table seniors   enable row level security;
alter table check_ins enable row level security;
create policy "anon read seniors"   on seniors   for select to anon using (true);
create policy "anon read check_ins" on check_ins for select to anon using (true);
