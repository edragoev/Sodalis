-- One rule for alerts.type that both alert writers fit.
--
-- 000100 (flag_concern) and 000150 (wellbeing) each replaced alerts_type_check with their own list:
-- the first allows 'safety' but not 'wellbeing', the second the other way round. Whichever ran last
-- won, so one writer's alerts were refused. This runs after both and allows every type.

alter table alerts drop constraint if exists alerts_type_check;
alter table alerts add constraint alerts_type_check
  check (type in ('low_mood', 'health', 'safety', 'missed_checkin', 'wants_contact', 'wellbeing'));
