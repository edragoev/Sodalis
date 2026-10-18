-- alerts for Soladis's in-call flag_concern tool (specs/08-agents/hope-tools.md).
--
-- 1. vapi_call_id: flag_concern saves its alert while the call is still going, before the check-in
--    exists, so the alert remembers Vapi's call id. When the end-of-call report arrives, the webhook
--    sets check_in_id on the alerts with that call id; the post-call extraction can use it to skip a
--    concern that was already raised.
-- 2. type 'safety': flag_concern sends health or safety. Both are urgent; type records which kind.
--    The hosted table may have no type rule at all, so the old one is dropped only if it exists.

alter table alerts add column if not exists vapi_call_id text;

create index if not exists alerts_vapi_call_idx on alerts (vapi_call_id) where vapi_call_id is not null;

alter table alerts drop constraint if exists alerts_type_check;
alter table alerts add constraint alerts_type_check
  check (type in ('low_mood', 'health', 'safety', 'missed_checkin', 'wants_contact'));
