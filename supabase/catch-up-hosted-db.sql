-- Sodalis: catch-up script for the HOSTED Supabase project.
--
-- Your hosted database was set up before these migrations existed, so some are already there
-- (000000 to 000400). This runs only what is MISSING, in order, and is safe to run twice:
--   000500  family_members.pronouns
--   000600  the confirm_opportunity_slot function (the visits table already exists)
--   000700  seniors.pronouns
--   000800  seniors.birthday / interests / skills
--   000900  agent_runs table, then realtime + read-only access for the dashboard
--
-- How: Supabase dashboard > SQL Editor > New query > paste ALL of this > Run.
-- It runs as one transaction: if anything fails, nothing is changed, and you can send the message.

-- ===================== 000500 member_pronouns =====================
-- family_members.pronouns (specs/01-database/schema.md). Free text, set by the
-- member and never inferred; null means agents default to they/them.

alter table family_members add column if not exists pronouns text;

-- Anon only gets column-level SELECT on family_members (see 20261017000400); the dashboard
-- shows pronouns, and they are not sensitive.
grant select (pronouns) on family_members to anon;

-- ===================== 000600 visits_confirm (without "create table visits") =====================
-- One live visit per opportunity. A cancelled one can be replaced. This also backs up the
-- function below: even a bug there could not book the same idea twice.
create unique index if not exists visits_one_live_per_opportunity
  on visits (opportunity_id)
  where opportunity_id is not null and status <> 'cancelled';

alter table visits enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'visits' and policyname = 'anon read visits') then
    create policy "anon read visits" on visits for select to anon using (true);
  end if;
end $$;

-- First accept wins. One call claims the opportunity and books the visit in a single
-- transaction, so there is never a claim without a visit (or the reverse).
--
-- The row lock on the opportunity is what serializes racers: the second caller waits for the
-- first to commit, then sees status 'confirmed' and is told who got there first. It is the
-- same guarantee as `UPDATE ... WHERE status = 'proposed'`, with the visit insert included.
--
-- Returns { outcome, visit_id?, covered_by? }; outcome is one of confirmed, already_covered,
-- not_open, slot_not_found, not_family, not_found.
create or replace function confirm_opportunity_slot(p_opportunity_id uuid, p_slot_id text, p_member_id uuid)
returns jsonb
language plpgsql
as $$
declare
  opp       opportunities%rowtype;
  slot      jsonb;
  v_senior  uuid;
  v_starts  timestamptz;
  v_kind    text;
  v_visit   uuid;
begin
  select * into opp from opportunities where id = p_opportunity_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select senior_id into v_senior from family_members where id = p_member_id;
  if v_senior is distinct from opp.senior_id then
    return jsonb_build_object('outcome', 'not_family');
  end if;

  select s into slot from jsonb_array_elements(opp.proposed_slots) s where s ->> 'id' = p_slot_id limit 1;

  if opp.status = 'confirmed' then
    -- A retry by the winner for the same slot succeeds again with the same visit.
    if opp.accepted_by = p_member_id and slot is not null then
      select id into v_visit from visits
        where opportunity_id = opp.id and member_id = p_member_id and status <> 'cancelled'
          and starts_at = (slot ->> 'starts_at')::timestamptz;
      if v_visit is not null then
        return jsonb_build_object('outcome', 'confirmed', 'visit_id', v_visit);
      end if;
    end if;
    return jsonb_build_object(
      'outcome', 'already_covered',
      'covered_by', (select name from family_members where id = opp.accepted_by)
    );
  end if;

  if opp.status <> 'proposed' then
    return jsonb_build_object('outcome', 'not_open');
  end if;

  if slot is null then
    return jsonb_build_object('outcome', 'slot_not_found');
  end if;

  v_starts := (slot ->> 'starts_at')::timestamptz;
  v_kind := coalesce(opp.suggested_kind, 'visit');

  insert into visits (senior_id, member_id, kind, starts_at, ends_at, status, opportunity_id)
  values (
    opp.senior_id, p_member_id, v_kind, v_starts,
    v_starts + case v_kind when 'call' then interval '30 minutes' else interval '1 hour' end,
    'confirmed', opp.id
  )
  returning id into v_visit;

  update opportunities set status = 'confirmed', accepted_by = p_member_id where id = opp.id;

  return jsonb_build_object('outcome', 'confirmed', 'visit_id', v_visit);
end;
$$;

-- Only the server (service role) may confirm; the dashboard's anon key may not.
revoke execute on function confirm_opportunity_slot(uuid, text, uuid) from public, anon, authenticated;
grant execute on function confirm_opportunity_slot(uuid, text, uuid) to service_role;

-- ===================== 000700 senior_pronouns =====================
-- Pronouns for the elder, asked when a family member sets them up (e.g. 'she/her').
-- Hope and the dashboard can use this to refer to them correctly. Null means not given.
alter table seniors add column if not exists pronouns text;

-- ===================== 000800 senior_profile =====================
-- What a family member tells us about the elder when setting up their profile, so Hope and the
-- coordinator know them (specs/01-database/schema.md: seniors.notes already holds free text
-- "things to know"). birthday is a plain date; interests and skills are short lowercase tags.
alter table seniors
  add column if not exists birthday  date,
  add column if not exists interests text[] not null default '{}',
  add column if not exists skills    text[] not null default '{}';

-- ===================== 000900 agent_runs =====================
-- agent_runs (specs/08-agents/coordinator-agent.md "Why Danny?" trace): one row per coordinator run.
-- v1 stores the Gemini input in `args` and the decision in `result`; v2 may write one row per step.

create table if not exists agent_runs (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  step            int not null default 1,
  tool            text not null,
  args            jsonb not null default '{}',
  result          jsonb not null default '{}',
  model_text      text,
  used_fallback   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists agent_runs_opportunity_idx on agent_runs (opportunity_id, created_at desc);

-- The dashboard reads the trace with the anon key; only the server writes it.
alter table agent_runs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_runs' and policyname = 'anon read agent_runs') then
    create policy "anon read agent_runs" on agent_runs for select to anon using (true);
  end if;
end $$;

-- Realtime for the dashboard trace, if the publication exists (it is created with the project).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_runs') then
      alter publication supabase_realtime add table agent_runs;
    end if;
  end if;
end $$;

-- ===================== 000900 dashboard_realtime =====================
-- The dashboard uses the anon key for SELECT-only reads and realtime updates.
-- agent_runs is part of the documented dashboard schema but was missing from migrations.
create table if not exists agent_runs (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid references opportunities(id) on delete cascade,
  step            text,
  tool            text,
  args            jsonb,
  result          jsonb,
  model_text       text,
  used_fallback   boolean,
  created_at      timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'call_requests',
    'check_ins',
    'alerts',
    'visits',
    'agent_runs',
    'opportunities'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('grant select on public.%I to anon', table_name);
      execute format('revoke insert, update, delete, truncate on public.%I from anon', table_name);

      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = table_name
          and cmd = 'SELECT'
          and roles @> array['anon']::name[]
      ) then
        execute format(
          'create policy "anon read dashboard" on public.%I for select to anon using (true)',
          table_name
        );
      end if;

      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end if;
  end loop;
end
$$;
