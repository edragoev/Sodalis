-- agent_runs (specs/08-agents/coordinator-agent.md "Why Danny?" trace): one row per coordinator run.
-- v1 stores the Gemini input in `args` and the decision in `result`; v2 may write one row per step.

create table agent_runs (
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

create index agent_runs_opportunity_idx on agent_runs (opportunity_id, created_at desc);

-- The dashboard reads the trace with the anon key; only the server writes it.
alter table agent_runs enable row level security;
create policy "anon read agent_runs" on agent_runs for select to anon using (true);

-- Realtime for the dashboard trace, if the publication exists (it is created with the project).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table agent_runs;
  end if;
end $$;
