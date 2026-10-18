-- Tidy the schema so the repo matches the hosted project and nothing is kept twice.
--
-- 1. member_profile_answers was created by hand on the hosted project, so no earlier migration
--    makes it. A fresh or local database needs it: the questionnaire and profile read and write it.
--    "if not exists" keeps this harmless on the hosted project, which already has it. The unique
--    pair backs the profile route's upsert (onConflict: member_id,question_key).
-- 2. hope_calls (v2 daily-call queue) was also made by hand and nothing uses it. Dropped; a
--    migration can bring it back with the cron.
-- 3. call_requests is replaced by opportunities of type 'wants_contact'
--    (specs/06-notifications/conversation-to-visit.md). visits.call_request_id goes with it;
--    visits.opportunity_id already links a visit to what asked for it.

create table if not exists member_profile_answers (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references family_members(id) on delete cascade,
  question_key  text not null
                  check (question_key in ('with_elder', 'interests', 'skills', 'talk_about', 'wish', 'logistics')),
  answer_text   text not null,
  updated_at    timestamptz not null default now(),
  unique (member_id, question_key)
);

-- Only the server (service role) reads and writes answers; the browser's key may not.
alter table member_profile_answers enable row level security;

drop table if exists hope_calls;

alter table visits drop column if exists call_request_id;
drop table if exists call_requests;
