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
