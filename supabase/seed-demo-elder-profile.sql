-- Margaret's profile (pronouns, birthday, interests, skills, notes) for the demo elder.
-- Run this ONLY after migrations 20261017000700_senior_pronouns.sql and
-- 20261017000800_senior_profile.sql are applied; otherwise these columns don't exist and
-- the statement fails. Safe to re-run. Fake data only.
update seniors set
  pronouns  = 'she/her',
  birthday  = '1948-03-14',
  interests = array['gardening', 'cooking', 'cards', 'old movies'],
  skills    = array['baking', 'knitting', 'storytelling'],
  notes     = 'Naps after lunch. Hard of hearing on the left, so speak clearly. Loves her cat, Biscuit, and her tomato plants.'
where phone_e164 = '+14155550100';
