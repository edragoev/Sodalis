-- opportunities (specs/06-notifications/conversation-to-visit.md): things a call
-- suggests a family member could do for the elder (bring zucchini, play cards).

create table opportunities (
  id                    uuid primary key default gen_random_uuid(),
  senior_id             uuid not null references seniors(id) on delete cascade,
  check_in_id           uuid not null references check_ins(id) on delete cascade,
  type                  text not null
                          check (type in ('gift_errand', 'activity', 'event', 'wants_contact')),
  summary               text not null,
  quote                 text,
  mentioned_member_id   uuid references family_members(id) on delete set null,
  mentioned_item        text,
  interest_tags         text[] not null default '{}',
  target_date           date,
  urgency               text not null default 'normal'
                          check (urgency in ('low', 'normal', 'high')),
  confidence            numeric check (confidence between 0 and 1),
  suggested_kind        text check (suggested_kind in ('visit', 'call')),
  notified_member_ids   uuid[] not null default '{}',
  proposed_slots        jsonb not null default '[]',
  status                text not null default 'detected'
                          check (status in ('detected', 'proposed', 'confirmed', 'declined', 'expired')),
  accepted_by           uuid references family_members(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index opportunities_senior_idx on opportunities (senior_id, created_at desc);

alter table opportunities enable row level security;
create policy "anon read opportunities" on opportunities for select to anon using (true);
