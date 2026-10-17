-- Demo data for the Sodalis dashboard. Fake data only.
-- Creates one elder (Margaret, +14155550100) with check-ins, an alert and a call request.
-- Family members are NOT seeded: join through the app using the number above.
-- Safe to re-run.

insert into seniors (name, phone_e164, timezone)
values ('Margaret Hayes', '+14155550100', 'America/New_York')
on conflict (phone_e164) do nothing;

with s as (select id from seniors where phone_e164 = '+14155550100')
insert into check_ins (senior_id, vapi_call_id, started_at, ended_at, duration_s, status, summary, mood_score, mood_label, topics, engagement_score)
select s.id, v.call_id, now() - v.ago, now() - v.ago + interval '6 minutes', 360, 'completed', v.summary, v.mood, v.label, v.topics, v.eng
from s, (values
  ('demo-call-1', interval '6 days', 'Margaret was chatty about her tomato plants and a new neighbour.', 0.6,  'cheerful', array['gardening','neighbours'], 0.8),
  ('demo-call-2', interval '5 days', 'Quiet day. Mentioned her knee was sore on the stairs.',          -0.1, 'tired',    array['health','knee'],          0.5),
  ('demo-call-3', interval '4 days', 'Enjoyed a visit from the postman and baked bread.',               0.4,  'content',  array['baking'],                 0.7),
  ('demo-call-4', interval '2 days', 'Lonely this week. Wished her grandchildren would call.',          -0.5, 'lonely',   array['family','loneliness'],    0.6),
  ('demo-call-5', interval '3 hours', 'Her zucchini are out of control and she wants to give some away.', 0.5, 'cheerful', array['gardening','cooking'],   0.9)
) as v(call_id, ago, summary, mood, label, topics, eng)
on conflict (vapi_call_id) do nothing;

with s as (select id from seniors where phone_e164 = '+14155550100'),
     c as (select id from check_ins where vapi_call_id = 'demo-call-4')
insert into alerts (senior_id, check_in_id, type, severity, message)
select s.id, c.id, 'low_mood', 'warn', 'Margaret sounded lonely on Tuesday''s call.'
from s, c
where not exists (select 1 from alerts a where a.senior_id = s.id and a.type = 'low_mood');

with s as (select id from seniors where phone_e164 = '+14155550100'),
     c as (select id from check_ins where vapi_call_id = 'demo-call-4')
insert into call_requests (senior_id, check_in_id, reason, urgency, status)
select s.id, c.id, 'Would love a call from one of the grandchildren.', 'normal', 'pending'
from s, c
where not exists (select 1 from call_requests r where r.senior_id = s.id and r.status = 'pending');
