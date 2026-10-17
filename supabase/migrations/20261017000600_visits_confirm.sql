-- visits and confirm_opportunity_slot (specs/01-database/schema.md, 06-notifications section 7).
-- A visit is a visit or call a family member agreed to. visits.call_request_id comes with the
-- call_requests table, which does not exist yet.

create table visits (
  id                  uuid primary key default gen_random_uuid(),
  senior_id           uuid not null references seniors(id) on delete cascade,
  member_id           uuid not null references family_members(id) on delete cascade,
  kind                text not null check (kind in ('visit', 'call')),
  starts_at           timestamptz not null,
  ends_at             timestamptz,
  status              text not null default 'proposed'
                        check (status in ('proposed', 'confirmed', 'completed', 'cancelled')),
  score               numeric,
  score_breakdown     jsonb,
  -- The visit outlives its opportunity: deleting the idea must not erase the booking.
  opportunity_id      uuid references opportunities(id) on delete set null,
  outcome_engagement  numeric,
  created_at          timestamptz not null default now()
);

create index visits_senior_starts_idx on visits (senior_id, starts_at);

-- One live visit per opportunity. A cancelled one can be replaced. This also backs up the
-- function below: even a bug there could not book the same idea twice.
create unique index visits_one_live_per_opportunity
  on visits (opportunity_id)
  where opportunity_id is not null and status <> 'cancelled';

alter table visits enable row level security;
create policy "anon read visits" on visits for select to anon using (true);

-- First accept wins. One call claims the opportunity and books the visit in a single
-- transaction, so there is never a claim without a visit (or the reverse).
--
-- The row lock on the opportunity is what serializes racers: the second caller waits for the
-- first to commit, then sees status 'confirmed' and is told who got there first. It is the
-- same guarantee as `UPDATE ... WHERE status = 'proposed'`, with the visit insert included.
--
-- Returns { outcome, visit_id?, covered_by? }; outcome is one of confirmed, already_covered,
-- not_open, slot_not_found, not_family, not_found.
create function confirm_opportunity_slot(p_opportunity_id uuid, p_slot_id text, p_member_id uuid)
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
