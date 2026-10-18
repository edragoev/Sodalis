-- Wellbeing alerts: structured concerns extracted from a finished call
-- (specs/03-ai/hope-persona.md "Wellbeing alerts", specs/01-database/schema.md).
--
-- The dashboard keeps reading alerts.type / severity / message, so those stay filled in. The new
-- columns carry what the family needs to act: the elder's own words, the support indicated and the
-- app's routing signal (routine / needs_review / urgent), which is not a medical judgement.

alter table alerts
  add column if not exists category            text
    check (category in ('loneliness', 'emotional_wellbeing', 'physical_incident', 'daily_living', 'family_support', 'other')),
  add column if not exists quote               text,
  add column if not exists support_needed      text,
  add column if not exists suggested_followup  text,
  add column if not exists safety              text
    check (safety in ('routine', 'needs_review', 'urgent')),
  add column if not exists confidence          numeric
    check (confidence >= 0 and confidence <= 1),
  add column if not exists source              text not null default 'call';

-- daily_living and other concerns are neither mood, health nor a contact request.
alter table alerts drop constraint if exists alerts_type_check;
alter table alerts add constraint alerts_type_check
  check (type in ('low_mood', 'health', 'missed_checkin', 'wants_contact', 'wellbeing'));

-- One alert per quote per call, so a repeated run cannot post the same concern twice.
create unique index if not exists alerts_wellbeing_quote_idx
  on alerts (check_in_id, lower(quote)) where source = 'wellbeing';

-- Marker for the wellbeing extraction: { status: 'ok', ... } or { status: 'failed', reason, quota, retry_after_ms }.
-- Kept apart from raw_extraction, which belongs to the event planner.
alter table check_ins add column if not exists wellbeing_extraction jsonb;
