-- Brings the schema in line with the v1/v2 spec update (specs/01-database/schema.md,
-- specs/08-agents/hope-tools.md).

-- 1. Opportunities Hope creates mid-call --------------------------------------------------------
-- propose_visit runs while the call is live, before the check-in row exists. The opportunity is tied
-- to the call by check_in_vapi_call_id; the webhook fills in check_in_id afterwards.
alter table opportunities alter column check_in_id drop not null;

alter table opportunities
  add column source text not null default 'extraction'
    check (source in ('extraction', 'hope_tool')),
  add column check_in_vapi_call_id text;

alter table opportunities
  add constraint opportunities_has_call
    check (check_in_id is not null or check_in_vapi_call_id is not null);

-- propose_visit is idempotent per call + member + type. "No member named" counts as one slot,
-- so a retried tool call cannot create a second row.
create unique index opportunities_call_member_type_uidx
  on opportunities (
    check_in_vapi_call_id,
    type,
    coalesce(mentioned_member_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where check_in_vapi_call_id is not null;

-- 2. Family member profiles ---------------------------------------------------------------------
-- v1 seeds the tags directly; v2 fills them from the questionnaire.
alter table family_members
  add column interests              text[] not null default '{}',
  add column skills                 text[] not null default '{}',
  add column activities_with_elder  text[] not null default '{}',
  add column conversation_topics    text[] not null default '{}',
  add column constraints            jsonb  not null default '{}',
  add column profile_summary        text,
  add column profile_updated_at     timestamptz;

-- Members join one by one, so two simultaneous joins must not create a duplicate.
create unique index family_members_senior_name_uidx on family_members (senior_id, lower(name));

-- 3. Keep credentials away from the anon key ----------------------------------------------------
-- The dashboard reads with the anon key, so anything anon can SELECT is public. FCM tokens and
-- Google refresh tokens are credentials: only the service role may read them.
-- NOTE: any column added to family_members later must be granted here if the dashboard needs it.
revoke select on family_members from anon;
grant select (
  id, senior_id, name, relationship, phone, manual_availability, calendar_connected, joined_at,
  interests, skills, activities_with_elder, conversation_topics, constraints,
  profile_summary, profile_updated_at
) on family_members to anon;
